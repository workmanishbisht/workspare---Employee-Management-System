/* ==========================================================
   IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  $,
  showToast,
  capitalize,
  renderNav,
  guardAndLoadUser,
  setupUserMenu,
  setupSidebarToggle,
  showSkeleton,
  hideSkeleton,
} from "../js/layout.js";

(function () {
  "use strict";

  /* =========================================================
     STATIC DATA / CONFIG
  ========================================================= */
  const QUICK_ACTIONS = [
    {
      label: "Add Employee",
      icon: "ri-user-add-line",
      color: "blue",
      nav: "./employees.html?action=add",
      roles: ["admin", "hr"],
    },
    {
      label: "Add Department",
      icon: "ri-building-4-line",
      color: "green",
      nav: "./departments.html?action=add",
      roles: ["admin", "hr"],
    },
    {
      label: "Generate Payroll",
      icon: "ri-money-dollar-circle-line",
      color: "purple",
      nav: "./payroll.html?action=generate",
      roles: ["admin", "hr"],
    },
    {
      label: "Create Announcement",
      icon: "ri-megaphone-line",
      color: "orange",
      nav: "./announcements.html?action=create",
      roles: ["admin", "hr"],
    },
    {
      label: "Approve Leave",
      icon: "ri-checkbox-circle-line",
      color: "indigo",
      nav: "./leaves.html?filter=pending",
      roles: ["admin", "hr", "manager"],
    },
    {
      label: "Manage Holidays",
      icon: "ri-flag-2-line",
      color: "pink",
      nav: "./holidays.html",
      roles: ["admin", "hr"],
    },
    {
      label: "Manage Documents",
      icon: "ri-folder-3-line",
      color: "teal",
      nav: "./documents.html",
      roles: ["admin", "hr", "manager", "employee"],
    },
    {
      label: "Open Settings",
      icon: "ri-settings-3-line",
      color: "blue",
      nav: "./settings.html",
      roles: ["admin"],
    },
  ];

  const ROLE_LABELS = {
    admin: "Admin",
    hr: "HR Manager",
    manager: "Team Manager",
    employee: "Employee",
  };

  const ROLE_COLORS = {
    admin: "#3b82f6",
    hr: "#f59e0b",
    manager: "#8b5cf6",
    employee: "#10b981",
  };

  const ATTENDANCE_TYPES = [
    { key: "present", label: "Present", color: "var(--color-success)" },
    { key: "absent", label: "Absent", color: "var(--color-error)" },
    { key: "late", label: "Late", color: "var(--color-warning)" },
    { key: "wfh", label: "Work From Home", color: "var(--stat-indigo)" },
    { key: "onleave", label: "On Leave", color: "var(--stat-purple)" },
  ];

  const ATTENDANCE_ICONS = {
    present: "ri-checkbox-circle-fill",
    absent: "ri-close-circle-fill",
    late: "ri-time-line",
    wfh: "ri-home-office-line",
    onleave: "ri-suitcase-line",
  };

  /* Widgets that are only meaningful for people who manage others.
     This reads the role returned by guardAndLoadUser() (see resolveCurrentRole
     below). If your permissions.js exposes a different shape, adjust
     resolveCurrentRole() only — the rest of the file just consumes the string. */
  const MANAGEMENT_ROLES = ["admin", "hr"];

  /* =========================================================
     STATE
  ========================================================= */
  let allUsers = [];
  let allAttendance = [];
  let allLeaves = [];
  let allHolidays = [];
  let allAnnouncements = [];
  let latestPayroll = null;
  let systemMeta = null;
  let currentRole = "employee";
  let overviewChart = null;
  let deptChart = null;
  let leaveTrendChart = null;

  /* =========================================================
     GENERIC HELPERS
  ========================================================= */
  function toDateSafe(value) {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function normalizeDoc(d) {
    const data = d.data();
    const normalized = { id: d.id };
    Object.keys(data).forEach((key) => {
      const val = data[key];
      normalized[key] = val && val.toDate ? val.toDate() : val;
    });
    return normalized;
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isToday(date) {
    return isSameDay(date, new Date());
  }

  function daysWithinLast(date, days) {
    if (!date) return false;
    const diff = (Date.now() - date.getTime()) / 86400000;
    return diff >= 0 && diff <= days;
  }

  /* Next occurrence (this year or next) of a recurring month/day date */
  function nextOccurrence(sourceDate) {
    if (!sourceDate) return null;
    const now = new Date();
    const thisYear = new Date(
      now.getFullYear(),
      sourceDate.getMonth(),
      sourceDate.getDate(),
    );
    thisYear.setHours(0, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (thisYear.getTime() < today.getTime()) {
      thisYear.setFullYear(thisYear.getFullYear() + 1);
    }
    return thisYear;
  }

  function daysUntil(target) {
    if (!target) return Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  function formatMoney(amount, currency) {
    const symbol = currency || "$";
    const n = Number(amount) || 0;
    return `${symbol}${n.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }

  function animateCounter(el, target, duration = 900) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const isFloat = !Number.isInteger(target);

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (target - start) * eased;
      el.textContent = isFloat ? value.toFixed(1) : Math.round(value);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = isFloat ? target.toFixed(1) : target;
    }
    requestAnimationFrame(tick);
  }

  function animateAllCounters(root) {
    (root || document).querySelectorAll(".js-counter").forEach((el) => {
      const target = Number(el.dataset.target || 0);
      animateCounter(el, target);
    });
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  }

  function sparklineSvg(values, color) {
    if (!values || !values.length) {
      return `<svg viewBox="0 0 100 34" preserveAspectRatio="none"></svg>`;
    }
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = 100 / (values.length - 1 || 1);
    const points = values
      .map((v, i) => {
        const x = i * step;
        const y = 32 - ((v - min) / range) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const areaPoints = `0,34 ${points} 100,34`;
    return `
      <svg viewBox="0 0 100 34" preserveAspectRatio="none">
        <polyline points="${areaPoints}" fill="${color}" opacity="0.12" stroke="none"></polyline>
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>`;
  }

  function emptyState(icon, title, desc, ctaLabel, ctaHref) {
    return `
      <div class="empty-state">
        <div class="empty-state__icon"><i class="${icon}"></i></div>
        <p class="empty-state__title">${title}</p>
        <p class="empty-state__desc">${desc}</p>
        ${ctaLabel ? `<a href="${ctaHref || "#"}" class="btn btn--ghost btn--sm">${ctaLabel}</a>` : ""}
      </div>`;
  }

  /* =========================================================
     ROLE RESOLUTION (thin adapter over the existing auth guard)
  ========================================================= */
  function resolveCurrentRole(authedUser) {
    const role =
      authedUser?.role ||
      authedUser?.data?.role ||
      authedUser?.profile?.role ||
      "admin"; // sensible default so nothing is hidden if the shape is unknown
    return String(role).toLowerCase();
  }

  function applyRoleVisibility(role) {
    document.querySelectorAll("[data-roles]").forEach((el) => {
      const allowed = el.dataset.roles.split(",").map((r) => r.trim());
      el.dataset.rbacHidden = allowed.includes(role) ? "false" : "true";
    });
  }

  /* =========================================================
     FIRESTORE: SAFE FETCHERS
     Every collection is optional — if it doesn't exist yet in this
     project's schema, Firestore returns an empty snapshot (not an
     error), so widgets simply fall back to their empty state.
  ========================================================= */
  async function fetchCollectionSafe(name) {
    try {
      const snap = await getDocs(collection(db, name));
      return snap.docs.map(normalizeDoc);
    } catch (error) {
      console.warn(`Could not load "${name}" collection:`, error);
      return [];
    }
  }

  async function fetchDocSafe(path, id) {
    try {
      const ref = doc(db, path, id);
      const snap = await getDoc(ref);
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.warn(`Could not load doc ${path}/${id}:`, error);
      return null;
    }
  }

  async function fetchAllUsers() {
    try {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          dob: data.dob?.toDate ? data.dob.toDate() : toDateSafe(data.dob),
        };
      });
    } catch (error) {
      console.error("Failed to load users collection:", error);
      showToast("error", "Could not load employee data.");
      return [];
    }
  }

  async function loadLatestPayroll() {
    const docs = await fetchCollectionSafe("payroll");
    if (!docs.length) return null;
    return docs.sort(
      (a, b) =>
        (toDateSafe(b.processedAt || b.month)?.getTime() || 0) -
        (toDateSafe(a.processedAt || a.month)?.getTime() || 0),
    )[0];
  }

  /* =========================================================
     BUILD: KPI CARDS (Section 1)
  ========================================================= */
  function buildMonthlyCounts(users, months) {
    const now = new Date();
    const values = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      values.push(
        users.filter(
          (u) => u.createdAt && u.createdAt >= start && u.createdAt <= end,
        ).length,
      );
    }
    return values;
  }

  function buildKpiData(users, attendanceToday, leaves, payroll) {
    /* --- Card 1: Total Employees --- */
    const monthly = buildMonthlyCounts(users, 6);
    const thisMonth = monthly[monthly.length - 1];
    const lastMonth = monthly[monthly.length - 2] || 0;
    const growthPct = lastMonth
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : thisMonth
        ? 100
        : 0;

    /* --- Card 2: Today's Attendance --- */
    const present = attendanceToday.filter(
      (a) => a.status === "present",
    ).length;
    const absent = attendanceToday.filter((a) => a.status === "absent").length;
    const late = attendanceToday.filter((a) => a.status === "late").length;
    const markedTotal = attendanceToday.length;
    const attendancePct = markedTotal
      ? Math.round((present / markedTotal) * 100)
      : 0;

    /* --- Card 3: Pending Leave Requests --- */
    const pending = leaves.filter((l) => l.status === "pending").length;
    const approvedToday = leaves.filter(
      (l) =>
        l.status === "approved" &&
        isToday(toDateSafe(l.updatedAt || l.actionedAt)),
    ).length;
    const rejectedToday = leaves.filter(
      (l) =>
        l.status === "rejected" &&
        isToday(toDateSafe(l.updatedAt || l.actionedAt)),
    ).length;

    /* --- Card 4: Monthly Payroll --- */
    const payrollData = payroll
      ? {
          processed: payroll.processedCount ?? 0,
          total: payroll.totalPayroll ?? 0,
          pendingAmt: payroll.pendingPayroll ?? 0,
          currency: payroll.currency || "$",
          hasRun: true,
        }
      : { processed: 0, total: 0, pendingAmt: 0, currency: "$", hasRun: false };

    return {
      totalEmployees: {
        total: users.length,
        growthPct,
        sparkline: monthly,
      },
      attendance: {
        present,
        absent,
        late,
        attendancePct,
        hasData: markedTotal > 0,
      },
      leave: { pending, approvedToday, rejectedToday },
      payroll: payrollData,
    };
  }

  function renderKpiCards(data) {
    const grid = $("#kpiGrid");
    if (!grid) return;

    const trendClass = data.totalEmployees.growthPct >= 0 ? "up" : "down";
    const trendIcon =
      data.totalEmployees.growthPct >= 0
        ? "ri-arrow-up-line"
        : "ri-arrow-down-line";

    const card1 = `
      <div class="kpi-card">
        <div class="kpi-card__top">
          <div class="kpi-card__icon blue"><i class="ri-team-line"></i></div>
          <span class="kpi-card__trend ${trendClass}">
            <i class="${trendIcon}"></i>${Math.abs(data.totalEmployees.growthPct)}%
          </span>
        </div>
        <p class="kpi-card__label">Total Employees</p>
        <p class="kpi-card__value js-counter" data-target="${data.totalEmployees.total}">0</p>
        <div class="kpi-card__spark">${sparklineSvg(data.totalEmployees.sparkline, cssVar("--stat-blue", "#3b82f6"))}</div>
        <p class="kpi-card__updated"><i class="ri-refresh-line"></i> Synced just now</p>
      </div>`;

    const card2 = `
      <div class="kpi-card">
        <div class="kpi-card__top">
          <div class="kpi-card__icon green"><i class="ri-fingerprint-2-line"></i></div>
        </div>
        <p class="kpi-card__label">Today's Attendance</p>
        <div class="kpi-card__body">
          <div class="progress-ring" style="--pct:${data.attendance.attendancePct}">
            <span>${data.attendance.attendancePct}%</span>
          </div>
          <div class="kpi-card__rows">
            <div class="kpi-card__row"><span><span class="dot" style="background:var(--color-success)"></span>Present</span><strong class="js-counter" data-target="${data.attendance.present}">0</strong></div>
            <div class="kpi-card__row"><span><span class="dot" style="background:var(--color-error)"></span>Absent</span><strong class="js-counter" data-target="${data.attendance.absent}">0</strong></div>
            <div class="kpi-card__row"><span><span class="dot" style="background:var(--color-warning)"></span>Late</span><strong class="js-counter" data-target="${data.attendance.late}">0</strong></div>
          </div>
        </div>
      </div>`;

    const card3 = `
      <div class="kpi-card">
        <div class="kpi-card__top">
          <div class="kpi-card__icon purple"><i class="ri-plane-line"></i></div>
        </div>
        <p class="kpi-card__label">Pending Leave Requests</p>
        <p class="kpi-card__value js-counter" data-target="${data.leave.pending}">0</p>
        <div class="kpi-card__rows">
          <div class="kpi-card__row"><span><span class="dot" style="background:var(--color-success)"></span>Approved today</span><strong class="js-counter" data-target="${data.leave.approvedToday}">0</strong></div>
          <div class="kpi-card__row"><span><span class="dot" style="background:var(--color-error)"></span>Rejected today</span><strong class="js-counter" data-target="${data.leave.rejectedToday}">0</strong></div>
        </div>
      </div>`;

    const payrollBody = data.payroll.hasRun
      ? `
        <p class="kpi-card__value js-counter" data-target="${data.payroll.processed}">0</p>
        <div class="kpi-card__rows">
          <div class="kpi-card__row"><span>Total payroll</span><strong>${formatMoney(data.payroll.total, data.payroll.currency)}</strong></div>
          <div class="kpi-card__row"><span>Pending payroll</span><strong>${formatMoney(data.payroll.pendingAmt, data.payroll.currency)}</strong></div>
        </div>`
      : `
        <p class="kpi-card__value" style="font-size:18px;color:var(--panel-light-text-muted)">Not run yet</p>
        <div class="kpi-card__rows">
          <div class="kpi-card__row"><span>Payroll for this month hasn't been generated.</span></div>
        </div>`;

    const card4 = `
      <div class="kpi-card" data-roles="admin,hr" data-rbac-hidden="false">
        <div class="kpi-card__top">
          <div class="kpi-card__icon orange"><i class="ri-money-dollar-circle-line"></i></div>
        </div>
        <p class="kpi-card__label">Monthly Payroll</p>
        ${payrollBody}
      </div>`;

    grid.innerHTML = card1 + card2 + card3 + card4;
    animateAllCounters(grid);

    // Attendance ring fill-in animation
    requestAnimationFrame(() => {
      const ring = grid.querySelector(".progress-ring");
      if (ring) ring.style.setProperty("--pct", data.attendance.attendancePct);
    });
  }

  /* =========================================================
     SECTION 2: EMPLOYEE GROWTH CHART
  ========================================================= */
  function buildOverviewData(users, range) {
    const now = new Date();
    const config = {
      week: { count: 7, unit: "day" },
      month: { count: 6, unit: "week" },
      year: { count: 6, unit: "month" },
    }[range] || { count: 6, unit: "week" };

    const labels = [];
    const values = [];

    for (let i = config.count - 1; i >= 0; i--) {
      let start, end, label;

      if (config.unit === "day") {
        end = new Date(now);
        end.setDate(now.getDate() - i);
        end.setHours(23, 59, 59, 999);
        start = new Date(end);
        start.setHours(0, 0, 0, 0);
        label = start.toLocaleDateString("en-US", { weekday: "short" });
      } else if (config.unit === "week") {
        end = new Date(now);
        end.setDate(now.getDate() - i * 7);
        start = new Date(end);
        start.setDate(end.getDate() - 6);
        label = start.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        });
      } else {
        end = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
          999,
        );
        start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        label = start.toLocaleDateString("en-US", { month: "short" });
      }

      const countInBucket = users.filter(
        (u) => u.createdAt && u.createdAt >= start && u.createdAt <= end,
      ).length;

      labels.push(label);
      values.push(countInBucket);
    }

    return { labels, values };
  }

  function renderOverviewChart(range) {
    const canvas = document.getElementById("overviewChart");
    if (!canvas || typeof Chart === "undefined") return;

    const data = buildOverviewData(allUsers, range);
    const primary = cssVar("--color-primary", "#6c5ce7");
    const gridColor = cssVar("--panel-light-border", "#e5e1f5");
    const textColor = cssVar("--panel-light-text-muted", "#6b7280");

    if (overviewChart) overviewChart.destroy();

    overviewChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "New Employees",
            data: data.values,
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
        animation: { duration: 700, easing: "easeOutQuart" },
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
        renderOverviewChart(item.dataset.range);
      });
    });

    document.addEventListener("click", () => dropdown.classList.remove("open"));
  }

  /* =========================================================
     SECTION 3: ROLE DISTRIBUTION DONUT
  ========================================================= */
  function buildRoleBreakdown(users) {
    const counts = {};
    users.forEach((u) => {
      const role = u.role || "employee";
      counts[role] = (counts[role] || 0) + 1;
    });
    return Object.keys(counts).map((role) => ({
      name: ROLE_LABELS[role] || capitalize(role),
      count: counts[role],
      color: ROLE_COLORS[role] || "#6c5ce7",
    }));
  }

  function renderDeptChart(roleBreakdown) {
    const canvas = document.getElementById("deptChart");
    const legend = $("#deptLegend");
    const totalEl = $("#donutTotal");
    if (!canvas || typeof Chart === "undefined") return;

    const total = roleBreakdown.reduce((sum, d) => sum + d.count, 0);
    if (totalEl) totalEl.textContent = total;

    if (legend) {
      legend.innerHTML = roleBreakdown.length
        ? roleBreakdown
            .map((d) => {
              const pct = total ? Math.round((d.count / total) * 100) : 0;
              return `
              <li>
                <span class="legend-dot" style="background:${d.color}"></span>
                <span class="dept-name">${d.name}</span>
                <span class="dept-count">${d.count} (${pct}%)</span>
              </li>`;
            })
            .join("")
        : emptyState(
            "ri-pie-chart-line",
            "No roles yet",
            "Assign roles to employees to see the breakdown here.",
          );
    }

    if (deptChart) deptChart.destroy();

    deptChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: roleBreakdown.map((d) => d.name),
        datasets: [
          {
            data: roleBreakdown.map((d) => d.count),
            backgroundColor: roleBreakdown.map((d) => d.color),
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        animation: { animateRotate: true, duration: 800 },
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
     SECTION 4: ATTENDANCE SUMMARY
  ========================================================= */
  function renderAttendanceSummary(attendanceToday, totalUsers) {
    const wrap = $("#attendanceSummaryList");
    if (!wrap) return;

    if (!attendanceToday.length) {
      wrap.innerHTML = emptyState(
        "ri-fingerprint-2-line",
        "No attendance marked yet",
        "Attendance records for today will appear here as employees check in.",
        "Mark Attendance",
        "./attendance.html",
      );
      return;
    }

    const base = totalUsers || attendanceToday.length;
    wrap.innerHTML = ATTENDANCE_TYPES.map((type) => {
      const count = attendanceToday.filter((a) => a.status === type.key).length;
      const pct = base ? Math.round((count / base) * 100) : 0;
      return `
        <div class="attendance-row">
          <div class="attendance-row__icon" style="background:${type.color}">
            <i class="${ATTENDANCE_ICONS[type.key]}"></i>
          </div>
          <div class="attendance-row__body">
            <div class="attendance-row__top">
              <span class="attendance-row__label">${type.label}</span>
              <span class="attendance-row__pct">${count} · ${pct}%</span>
            </div>
            <div class="attendance-row__track">
              <div class="attendance-row__fill" data-fill="${pct}" style="background:${type.color}"></div>
            </div>
          </div>
        </div>`;
    }).join("");

    requestAnimationFrame(() => {
      wrap.querySelectorAll(".attendance-row__fill").forEach((el) => {
        el.style.width = `${el.dataset.fill}%`;
      });
    });
  }

  /* =========================================================
     SECTION 5: LEAVE SUMMARY
  ========================================================= */
  function renderLeaveSummary(leaves) {
    const grid = $("#leaveSummaryGrid");
    if (grid) {
      const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
      leaves.forEach((l) => {
        if (counts[l.status] !== undefined) counts[l.status] += 1;
      });
      grid.innerHTML = `
        <div class="leave-mini pending"><strong class="js-counter" data-target="${counts.pending}">0</strong><span>Pending</span></div>
        <div class="leave-mini approved"><strong class="js-counter" data-target="${counts.approved}">0</strong><span>Approved</span></div>
        <div class="leave-mini rejected"><strong class="js-counter" data-target="${counts.rejected}">0</strong><span>Rejected</span></div>
        <div class="leave-mini cancelled"><strong class="js-counter" data-target="${counts.cancelled}">0</strong><span>Cancelled</span></div>`;
      animateAllCounters(grid);
    }

    const canvas = document.getElementById("leaveTrendChart");
    if (!canvas || typeof Chart === "undefined") return;

    const now = new Date();
    const labels = [];
    const values = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      labels.push(start.toLocaleDateString("en-US", { month: "short" }));
      values.push(
        leaves.filter((l) => {
          const d = toDateSafe(l.createdAt);
          return d && d >= start && d <= end;
        }).length,
      );
    }

    if (leaveTrendChart) leaveTrendChart.destroy();
    const primary = cssVar("--color-primary", "#6c5ce7");
    const textColor = cssVar("--panel-light-text-muted", "#6b7280");

    leaveTrendChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: primary,
            borderRadius: 6,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 10 } },
          },
          y: { display: false, beginAtZero: true },
        },
      },
    });
  }

  /* =========================================================
     SECTION 6: BIRTHDAYS & WORK ANNIVERSARIES
  ========================================================= */
  function buildBirthdaysAndAnniversaries(users) {
    const items = [];

    users.forEach((u) => {
      if (u.dob) {
        const next = nextOccurrence(u.dob);
        items.push({
          type: "birthday",
          name: u.fullName || u.email || "Employee",
          role: ROLE_LABELS[u.role] || capitalize(u.role || "employee"),
          department: u.department || "",
          date: next,
          days: daysUntil(next),
          emoji: "🎂",
          img:
            u.photoURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent((u.fullName || u.email || "U").slice(0, 2))}&background=ec4899&color=fff`,
        });
      }
      if (u.createdAt) {
        const next = nextOccurrence(u.createdAt);
        const years = new Date().getFullYear() - u.createdAt.getFullYear();
        if (years > 0) {
          items.push({
            type: "anniversary",
            name: u.fullName || u.email || "Employee",
            role: ROLE_LABELS[u.role] || capitalize(u.role || "employee"),
            department: u.department || "",
            date: next,
            days: daysUntil(next),
            emoji: "🏆",
            sub: `${years} year${years > 1 ? "s" : ""} with us`,
            img:
              u.photoURL ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent((u.fullName || u.email || "U").slice(0, 2))}&background=10b981&color=fff`,
          });
        }
      }
    });

    return items.sort((a, b) => a.days - b.days).slice(0, 6);
  }

  function renderBirthdays(list) {
    const wrap = $("#birthdaysList");
    if (!wrap) return;

    if (!list.length) {
      wrap.innerHTML = emptyState(
        "ri-cake-2-line",
        "No upcoming celebrations",
        "Add a dob field to your Firestore users documents to surface birthdays and work anniversaries here.",
      );
      return;
    }

    wrap.innerHTML = list
      .map((b) => {
        const dayLabel =
          b.days === 0
            ? "Today"
            : b.days === 1
              ? "Tomorrow"
              : `In ${b.days} days`;
        return `
        <div class="birthday-item type-${b.type}">
          <img src="${b.img}" alt="${b.name}" />
          <div class="birthday-item__info">
            <p class="name">${b.name}</p>
            <p class="role">${b.role}${b.department ? " · " + b.department : ""}</p>
            <p class="sub">${b.type === "birthday" ? "🎂 Birthday" : b.sub} · ${dayLabel}</p>
          </div>
          <div class="birthday-item__right">
            <span class="birthday-item__emoji">${b.emoji}</span>
            <button type="button" class="wish-btn" data-wish="${b.name}">Wish</button>
          </div>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll("[data-wish]").forEach((btn) => {
      btn.addEventListener("click", () => {
        showToast("success", `Wish sent to ${btn.dataset.wish}!`);
      });
    });
  }

  /* =========================================================
     SECTION 7: UPCOMING HOLIDAYS
  ========================================================= */
  function renderHolidays(holidays) {
    const wrap = $("#holidaysList");
    if (!wrap) return;

    const upcoming = holidays
      .map((h) => ({ ...h, dateObj: toDateSafe(h.date) }))
      .filter((h) => h.dateObj && daysUntil(h.dateObj) >= 0)
      .sort((a, b) => a.dateObj - b.dateObj)
      .slice(0, 5);

    if (!upcoming.length) {
      wrap.innerHTML = emptyState(
        "ri-flag-2-line",
        "No holidays scheduled",
        "Add documents to a holidays collection to populate the calendar.",
        "Manage Holidays",
        "./holidays.html",
      );
      return;
    }

    wrap.innerHTML = upcoming
      .map((h) => {
        const remaining = daysUntil(h.dateObj);
        return `
        <li class="holiday-item">
          <div class="holiday-item__date">
            <strong>${h.dateObj.getDate()}</strong>
            <span>${h.dateObj.toLocaleDateString("en-US", { month: "short" })}</span>
          </div>
          <div class="holiday-item__body">
            <p class="holiday-item__name">${h.name || "Holiday"}</p>
            <p class="holiday-item__meta">${h.dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" })}</p>
          </div>
          <span class="holiday-item__badge">${remaining === 0 ? "Today" : `${remaining}d left`}</span>
        </li>`;
      })
      .join("");
  }

  /* =========================================================
     SECTION 8: LATEST ANNOUNCEMENTS
  ========================================================= */
  function renderAnnouncements(announcements) {
    const wrap = $("#announcementsList");
    if (!wrap) return;

    const list = announcements
      .map((a) => ({ ...a, dateObj: toDateSafe(a.createdAt || a.date) }))
      .sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0))
      .slice(0, 4);

    if (!list.length) {
      wrap.innerHTML = emptyState(
        "ri-megaphone-line",
        "No announcements yet",
        "Company-wide updates you publish will show up here.",
        "Create Announcement",
        "./announcements.html",
      );
      return;
    }

    wrap.innerHTML = list
      .map((a) => {
        const priority = (a.priority || "low").toLowerCase();
        return `
        <li class="announcement-item">
          <div class="announcement-item__top">
            <p class="announcement-item__title">${a.title || "Announcement"}</p>
            <span class="priority-badge ${priority}">${priority}</span>
          </div>
          <p class="announcement-item__meta">${a.author || "Admin"} · ${
            a.dateObj
              ? a.dateObj.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })
              : "—"
          }</p>
          <p class="announcement-item__desc">${a.body || ""}</p>
          <a href="#" class="link">Read more</a>
        </li>`;
      })
      .join("");
  }

  /* =========================================================
     SECTION 9: RECENT ACTIVITY (unified timeline)
  ========================================================= */
  function buildRecentActivity(
    users,
    leaves,
    payroll,
    announcements,
    attendance,
  ) {
    const items = [];

    users.forEach((u) => {
      if (!u.createdAt) return;
      items.push({
        title: u.fullName || u.email || "New user",
        desc: `Joined as ${ROLE_LABELS[u.role] || capitalize(u.role || "employee")}`,
        time: u.createdAt,
        dot: "info",
        icon: "ri-user-add-line",
        img: u.photoURL || null,
      });
    });

    leaves.forEach((l) => {
      const time = toDateSafe(l.updatedAt || l.actionedAt || l.createdAt);
      if (!time || !l.status || l.status === "pending") return;
      items.push({
        title: l.employeeName || "Employee",
        desc: `Leave request ${l.status}`,
        time,
        dot: l.status === "approved" ? "success" : "muted",
        icon: "ri-plane-line",
        img: null,
      });
    });

    if (payroll?.processedAt) {
      items.push({
        title: "Payroll generated",
        desc: `${payroll.processedCount || 0} employees processed`,
        time: toDateSafe(payroll.processedAt),
        dot: "success",
        icon: "ri-money-dollar-circle-line",
        img: null,
      });
    }

    announcements.forEach((a) => {
      const time = toDateSafe(a.createdAt || a.date);
      if (!time) return;
      items.push({
        title: a.title || "Announcement",
        desc: `Published by ${a.author || "Admin"}`,
        time,
        dot: "warning",
        icon: "ri-megaphone-line",
        img: null,
      });
    });

    attendance.forEach((a) => {
      const time = toDateSafe(a.updatedAt || a.createdAt);
      if (!time) return;
      items.push({
        title: a.employeeName || "Employee",
        desc: `Marked attendance as ${a.status || "present"}`,
        time,
        dot: "info",
        icon: "ri-fingerprint-2-line",
        img: null,
      });
    });

    return items
      .filter((i) => i.time)
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 6);
  }

  function renderActivity(activity) {
    const list = $("#activityList");
    if (!list) return;

    if (!activity.length) {
      list.innerHTML = emptyState(
        "ri-history-line",
        "No recent activity",
        "Actions across the workspace will show up here as they happen.",
      );
      return;
    }

    list.innerHTML = activity
      .map((a) => {
        const avatar = a.img
          ? `<img class="activity-item__avatar" src="${a.img}" alt="${a.title}" />`
          : `<span class="activity-item__avatar icon"><i class="${a.icon}"></i></span>`;
        return `
        <li class="activity-item">
          ${avatar}
          <div class="activity-item__body">
            <p class="activity-item__title">${a.title}</p>
            <p class="activity-item__desc"><span class="status-dot ${a.dot}"></span>${a.desc}</p>
            <span class="activity-item__time">${a.time.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}</span>
          </div>
        </li>`;
      })
      .join("");
  }

  /* =========================================================
     SECTION 10: QUICK ACTIONS
  ========================================================= */
  function renderQuickActions(role) {
    const wrap = $("#quickActions");
    if (!wrap) return;
    const visible = QUICK_ACTIONS.filter(
      (a) => !a.roles || a.roles.includes(role),
    );
    wrap.innerHTML = visible
      .map(
        (a) => `
      <a href="${a.nav}" class="quick-action-btn ${a.color}">
        <i class="${a.icon}"></i>
        <span>${a.label}</span>
      </a>`,
      )
      .join("");
  }

  /* =========================================================
     SECTION 11: EMPLOYEE STATUS
  ========================================================= */
  function renderEmployeeStatus(users) {
    const grid = $("#employeeStatusGrid");
    if (!grid) return;

    const active = users.filter(
      (u) => (u.status || "active") === "active",
    ).length;
    const inactive = users.length - active;
    const verified = users.filter((u) => u.emailVerified).length;
    const newJoinees = users.filter((u) =>
      daysWithinLast(u.createdAt, 30),
    ).length;

    grid.innerHTML = `
      <div class="status-mini"><strong class="js-counter" data-target="${active}">0</strong><span>Active</span></div>
      <div class="status-mini"><strong class="js-counter" data-target="${inactive}">0</strong><span>Inactive</span></div>
      <div class="status-mini"><strong class="js-counter" data-target="${verified}">0</strong><span>Verified</span></div>
      <div class="status-mini"><strong class="js-counter" data-target="${newJoinees}">0</strong><span>New Joinees</span></div>`;
    animateAllCounters(grid);
  }

  /* =========================================================
     SECTION 12: SYSTEM HEALTH
  ========================================================= */
  function renderSystemHealth(meta, firebaseOk) {
    const list = $("#systemHealthList");
    if (!list) return;

    const storage = meta?.storageUsage;
    const lastBackup = toDateSafe(meta?.lastBackup);

    list.innerHTML = `
      <li class="health-item">
        <span class="health-item__label"><i class="ri-fire-line"></i>Firebase</span>
        <span class="health-item__value"><span class="health-dot ${firebaseOk ? "ok" : "error"}"></span>${firebaseOk ? "Operational" : "Unreachable"}</span>
      </li>
      <li class="health-item">
        <span class="health-item__label"><i class="ri-database-2-line"></i>Database</span>
        <span class="health-item__value"><span class="health-dot ${firebaseOk ? "ok" : "error"}"></span>Cloud Firestore</span>
      </li>
      <li class="health-item">
        <span class="health-item__label"><i class="ri-hard-drive-2-line"></i>Storage Usage</span>
        <span class="health-item__value">${storage ? storage : "Not tracked"}</span>
      </li>
      <li class="health-item">
        <span class="health-item__label"><i class="ri-shield-check-line"></i>Last Backup</span>
        <span class="health-item__value">${
          lastBackup
            ? lastBackup.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : `<span class="health-dot warn"></span>Not configured`
        }</span>
      </li>`;
  }

  /* =========================================================
     DATE PICKER (unchanged behaviour)
  ========================================================= */
  function setupDatePicker() {
    const input = $("#dateInput");
    const label = $("#currentDate");
    if (!input || !label) return;

    const today = new Date();
    input.value = today.toISOString().split("T")[0];
    label.textContent = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    input.addEventListener("change", () => {
      if (!input.value) return;
      const selected = new Date(`${input.value}T00:00:00`);
      label.textContent = selected.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    showSkeleton("dashSkeleton", "dashContent");

    const authedUser = await guardAndLoadUser();
    currentRole = resolveCurrentRole(authedUser);

    let firebaseOk = true;
    try {
      [
        allUsers,
        allAttendance,
        allLeaves,
        allHolidays,
        allAnnouncements,
        latestPayroll,
      ] = await Promise.all([
        fetchAllUsers(),
        fetchCollectionSafe("attendance"),
        fetchCollectionSafe("leaves"),
        fetchCollectionSafe("holidays"),
        fetchCollectionSafe("announcements"),
        loadLatestPayroll(),
      ]);
    } catch (error) {
      firebaseOk = false;
      console.error("Dashboard data load failed:", error);
    }

    systemMeta = await fetchDocSafe("system", "meta");

    const attendanceToday = allAttendance.filter((a) =>
      isToday(toDateSafe(a.date || a.createdAt)),
    );

    renderNav();
    applyRoleVisibility(currentRole);

    const kpiData = buildKpiData(
      allUsers,
      attendanceToday,
      allLeaves,
      latestPayroll,
    );
    renderKpiCards(kpiData);

    renderDeptChart(buildRoleBreakdown(allUsers));
    renderAttendanceSummary(attendanceToday, allUsers.length);
    renderLeaveSummary(allLeaves);
    renderBirthdays(buildBirthdaysAndAnniversaries(allUsers));
    renderHolidays(allHolidays);
    renderAnnouncements(allAnnouncements);
    renderActivity(
      buildRecentActivity(
        allUsers,
        allLeaves,
        latestPayroll,
        allAnnouncements,
        allAttendance,
      ),
    );
    renderQuickActions(currentRole);
    renderEmployeeStatus(allUsers);
    renderSystemHealth(systemMeta, firebaseOk);

    setupDatePicker();
    setupOverviewRangeDropdown();
    setupUserMenu();
    setupSidebarToggle();
    renderOverviewChart("month");

    hideSkeleton("dashSkeleton", "dashContent");
  }

  document.addEventListener("DOMContentLoaded", init);

  document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = $("#themeToggle");
    if (!themeToggle) return;
    themeToggle.addEventListener("click", () => {
      setTimeout(() => {
        renderOverviewChart(
          $(".dropdown__menu li.selected")?.dataset.range || "month",
        );
        renderDeptChart(buildRoleBreakdown(allUsers));
        renderLeaveSummary(allLeaves);
      }, 50);
    });
  });
})();
