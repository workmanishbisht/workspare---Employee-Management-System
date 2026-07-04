/* ==========================================================
   FIREBASE IMPORTS
   (dashboard.js is loaded as type="module" in dashboard.html,
   so top-level import statements are allowed here)
========================================================== */
import { auth, db } from "../firebase/firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

(function () {
  "use strict";

  /* =========================================================
     DATA (swap this for a real API response later)
  ========================================================= */
  const NAV_ITEMS = [
    { label: "Dashboard", icon: "ri-dashboard-line", active: true },
    { label: "Employees", icon: "ri-user-3-line" },
    { label: "Departments", icon: "ri-building-4-line" },
    { label: "Attendance", icon: "ri-calendar-check-line" },
    { label: "Leave Management", icon: "ri-send-plane-line" },
    { label: "Payroll", icon: "ri-bank-card-line" },
    { label: "Reports", icon: "ri-bar-chart-2-line" },
    { label: "Calendar", icon: "ri-calendar-2-line" },
    { label: "Settings", icon: "ri-settings-3-line" },
  ];

  const STATS = [
    {
      label: "Total Employees",
      value: 128,
      change: 12.5,
      dir: "up",
      color: "blue",
      icon: "ri-team-line",
      spark: [40, 44, 42, 48, 50, 55, 58, 60, 64, 70],
    },
    {
      label: "Present Today",
      value: 96,
      change: 8.3,
      dir: "up",
      color: "green",
      icon: "ri-user-follow-line",
      spark: [70, 68, 72, 75, 74, 78, 80, 82, 79, 85],
    },
    {
      label: "On Leave",
      value: 14,
      change: 3.2,
      dir: "down",
      color: "purple",
      icon: "ri-calendar-close-line",
      spark: [20, 22, 18, 19, 17, 16, 18, 15, 14, 12],
    },
    {
      label: "Departments",
      value: 8,
      change: null,
      dir: "up",
      changeLabel: "2 new this month",
      color: "orange",
      icon: "ri-building-2-line",
      spark: [4, 4, 5, 5, 6, 6, 6, 7, 7, 8],
    },
  ];

  const OVERVIEW_DATA = {
    week: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      values: [88, 92, 95, 90, 96, 60, 40],
    },
    month: {
      labels: ["Jun 01", "Jun 08", "Jun 15", "Jun 22", "Jun 29", "Jul 04"],
      values: [42, 68, 74, 66, 88, 96],
    },
    quarter: {
      labels: ["May W1", "May W3", "Jun W1", "Jun W3", "Jul W1"],
      values: [58, 65, 70, 82, 96],
    },
    year: {
      labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
      values: [70, 75, 80, 78, 90, 96],
    },
  };

  const DEPARTMENTS = [
    { name: "Engineering", count: 45, color: "#3b82f6" },
    { name: "Design", count: 28, color: "#10b981" },
    { name: "Marketing", count: 20, color: "#8b5cf6" },
    { name: "HR", count: 18, color: "#f59e0b" },
    { name: "Sales", count: 17, color: "#ec4899" },
  ];

  const BIRTHDAYS = [
    {
      name: "Neha Singh",
      type: "birthday",
      sub: "Birthday · Today",
      emoji: "🎂",
      img: "https://i.pravatar.cc/80?img=47",
    },
    {
      name: "Arjun Mehta",
      type: "anniversary",
      sub: "Work Anniversary · 5 July",
      emoji: "🎁",
      img: "https://i.pravatar.cc/80?img=12",
    },
    {
      name: "Sneha Patel",
      type: "birthday",
      sub: "Birthday · 7 July",
      emoji: "🎉",
      img: "https://i.pravatar.cc/80?img=32",
    },
  ];

  const QUICK_ACTIONS = [
    { label: "Add Employee", icon: "ri-user-add-line", color: "blue" },
    { label: "Add Department", icon: "ri-building-4-line", color: "green" },
    {
      label: "Mark Attendance",
      icon: "ri-calendar-check-line",
      color: "purple",
    },
    { label: "Apply Leave", icon: "ri-send-plane-line", color: "orange" },
    { label: "Generate Report", icon: "ri-file-chart-2-line", color: "indigo" },
  ];

  const ACTIVITY = [
    {
      title: "Rahul Sharma",
      desc: "New employee added",
      time: "10:30 AM",
      dot: "success",
      img: "https://i.pravatar.cc/80?img=15",
    },
    {
      title: "Priya Verma",
      desc: "Leave request approved",
      time: "09:45 AM",
      dot: "info",
      img: "https://i.pravatar.cc/80?img=25",
    },
    {
      title: "Attendance updated",
      desc: "96 employees marked present",
      time: "09:15 AM",
      dot: "info",
      icon: "ri-calendar-check-line",
    },
    {
      title: "Amit Kumar",
      desc: "Profile updated",
      time: "Yesterday",
      dot: "muted",
      img: "https://i.pravatar.cc/80?img=8",
    },
  ];

  /* =========================================================
     HELPERS
  ========================================================= */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /* =========================================================
     RENDER: SIDEBAR NAV
  ========================================================= */
  function renderNav() {
    const list = $("#navList");
    if (!list) return;
    list.innerHTML = NAV_ITEMS.map(
      (item) => `
      <li>
        <a href="#" class="nav-item${item.active ? " active" : ""}">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      </li>`,
    ).join("");
  }

  /* =========================================================
     RENDER: STAT CARDS
  ========================================================= */
  function renderStats() {
    const grid = $("#statsGrid");
    if (!grid) return;

    grid.innerHTML = STATS.map(
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
            ${s.change !== null ? s.change + "% this month" : s.changeLabel}
          </span>
          <canvas class="stat-card__spark" id="spark-${i}"></canvas>
        </div>
      </div>`,
    ).join("");

    STATS.forEach((s, i) =>
      renderSparkline(
        `spark-${i}`,
        s.spark,
        s.dir === "up" ? cssVar("--color-success") : cssVar("--color-error"),
      ),
    );
  }

  function renderSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    new Chart(canvas, {
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
        animation: { duration: 600 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  }

  /* =========================================================
     RENDER: OVERVIEW LINE CHART
  ========================================================= */
  let overviewChart = null;

  function renderOverviewChart(range) {
    const canvas = document.getElementById("overviewChart");
    if (!canvas || typeof Chart === "undefined") return;

    const data = OVERVIEW_DATA[range] || OVERVIEW_DATA.month;
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
            label: "Employees Present",
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
     RENDER: DEPARTMENT DONUT CHART + LEGEND
  ========================================================= */
  function renderDeptChart() {
    const canvas = document.getElementById("deptChart");
    const legend = $("#deptLegend");
    const totalEl = $("#donutTotal");
    if (!canvas || typeof Chart === "undefined") return;

    const total = DEPARTMENTS.reduce((sum, d) => sum + d.count, 0);
    if (totalEl) totalEl.textContent = total;

    if (legend) {
      legend.innerHTML = DEPARTMENTS.map((d) => {
        const pct = Math.round((d.count / total) * 100);
        return `
        <li>
          <span class="legend-dot" style="background:${d.color}"></span>
          <span class="dept-name">${d.name}</span>
          <span class="dept-count">${d.count} (${pct}%)</span>
        </li>`;
      }).join("");
    }

    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: DEPARTMENTS.map((d) => d.name),
        datasets: [
          {
            data: DEPARTMENTS.map((d) => d.count),
            backgroundColor: DEPARTMENTS.map((d) => d.color),
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
  function renderBirthdays() {
    const list = $("#birthdaysList");
    if (!list) return;
    list.innerHTML = BIRTHDAYS.map(
      (b) => `
      <div class="birthday-item type-${b.type}">
        <img src="${b.img}" alt="${b.name}" />
        <div class="birthday-item__info">
          <p class="name">${b.name}</p>
          <p class="sub">${b.sub}</p>
        </div>
        <span class="birthday-item__emoji">${b.emoji}</span>
      </div>`,
    ).join("");
  }

  /* =========================================================
     RENDER: QUICK ACTIONS
  ========================================================= */
  function renderQuickActions() {
    const wrap = $("#quickActions");
    if (!wrap) return;
    wrap.innerHTML = QUICK_ACTIONS.map(
      (a) => `
      <button type="button" class="quick-action-btn ${a.color}">
        <i class="${a.icon}"></i>
        <span>${a.label}</span>
        <i class="ri-arrow-right-s-line arrow"></i>
      </button>`,
    ).join("");
  }

  /* =========================================================
     RENDER: RECENT ACTIVITY
  ========================================================= */
  function renderActivity() {
    const list = $("#activityList");
    if (!list) return;
    list.innerHTML = ACTIVITY.map((a) => {
      const avatar = a.img
        ? `<img class="activity-item__avatar" src="${a.img}" alt="${a.title}" />`
        : `<span class="activity-item__avatar icon"><i class="${a.icon}"></i></span>`;

      return `
      <li class="activity-item">
        ${avatar}
        <div class="activity-item__body">
          <p class="activity-item__title">${a.title}</p>
          <p class="activity-item__desc">
            <span class="status-dot ${a.dot}"></span>${a.desc}
          </p>
          <span class="activity-item__time">${a.time}</span>
        </div>
      </li>`;
    }).join("");
  }

  /* =========================================================
     FIREBASE AUTHENTICATION
  ========================================================= */
  const LOGIN_PATH = "../index.html";
  let currentUserData = null; // cached profile (auth + firestore merge)

  async function guardAndLoadUser() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.href = LOGIN_PATH;
          return;
        }

        if (
          !user.emailVerified &&
          user.providerData[0]?.providerId === "password"
        ) {
          // Email/password users must verify before accessing the dashboard
          window.location.href = LOGIN_PATH;
          return;
        }

        let firestoreData = {};
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            firestoreData = userSnap.data();
          }
        } catch (error) {
          console.error("Failed to load user profile:", error);
        }

        currentUserData = {
          uid: user.uid,
          fullName: firestoreData.fullName || user.displayName || "User",
          email: user.email || firestoreData.email || "",
          role: firestoreData.role || "Employee",
          company: firestoreData.company || "",
          photoURL: user.photoURL || firestoreData.photoURL || "",
        };

        applyUserToUI(currentUserData);
        resolve(currentUserData);
      });
    });
  }

  function applyUserToUI(userData) {
    // Sidebar profile block
    const nameEl = $(".sidebar__user .user__name");
    const roleEl = $(".sidebar__user .user__role");
    const avatarEl = $(".sidebar__user .user__avatar");

    if (nameEl) nameEl.textContent = userData.fullName;
    if (roleEl) roleEl.textContent = capitalize(userData.role);
    if (avatarEl && userData.photoURL) {
      avatarEl.src = userData.photoURL;
    } else if (avatarEl) {
      // fallback avatar using initials via a placeholder service
      const initials = encodeURIComponent(userData.fullName.slice(0, 2));
      avatarEl.src = `https://ui-avatars.com/api/?name=${initials}&background=6c5ce7&color=fff`;
    }

    // Welcome header text
    const welcomeNameEl = $("#userName");
    if (welcomeNameEl) {
      welcomeNameEl.textContent = userData.fullName.split(" ")[0];
    }
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      window.location.href = LOGIN_PATH;
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  /* =========================================================
     PROFILE DROPDOWN (sidebar)
  ========================================================= */
  function setupUserMenu() {
    const trigger = $("#userMenuTrigger");
    const menu = $("#userMenu");
    if (!trigger || !menu) return;

    function closeMenu() {
      menu.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    function toggleMenu(e) {
      e.stopPropagation();
      const isOpen = menu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    }

    trigger.addEventListener("click", toggleMenu);
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    menu.querySelectorAll(".user-menu__item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        closeMenu();

        switch (action) {
          case "profile":
            console.log("Navigate to: View Profile");
            break;
          case "password":
            console.log("Navigate to: Change Password");
            break;
          case "help":
            console.log("Navigate to: Help Center");
            break;
          case "logout":
            handleLogout();
            break;
        }
      });
    });
  }

  /* =========================================================
     MOBILE SIDEBAR TOGGLE
  ========================================================= */
  function setupSidebarToggle() {
    const menuBtn = $("#menuToggle");
    const sidebar = $("#sidebar");
    const overlay = $("#sidebarOverlay");
    if (!menuBtn || !sidebar || !overlay) return;

    function open() {
      sidebar.classList.add("open");
      overlay.classList.add("show");
    }

    function close() {
      sidebar.classList.remove("open");
      overlay.classList.remove("show");
    }

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.contains("open") ? close() : open();
    });

    overlay.addEventListener("click", close);
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
     INIT
  ========================================================= */
  async function init() {
    // 1. Auth guard — blocks rendering until we know who's logged in.
    //    Redirects to ../index.html automatically if not authenticated.
    await guardAndLoadUser();

    // 2. Render the rest of the dashboard only after auth passes.
    renderNav();
    renderStats();
    renderDeptChart();
    renderBirthdays();
    renderQuickActions();
    renderActivity();
    renderDate();
    setupOverviewRangeDropdown();
    setupUserMenu();
    setupSidebarToggle();
    renderOverviewChart("month");
  }

  document.addEventListener("DOMContentLoaded", init);

  // Re-draw charts with correct theme colors after a theme toggle,
  // since Chart.js reads colors once at creation time.
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
