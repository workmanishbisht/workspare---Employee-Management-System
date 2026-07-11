/* ==========================================================
   IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
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
     STATIC DATA
  ========================================================= */
  const QUICK_ACTIONS = [
    {
      label: "Add Employee",
      icon: "ri-user-add-line",
      color: "blue",
      nav: "./employees.html?action=add",
    },
    {
      label: "Add Department",
      icon: "ri-building-4-line",
      color: "green",
      nav: "#",
    },
    {
      label: "Mark Attendance",
      icon: "ri-calendar-check-line",
      color: "purple",
      nav: "#",
    },
    {
      label: "Apply Leave",
      icon: "ri-send-plane-line",
      color: "orange",
      nav: "#",
    },
    {
      label: "Generate Report",
      icon: "ri-file-chart-2-line",
      color: "indigo",
      nav: "#",
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

  let allUsers = [];

  /* =========================================================
     FIRESTORE: LOAD ALL USERS
  ========================================================= */
  async function fetchAllUsers() {
    try {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
      });
    } catch (error) {
      console.error("Failed to load users collection:", error);
      showToast("error", "Could not load employee data.");
      return [];
    }
  }

  /* =========================================================
     BUILD: STAT CARDS FROM USERS
  ========================================================= */
  function buildStats(users) {
    const total = users.length;
    const verified = users.filter((u) => u.emailVerified).length;
    const leadership = users.filter(
      (u) => u.role === "admin" || u.role === "manager",
    ).length;
    const roleSet = new Set(users.map((u) => u.role || "employee"));

    return [
      {
        label: "Total Employees",
        value: total,
        color: "blue",
        icon: "ri-team-line",
        changeLabel: "synced from Firestore",
      },
      {
        label: "Verified Accounts",
        value: verified,
        color: "green",
        icon: "ri-shield-check-line",
        changeLabel: total
          ? Math.round((verified / total) * 100) + "% verified"
          : "0% verified",
      },
      {
        label: "Admins & Managers",
        value: leadership,
        color: "purple",
        icon: "ri-user-star-line",
        changeLabel: "leadership roles",
      },
      {
        label: "Roles in Use",
        value: roleSet.size,
        color: "orange",
        icon: "ri-building-2-line",
        changeLabel: "out of 4 defined roles",
      },
    ];
  }

  /* =========================================================
     BUILD: ROLE BREAKDOWN (donut chart)
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

  /* =========================================================
     BUILD: OVERVIEW CHART (new signups per period)
  ========================================================= */
  function buildOverviewData(users, range) {
    const now = new Date();
    const config = {
      week: { count: 7, unit: "day" },
      month: { count: 6, unit: "week" },
      quarter: { count: 6, unit: "biweek" },
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
      } else if (config.unit === "biweek") {
        end = new Date(now);
        end.setDate(now.getDate() - i * 14);
        start = new Date(end);
        start.setDate(end.getDate() - 13);
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

  /* =========================================================
     BUILD: RECENT ACTIVITY FROM USERS
  ========================================================= */
  function buildRecentActivity(users) {
    return users
      .slice()
      .sort(
        (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0),
      )
      .slice(0, 5)
      .map((u) => ({
        title: u.fullName || u.email || "New user",
        desc: `Joined as ${ROLE_LABELS[u.role] || capitalize(u.role || "employee")}`,
        time: u.createdAt
          ? u.createdAt.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        dot: "info",
        img:
          u.photoURL ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (u.fullName || u.email || "U").slice(0, 2),
          )}&background=6c5ce7&color=fff`,
      }));
  }

  /* =========================================================
     RENDER: STAT CARDS
  ========================================================= */
  function renderStats(stats) {
    const grid = $("#statsGrid");
    if (!grid) return;

    grid.innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card">
        <div class="stat-card__top">
          <div class="stat-card__icon ${s.color}"><i class="${s.icon}"></i></div>
        </div>
        <p class="stat-card__label">${s.label}</p>
        <p class="stat-card__value">${s.value}</p>
        <div class="stat-card__bottom">
          <span class="stat-card__change neutral">
            <i class="ri-database-2-line"></i>
            ${s.changeLabel}
          </span>
        </div>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: OVERVIEW LINE CHART
  ========================================================= */
  let overviewChart = null;

  function renderOverviewChart(range) {
    const canvas = document.getElementById("overviewChart");
    if (!canvas || typeof Chart === "undefined") return;

    const data = buildOverviewData(allUsers, range);
    const cssVar = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const primary = cssVar("--color-primary") || "#6c5ce7";
    const gridColor = cssVar("--panel-light-border") || "#e5e1f5";
    const textColor = cssVar("--panel-light-text-muted") || "#6b7280";

    if (overviewChart) {
      overviewChart.destroy();
    }

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
     RENDER: ROLE DONUT CHART + LEGEND
  ========================================================= */
  function renderDeptChart(roleBreakdown) {
    const canvas = document.getElementById("deptChart");
    const legend = $("#deptLegend");
    const totalEl = $("#donutTotal");
    if (!canvas || typeof Chart === "undefined") return;

    const total = roleBreakdown.reduce((sum, d) => sum + d.count, 0);
    if (totalEl) totalEl.textContent = total;

    if (legend) {
      legend.innerHTML = roleBreakdown
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

    new Chart(canvas, {
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
     RENDER: BIRTHDAYS
  ========================================================= */
  function renderBirthdays(list) {
    const wrap = $("#birthdaysList");
    if (!wrap) return;

    if (!list.length) {
      wrap.innerHTML = `
        <p class="empty-state">
          No birthday data yet. Add a <code>dob</code> field to your
          Firestore <code>users</code> documents to show this list.
        </p>`;
      return;
    }

    wrap.innerHTML = list
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
      .join("");
  }

  /* =========================================================
     RENDER: QUICK ACTIONS
  ========================================================= */
  function renderQuickActions() {
    const wrap = $("#quickActions");
    if (!wrap) return;
    wrap.innerHTML = QUICK_ACTIONS.map(
      (a) => `
      <a href="${a.nav}" class="quick-action-btn ${a.color}">
        <i class="${a.icon}"></i>
        <span>${a.label}</span>
        <i class="ri-arrow-right-s-line arrow"></i>
      </a>`,
    ).join("");
  }

  /* =========================================================
     RENDER: RECENT ACTIVITY
  ========================================================= */
  function renderActivity(activity) {
    const list = $("#activityList");
    if (!list) return;

    if (!activity.length) {
      list.innerHTML = `<p class="empty-state">No recent activity yet.</p>`;
      return;
    }

    list.innerHTML = activity
      .map(
        (a) => `
      <li class="activity-item">
        <img class="activity-item__avatar" src="${a.img}" alt="${a.title}" />
        <div class="activity-item__body">
          <p class="activity-item__title">${a.title}</p>
          <p class="activity-item__desc">
            <span class="status-dot ${a.dot}"></span>${a.desc}
          </p>
          <span class="activity-item__time">${a.time}</span>
        </div>
      </li>`,
      )
      .join("");
  }

  /* =========================================================
     DATE PICKER
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

    await guardAndLoadUser();

    allUsers = await fetchAllUsers();

    renderNav();
    renderStats(buildStats(allUsers));
    renderDeptChart(buildRoleBreakdown(allUsers));
    renderBirthdays([]);
    renderQuickActions();
    renderActivity(buildRecentActivity(allUsers));
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
      }, 50);
    });
  });
})();
