/* ==========================================================
   DASHBOARD.JS — realtime, role-based, Firebase-backed
========================================================== */

import { db } from "../firebase/firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
  guardAndLoadUser,
  renderNav,
  setupUserMenu,
  setupSidebarToggle,
  initTheme,
  getCurrentUser,
  $,
} from "../js/layout.js";

import {
  checkPermission,
  MODULES,
  ACTIONS,
  getCurrentRole,
} from "../js/permissions.js";

(function () {
  "use strict";

  /* =========================================================
     SCHEMA CONFIG
     ---------------------------------------------------------
     Only edit THIS block if your actual Firestore collection
     or field names are different. Nothing else needs to
     change — every render function below reads through
     these constants.
  ========================================================= */
  const COLLECTIONS = {
    EMPLOYEES: "employees",
    DEPARTMENTS: "departments", // optional; falls back to grouping EMPLOYEES by department field if missing/empty
    ATTENDANCE: "attendance", // one doc per employee per day
    LEAVES: "leaveRequests",
    ACTIVITY: "activityLogs",
  };

  const EMP_FIELDS = {
    name: "fullName",
    department: "department", // string name, must match DEPARTMENTS.name if that collection is used
    status: "status", // "active" | "on_leave" | "inactive"
    photo: "photoURL",
    dob: "dateOfBirth", // Firestore Timestamp
    joinDate: "joiningDate", // Firestore Timestamp
  };

  const DEPT_FIELDS = { name: "name", color: "color" };

  const ATT_FIELDS = {
    employeeId: "employeeId",
    employeeName: "employeeName",
    date: "date", // Firestore Timestamp (stored at midnight of that day)
    status: "status", // "present" | "absent" | "leave"
  };

  const LEAVE_FIELDS = {
    employeeId: "employeeId",
    employeeName: "employeeName",
    status: "status", // "pending" | "approved" | "rejected"
    startDate: "startDate", // Timestamp
    endDate: "endDate", // Timestamp
  };

  const ACTIVITY_FIELDS = {
    title: "title",
    desc: "desc",
    type: "type", // "success" | "info" | "muted" -> status dot color
    photo: "photoURL",
    icon: "icon", // fallback remix icon class when no photo
    createdAt: "createdAt", // Timestamp
  };

  const DEPT_COLORS = [
    "#3b82f6",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
  ];

  /* =========================================================
     STATIC UI DATA (kept as-is — presentational only, not
     tied to any collection)
  ========================================================= */
  const QUICK_ACTIONS = [
    {
      label: "Add Employee",
      icon: "ri-user-add-line",
      color: "blue",
      module: MODULES.EMPLOYEES,
      action: ACTIONS.CREATE,
    },
    {
      label: "Add Department",
      icon: "ri-building-4-line",
      color: "green",
      module: MODULES.DEPARTMENTS,
      action: ACTIONS.CREATE,
    },
    {
      label: "Mark Attendance",
      icon: "ri-calendar-check-line",
      color: "purple",
      module: MODULES.ATTENDANCE,
      action: ACTIONS.EDIT,
    },
    {
      label: "Apply Leave",
      icon: "ri-send-plane-line",
      color: "orange",
      module: MODULES.LEAVE_MANAGEMENT,
      action: ACTIONS.CREATE,
    },
    {
      label: "Generate Report",
      icon: "ri-file-chart-2-line",
      color: "indigo",
      module: MODULES.REPORTS,
      action: ACTIONS.GENERATE,
    },
  ];

  /* =========================================================
     HELPERS
  ========================================================= */
  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isSameMonthDay(a, b) {
    return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function daysUntilNextOccurrence(date) {
    const today = startOfDay(new Date());
    const next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return Math.round((next - today) / 86400000);
  }

  function formatUpcoming(date, label) {
    const days = daysUntilNextOccurrence(date);
    if (days === 0) return `${label} · Today`;
    if (days === 1) return `${label} · Tomorrow`;
    const next = new Date();
    next.setDate(next.getDate() + days);
    return `${label} · ${next.toLocaleDateString("en-GB", { day: "2-digit", month: "long" })}`;
  }

  function timeAgoOrClock(date) {
    const now = new Date();
    if (isSameDay(now, date)) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const diffDays = Math.floor(
      (startOfDay(now) - startOfDay(date)) / 86400000,
    );
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }

  function initialsAvatar(name) {
    const initials = encodeURIComponent((name || "U").slice(0, 2));
    return `https://ui-avatars.com/api/?name=${initials}&background=6c5ce7&color=fff`;
  }

  /* =========================================================
     LIVE STATE
     (populated by realtime listeners, re-rendered on change)
  ========================================================= */
  const state = {
    employees: [],
    departments: [], // [{name, color, count}]
    attendanceToday: [], // records for today
    leaves: [],
    activity: [],
  };

  /* =========================================================
     STAT CARDS
  ========================================================= */
  const sparkCharts = {}; // canvasId -> Chart instance, so we can destroy/redraw on updates

  function computeStats() {
    const totalEmployees = state.employees.length;

    const presentToday = state.attendanceToday.filter(
      (r) => r[ATT_FIELDS.status] === "present",
    ).length;

    const now = startOfDay(new Date());
    const onLeave = state.leaves.filter((l) => {
      if (l[LEAVE_FIELDS.status] !== "approved") return false;
      const start = toDate(l[LEAVE_FIELDS.startDate]);
      const end = toDate(l[LEAVE_FIELDS.endDate]);
      if (!start || !end) return false;
      return startOfDay(start) <= now && now <= startOfDay(end);
    }).length;

    const totalDepartments = state.departments.length;

    return [
      {
        label: "Total Employees",
        value: totalEmployees,
        dir: "up",
        color: "blue",
        icon: "ri-team-line",
      },
      {
        label: "Present Today",
        value: presentToday,
        dir: "up",
        color: "green",
        icon: "ri-user-follow-line",
      },
      {
        label: "On Leave",
        value: onLeave,
        dir: onLeave > 0 ? "down" : "up",
        color: "purple",
        icon: "ri-calendar-close-line",
      },
      {
        label: "Departments",
        value: totalDepartments,
        dir: "up",
        color: "orange",
        icon: "ri-building-2-line",
      },
    ];
  }

  function renderStats() {
    const grid = $("#statsGrid");
    if (!grid) return;

    const stats = computeStats();

    grid.innerHTML = stats
      .map(
        (s, i) => `
      <div class="stat-card">
        <div class="stat-card__top">
          <div class="stat-card__icon ${s.color}"><i class="${s.icon}"></i></div>
          <i class="ri-more-2-fill stat-card__menu"></i>
        </div>
        <p class="stat-card__label">${s.label}</p>
        <p class="stat-card__value">${s.value}</p>
        <div class="stat-card__bottom">
          <span class="stat-card__change ${s.dir}">
            <i class="ri-arrow-${s.dir === "up" ? "up" : "down"}-line"></i>
            Live
          </span>
          <canvas class="stat-card__spark" id="spark-${i}"></canvas>
        </div>
      </div>`,
      )
      .join("");

    stats.forEach((s, i) => {
      const id = `spark-${i}`;
      if (sparkCharts[id]) {
        sparkCharts[id].destroy();
        delete sparkCharts[id];
      }
      renderSparkline(
        id,
        buildSparkHistory(s.label),
        s.dir === "up" ? cssVar("--color-success") : cssVar("--color-error"),
      );
    });
  }

  // Lightweight trend line built from the last 7 days of attendance
  // records (falls back to a flat line while data is still loading).
  function buildSparkHistory(label) {
    if (label !== "Present Today" || !state.attendanceHistory) {
      return new Array(7).fill(0).map((_, i) => i + 1);
    }
    return state.attendanceHistory;
  }

  function renderSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    sparkCharts[canvasId] = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [
          {
            data,
            borderColor: color,
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            fill: true,
            backgroundColor: (ctx) => {
              const { chart } = ctx;
              const { ctx: c, chartArea } = chart;
              if (!chartArea) return null;
              const gradient = c.createLinearGradient(
                0,
                chartArea.top,
                0,
                chartArea.bottom,
              );
              gradient.addColorStop(0, color + "33");
              gradient.addColorStop(1, color + "00");
              return gradient;
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  }

  /* =========================================================
     OVERVIEW LINE CHART (attendance trend, Firestore-backed)
  ========================================================= */
  let overviewChart = null;
  let overviewUnsub = null;
  let currentRange = "month";

  function rangeToStart(range) {
    const now = new Date();
    const start = new Date(now);
    if (range === "week") start.setDate(now.getDate() - 6);
    else if (range === "month") start.setDate(now.getDate() - 29);
    else if (range === "quarter") start.setMonth(now.getMonth() - 3);
    else if (range === "year") start.setMonth(now.getMonth() - 11);
    return startOfDay(start);
  }

  function bucketAttendance(records, range) {
    // Groups raw attendance docs into labeled buckets for the chart.
    const buckets = new Map();
    const dayMs = 86400000;

    records.forEach((r) => {
      const d = toDate(r[ATT_FIELDS.date]);
      if (!d || r[ATT_FIELDS.status] !== "present") return;

      let key;
      if (range === "week" || range === "month") {
        key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      } else {
        key = `${d.getFullYear()}-${d.getMonth()}`; // group by month
      }
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    const labels = [];
    const values = [];
    const now = startOfDay(new Date());

    if (range === "week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * dayMs);
        labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
        values.push(buckets.get(d.toISOString().slice(0, 10)) || 0);
      }
    } else if (range === "month") {
      for (let i = 29; i >= 0; i -= 5) {
        const d = new Date(now.getTime() - i * dayMs);
        labels.push(
          d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        );
        values.push(buckets.get(d.toISOString().slice(0, 10)) || 0);
      }
    } else {
      const monthsBack = range === "quarter" ? 3 : 11;
      for (let i = monthsBack; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString("en-US", { month: "short" }));
        values.push(buckets.get(`${d.getFullYear()}-${d.getMonth()}`) || 0);
      }
    }

    return { labels, values };
  }

  function subscribeOverviewChart(range) {
    currentRange = range;
    if (overviewUnsub) {
      overviewUnsub();
      overviewUnsub = null;
    }

    const start = rangeToStart(range);
    const q = query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where(ATT_FIELDS.date, ">=", Timestamp.fromDate(start)),
      orderBy(ATT_FIELDS.date, "asc"),
    );

    overviewUnsub = onSnapshot(
      q,
      (snap) => {
        const records = snap.docs.map((d) => d.data());
        const { labels, values } = bucketAttendance(records, range);
        drawOverviewChart(labels, values);

        // feed the "Present Today" sparkline off the same data
        state.attendanceHistory = values.slice(-7).length
          ? values.slice(-7)
          : null;
        renderStats();
      },
      (err) =>
        console.error(
          "[dashboard.js] attendance overview listener error:",
          err,
        ),
    );
  }

  function drawOverviewChart(labels, values) {
    const canvas = document.getElementById("overviewChart");
    if (!canvas || typeof Chart === "undefined") return;

    const primary = cssVar("--color-primary") || "#6c5ce7";
    const gridColor = cssVar("--panel-light-border") || "#e5e1f5";
    const textColor = cssVar("--panel-light-text-muted") || "#6b7280";

    if (overviewChart) overviewChart.destroy();

    overviewChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Employees Present",
            data: values,
            borderColor: primary,
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: primary,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            backgroundColor: (ctx) => {
              const { chart } = ctx;
              const { ctx: c, chartArea } = chart;
              if (!chartArea) return null;
              const gradient = c.createLinearGradient(
                0,
                chartArea.top,
                0,
                chartArea.bottom,
              );
              gradient.addColorStop(0, "rgba(108, 92, 231, 0.28)");
              gradient.addColorStop(1, "rgba(108, 92, 231, 0)");
              return gradient;
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: "easeOutQuart" },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1440",
            titleColor: "#fff",
            bodyColor: "#c9c3e8",
            padding: 12,
            cornerRadius: 10,
            displayColors: false,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: "Montserrat", size: 12 },
            },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: "Montserrat", size: 12 },
            },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function setupOverviewRangeDropdown() {
    const dropdown = $("#overviewRangeDropdown");
    if (!dropdown) return;
    const btn = $(".dropdown__btn", dropdown);
    const label = $("#overviewRangeLabel", dropdown);
    const items = dropdown.querySelectorAll(".dropdown__menu li");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    items.forEach((item) => {
      item.addEventListener("click", () => {
        items.forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");
        label.textContent = item.textContent;
        dropdown.classList.remove("open");
        subscribeOverviewChart(item.dataset.range);
      });
    });

    document.addEventListener("click", () => dropdown.classList.remove("open"));
  }

  /* =========================================================
     DEPARTMENT DONUT CHART + LEGEND (from EMPLOYEES, grouped
     live — works whether or not a DEPARTMENTS collection exists)
  ========================================================= */
  let deptChart = null;

  function computeDepartments() {
    if (state.departments.length) {
      // Real DEPARTMENTS collection exists — count employees per dept.
      return state.departments.map((d, i) => ({
        name: d[DEPT_FIELDS.name] || d.name,
        color:
          d[DEPT_FIELDS.color] ||
          d.color ||
          DEPT_COLORS[i % DEPT_COLORS.length],
        count: state.employees.filter(
          (e) => e[EMP_FIELDS.department] === (d[DEPT_FIELDS.name] || d.name),
        ).length,
      }));
    }

    // Fallback: derive department list straight from employees.
    const map = new Map();
    state.employees.forEach((e) => {
      const name = e[EMP_FIELDS.department] || "Unassigned";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].map(([name, count], i) => ({
      name,
      count,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
  }

  function renderDeptChart() {
    const canvas = document.getElementById("deptChart");
    const legend = $("#deptLegend");
    const totalEl = $("#donutTotal");
    if (!canvas || typeof Chart === "undefined") return;

    const departments = computeDepartments().filter((d) => d.count > 0);
    const total = departments.reduce((sum, d) => sum + d.count, 0);
    if (totalEl) totalEl.textContent = total;

    if (legend) {
      legend.innerHTML = departments
        .map((d) => {
          const pct = total ? Math.round((d.count / total) * 100) : 0;
          return `
          <li>
            <span class="legend-dot" style="background:${d.color}"></span>
            <span class="dept-name">${d.name}</span>
            <span class="dept-count">${d.count} (${pct}%)</span>
          </li>`;
        })
        .join("");
    }

    if (deptChart) deptChart.destroy();

    deptChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: departments.map((d) => d.name),
        datasets: [
          {
            data: departments.map((d) => d.count),
            backgroundColor: departments.map((d) => d.color),
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        animation: { animateRotate: true, duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1440",
            titleColor: "#fff",
            bodyColor: "#c9c3e8",
            padding: 10,
            cornerRadius: 10,
          },
        },
      },
    });
  }

  /* =========================================================
     BIRTHDAYS & WORK ANNIVERSARIES (derived from EMPLOYEES)
  ========================================================= */
  function renderBirthdays() {
    const list = $("#birthdaysList");
    if (!list) return;

    const upcoming = [];

    state.employees.forEach((e) => {
      const dob = toDate(e[EMP_FIELDS.dob]);
      const joinDate = toDate(e[EMP_FIELDS.joinDate]);
      const name = e[EMP_FIELDS.name] || "Employee";
      const img = e[EMP_FIELDS.photo] || initialsAvatar(name);

      if (dob) {
        const days = daysUntilNextOccurrence(dob);
        if (days <= 30) {
          upcoming.push({
            name,
            type: "birthday",
            sub: formatUpcoming(dob, "Birthday"),
            emoji: days === 0 ? "🎂" : "🎉",
            img,
            days,
          });
        }
      }

      if (joinDate) {
        const days = daysUntilNextOccurrence(joinDate);
        if (days <= 30) {
          upcoming.push({
            name,
            type: "anniversary",
            sub: formatUpcoming(joinDate, "Work Anniversary"),
            emoji: "🎁",
            img,
            days,
          });
        }
      }
    });

    upcoming.sort((a, b) => a.days - b.days);
    const top = upcoming.slice(0, 6);

    list.innerHTML = top.length
      ? top
          .map(
            (b) => `
      <div class="birthday-item type-${b.type}">
        <img src="${b.img}" alt="${b.name}" />
        <div class="birthday-item__info">
          <p class="name">${b.name}</p>
          <p class="sub">${b.sub}</p>
        </div>
        <span class="birthday-item__emoji">${b.emoji}</span>
      </div>`,
          )
          .join("")
      : `<p class="empty-state">No birthdays or anniversaries in the next 30 days.</p>`;
  }

  /* =========================================================
     QUICK ACTIONS (role-based visibility via permissions.js)
  ========================================================= */
  function renderQuickActions() {
    const wrap = $("#quickActions");
    if (!wrap) return;

    const visible = QUICK_ACTIONS.filter((a) =>
      checkPermission(a.module, a.action),
    );

    wrap.innerHTML = visible.length
      ? visible
          .map(
            (a) => `
      <button type="button" class="quick-action-btn ${a.color}" data-label="${a.label}">
        <i class="${a.icon}"></i>
        <span>${a.label}</span>
        <i class="ri-arrow-right-s-line arrow"></i>
      </button>`,
          )
          .join("")
      : `<p class="empty-state">No quick actions available for your role.</p>`;
  }

  /* =========================================================
     RECENT ACTIVITY (realtime, latest first)
  ========================================================= */
  function renderActivity() {
    const list = $("#activityList");
    if (!list) return;

    if (!state.activity.length) {
      list.innerHTML = `<li class="empty-state">No recent activity yet.</li>`;
      return;
    }

    list.innerHTML = state.activity
      .map((a) => {
        const title = a[ACTIVITY_FIELDS.title] || "Update";
        const desc = a[ACTIVITY_FIELDS.desc] || "";
        const dot = a[ACTIVITY_FIELDS.type] || "info";
        const photo = a[ACTIVITY_FIELDS.photo];
        const icon = a[ACTIVITY_FIELDS.icon] || "ri-notification-3-line";
        const created = toDate(a[ACTIVITY_FIELDS.createdAt]);
        const time = created ? timeAgoOrClock(created) : "";

        const avatar = photo
          ? `<img class="activity-item__avatar" src="${photo}" alt="${title}" />`
          : `<span class="activity-item__avatar icon"><i class="${icon}"></i></span>`;

        return `
        <li class="activity-item">
          ${avatar}
          <div class="activity-item__body">
            <p class="activity-item__title">${title}</p>
            <p class="activity-item__desc"><span class="status-dot ${dot}"></span>${desc}</p>
            <span class="activity-item__time">${time}</span>
          </div>
        </li>`;
      })
      .join("");
  }

  /* =========================================================
     DATE
  ========================================================= */
  function renderDate() {
    const dateEl = $("#currentDate");
    if (!dateEl) return;
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  /* =========================================================
     REALTIME LISTENERS
  ========================================================= */
  const unsubscribers = [];

  function subscribeEmployees() {
    const unsub = onSnapshot(
      collection(db, COLLECTIONS.EMPLOYEES),
      (snap) => {
        state.employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStats();
        renderDeptChart();
        renderBirthdays();
      },
      (err) => console.error("[dashboard.js] employees listener error:", err),
    );
    unsubscribers.push(unsub);
  }

  function subscribeDepartments() {
    const unsub = onSnapshot(
      collection(db, COLLECTIONS.DEPARTMENTS),
      (snap) => {
        state.departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStats();
        renderDeptChart();
      },
      (err) => {
        // Collection may not exist — that's fine, dept chart falls back
        // to grouping by the employees' department field.
        console.warn(
          "[dashboard.js] departments collection unavailable, falling back to employee grouping:",
          err?.message,
        );
      },
    );
    unsubscribers.push(unsub);
  }

  function subscribeAttendanceToday() {
    const start = startOfDay(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const q = query(
      collection(db, COLLECTIONS.ATTENDANCE),
      where(ATT_FIELDS.date, ">=", Timestamp.fromDate(start)),
      where(ATT_FIELDS.date, "<", Timestamp.fromDate(end)),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        state.attendanceToday = snap.docs.map((d) => d.data());
        renderStats();
      },
      (err) =>
        console.error("[dashboard.js] attendance-today listener error:", err),
    );
    unsubscribers.push(unsub);
  }

  function subscribeLeaves() {
    const q = query(
      collection(db, COLLECTIONS.LEAVES),
      where(LEAVE_FIELDS.status, "==", "approved"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        state.leaves = snap.docs.map((d) => d.data());
        renderStats();
      },
      (err) => console.error("[dashboard.js] leaves listener error:", err),
    );
    unsubscribers.push(unsub);
  }

  function subscribeActivity() {
    const q = query(
      collection(db, COLLECTIONS.ACTIVITY),
      orderBy(ACTIVITY_FIELDS.createdAt, "desc"),
      limit(6),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        state.activity = snap.docs.map((d) => d.data());
        renderActivity();
      },
      (err) => console.error("[dashboard.js] activity listener error:", err),
    );
    unsubscribers.push(unsub);
  }

  function teardownAllListeners() {
    unsubscribers.forEach((unsub) => unsub && unsub());
    if (overviewUnsub) overviewUnsub();
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    // Shared layout/theme/auth — all owned by layout.js, just invoked here.
    initTheme();
    await guardAndLoadUser(); // redirects to login if unauthenticated
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    // Dashboard-only, realtime, role-aware content.
    renderDate();
    renderQuickActions();
    setupOverviewRangeDropdown();

    subscribeEmployees();
    subscribeDepartments();
    subscribeAttendanceToday();
    subscribeLeaves();
    subscribeActivity();
    subscribeOverviewChart(currentRange);

    console.log(
      "[dashboard.js] Realtime dashboard ready for role:",
      getCurrentRole(),
    );
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", teardownAllListeners, { once: true });

  // Chart.js reads CSS colors once at creation time, so redraw both
  // charts with fresh colors right after a theme toggle.
  document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = document.getElementById("themeToggle");
    if (!themeToggle) return;
    themeToggle.addEventListener("click", () => {
      setTimeout(() => {
        subscribeOverviewChart(currentRange);
        renderDeptChart();
      }, 50);
    });
  });
})();
