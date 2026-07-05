/* ==========================================================
   FIREBASE IMPORTS
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

/* ==========================================================
   CONSTANTS
========================================================== */
export const LOGIN_PATH = "../index.html";

export const NAV_ITEMS = [
  {
    label: "Dashboard",
    icon: "ri-dashboard-line",
    href: "./dashboard.html",
  },
  {
    label: "Employees",
    icon: "ri-user-3-line",
    href: "./employees.html",
  },
  {
    label: "Departments",
    icon: "ri-building-4-line",
    href: "./departments.html",
  },
  {
    label: "Attendance",
    icon: "ri-calendar-check-line",
    href: "./attendance.html",
  },
  {
    label: "Leave",
    icon: "ri-logout-box-r-line",
    href: "./leave.html",
  },
  {
    label: "Payroll",
    icon: "ri-bank-card-line",
    href: "./payroll.html",
  },
  {
    label: "Performance",
    icon: "ri-line-chart-line",
    href: "./performance.html",
  },
  {
    label: "Recruitment",
    icon: "ri-user-search-line",
    href: "./recruitment.html",
  },
  {
    label: "Reports",
    icon: "ri-bar-chart-box-line",
    href: "./reports.html",
  },
  {
    label: "Calendar",
    icon: "ri-calendar-2-line",
    href: "./calendar.html",
  },
  {
    label: "Documents",
    icon: "ri-file-text-line",
    href: "./documents.html",
  },
  {
    label: "Notifications",
    icon: "ri-notification-3-line",
    href: "./notifications.html",
  },
  {
    label: "Help Center",
    icon: "ri-question-line",
    href: "./help-center.html",
  },
  {
    label: "Settings",
    icon: "ri-settings-3-line",
    href: "./settings.html",
  },
];

/* ==========================================================
   HELPERS
========================================================== */
export const $ = (sel, ctx) => (ctx || document).querySelector(sel);

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ==========================================================
   TOAST NOTIFICATION
========================================================== */
export function showToast(type, message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="${type === "success" ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"}"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ==========================================================
   SIDEBAR NAV
========================================================== */
export function renderNav() {
  const list = $("#navList");
  if (!list) return;

  const currentPage = window.location.pathname.split("/").pop();

  list.innerHTML = NAV_ITEMS.map((item) => {
    const itemPage = item.href.split("/").pop();
    const isActive = item.href !== "#" && itemPage === currentPage;
    return `
      <li>
        <a href="${item.href}" class="nav-item${isActive ? " active" : ""}">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      </li>`;
  }).join("");
}

/* ==========================================================
   AUTH GUARD + CURRENT USER
========================================================== */
let currentUserData = null;

export function getCurrentUser() {
  return currentUserData;
}

export async function guardAndLoadUser() {
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
        photoURL: firestoreData.photoURL || user.photoURL || "",
      };

      applyUserToUI(currentUserData);
      resolve(currentUserData);
    });
  });
}

export function applyUserToUI(userData) {
  const nameEl = $(".sidebar__user .user__name");
  const roleEl = $(".sidebar__user .user__role");
  const avatarEl = $(".sidebar__user .user__avatar");

  if (nameEl) nameEl.textContent = userData.fullName;
  if (roleEl) roleEl.textContent = capitalize(userData.role);
  if (avatarEl && userData.photoURL) {
    avatarEl.src = userData.photoURL;
  } else if (avatarEl) {
    const initials = encodeURIComponent(userData.fullName.slice(0, 2));
    avatarEl.src = `https://ui-avatars.com/api/?name=${initials}&background=6c5ce7&color=fff`;
  }

  const welcomeNameEl = $("#userName");
  if (welcomeNameEl) {
    welcomeNameEl.textContent = userData.fullName.split(" ")[0];
  }

  /* ---------- Topbar avatar removed (sidebar already shows profile image) ---------- */
  const topbarAvatarEl = document.querySelector(".topbar__avatar");
  if (topbarAvatarEl) topbarAvatarEl.style.display = "none";
}

/* ==========================================================
   LOGOUT
========================================================== */
export async function handleLogout() {
  try {
    await signOut(auth);
    showToast("success", "Logged out successfully");
    setTimeout(() => {
      window.location.href = LOGIN_PATH;
    }, 700);
  } catch (error) {
    console.error("Logout failed:", error);
    showToast("error", "Logout failed. Please try again.");
  }
}

/* ==========================================================
   PROFILE DROPDOWN (sidebar)
========================================================== */
export function setupUserMenu() {
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
          window.location.href = "./profile.html";
          break;

        case "password":
          window.location.href = "./change-password.html";
          break;

        case "help":
          window.location.href = "./help.html";
          break;

        case "logout":
          handleLogout();
          break;
      }
    });
  });
}

/* ==========================================================
   SIDEBAR TOGGLE (desktop collapse / mobile overlay)
========================================================== */
export function setupSidebarToggle() {
  const menuBtn = $("#menuToggle");
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");
  const app = $(".app");
  if (!menuBtn || !sidebar || !overlay || !app) return;

  const desktopQuery = window.matchMedia("(min-width: 992px)");

  function openMobile() {
    sidebar.classList.add("open");
    overlay.classList.add("show");
  }

  function closeMobile() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  }

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (desktopQuery.matches) {
      app.classList.toggle("sidebar-collapsed");
    } else {
      sidebar.classList.contains("open") ? closeMobile() : openMobile();
    }
  });

  overlay.addEventListener("click", closeMobile);
}
