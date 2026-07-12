/* ==========================================================
   Layout js - FIREBASE IMPORTS
========================================================== */
import { auth, db } from "../firebase/firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ==========================================================
   CONSTANTS
========================================================== */
export const LOGIN_PATH = "../index.html";

const THEME_KEY = "theme";
const SIDEBAR_COLLAPSED_KEY = "hrms:sidebarCollapsed";
const USER_CACHE_KEY = "hrms:userCache";
const AUTH_TIMEOUT_MS = 6000;

export const NAV_ITEMS = [
  { label: "Dashboard", icon: "ri-dashboard-line", href: "./dashboard.html" },
  { label: "Employees", icon: "ri-user-3-line", href: "./employees.html" },
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
    href: "./leave-management.html",
  },
  { label: "Payroll", icon: "ri-bank-card-line", href: "./payroll.html" },

  { label: "Holidays", icon: "ri-calendar-2-line", href: "./holiday.html" },
  { label: "Documents", icon: "ri-file-text-line", href: "./documents.html" },
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
  { label: "Settings", icon: "ri-settings-3-line", href: "./settings.html" },
];

/* ==========================================================
   DOM HELPERS
========================================================== */
export const $ = (sel, ctx) => (ctx || document).querySelector(sel);
export const $$ = (sel, ctx) =>
  Array.from((ctx || document).querySelectorAll(sel));

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ==========================================================
   SAFE STORAGE HELPERS
========================================================== */
function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    /* storage unavailable (private mode / quota) — fail silently */
  }
}

function readJSON(storage, key) {
  const raw = readStorage(storage, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeJSON(storage, key, value) {
  writeStorage(storage, key, JSON.stringify(value));
}

/* ==========================================================
   THEME MANAGER
   ----------------------------------------------------------
========================================================== */
function getStoredTheme() {
  const stored = readStorage(localStorage, THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia?.(
    "(prefers-color-scheme: dark)",
  ).matches;
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark-theme", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  syncThemeToggleUI(theme);
}

function syncThemeToggleUI(theme) {
  const ACTIVE = "theme-toggle__option--active";
  const lightBtn = $("#themeToggleLight");
  const darkBtn = $("#themeToggleDark");

  if (lightBtn) lightBtn.classList.toggle(ACTIVE, theme !== "dark");
  if (darkBtn) darkBtn.classList.toggle(ACTIVE, theme === "dark");

  const toggleBtn = $("#themeToggle");
  if (toggleBtn)
    toggleBtn.setAttribute("aria-pressed", String(theme === "dark"));
}

export function setTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  writeStorage(localStorage, THEME_KEY, theme);
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());

  if (window.__hrmsThemeSyncBound) return;
  window.__hrmsThemeSyncBound = true;

  window.addEventListener("storage", (e) => {
    if (
      e.key === THEME_KEY &&
      (e.newValue === "light" || e.newValue === "dark")
    ) {
      applyTheme(e.newValue);
    }
  });
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

// Shimmer loader

const SKELETON_ACTIVE_CLASS = "is-loading";

function resolveSkeletonEls(skeletonId, contentId) {
  return {
    skeletonEl: skeletonId ? document.getElementById(skeletonId) : null,
    contentEl: contentId ? document.getElementById(contentId) : null,
  };
}

export function showSkeleton(skeletonId, contentId) {
  const { skeletonEl, contentEl } = resolveSkeletonEls(skeletonId, contentId);
  if (skeletonEl) {
    skeletonEl.hidden = false;
    skeletonEl.classList.add(SKELETON_ACTIVE_CLASS);
    skeletonEl.setAttribute("aria-busy", "true");
  }
  if (contentEl) {
    contentEl.hidden = true;
  }
}

export function hideSkeleton(skeletonId, contentId) {
  const { skeletonEl, contentEl } = resolveSkeletonEls(skeletonId, contentId);
  if (skeletonEl) {
    skeletonEl.hidden = true;
    skeletonEl.classList.remove(SKELETON_ACTIVE_CLASS);
    skeletonEl.setAttribute("aria-busy", "false");
  }
  if (contentEl) {
    contentEl.hidden = false;
  }
}

export function toggleSkeleton(skeletonId, contentId, loading) {
  if (loading) {
    showSkeleton(skeletonId, contentId);
  } else {
    hideSkeleton(skeletonId, contentId);
  }
}

/* ==========================================================
   SIDEBAR NAV
========================================================== */
let navRendered = false;

export function renderNav() {
  const list = $("#navList");
  if (!list || navRendered) return;

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

  navRendered = true;
}

/* ==========================================================
   SIDEBAR COLLAPSE STATE
========================================================== */
function getStoredSidebarCollapsed() {
  return readStorage(localStorage, SIDEBAR_COLLAPSED_KEY) === "true";
}

function applySidebarCollapsed(collapsed) {
  const app = $(".app");
  if (!app) return;
  app.classList.toggle("sidebar-collapsed", collapsed);
}

export function restoreSidebarState() {
  applySidebarCollapsed(getStoredSidebarCollapsed());
}

/* ==========================================================
   AUTH GUARD + CURRENT USER (with instant cache)
   ----------------------------------------------------------
========================================================== */
let currentUserData = null;
let authListenerBound = false;
let authResolvedPromise = null;

export function getCurrentUser() {
  return currentUserData;
}

function readCachedUser(uid) {
  const cached = readJSON(sessionStorage, USER_CACHE_KEY);
  if (cached && cached.uid === uid) return cached;
  return null;
}

function writeCachedUser(userData) {
  writeJSON(sessionStorage, USER_CACHE_KEY, userData);
}

function buildUserData(user, firestoreData) {
  return {
    uid: user.uid,
    fullName: firestoreData.fullName || user.displayName || "User",
    email: user.email || firestoreData.email || "",
    role: firestoreData.role || "Employee",
    department: firestoreData.department || "",
    company: firestoreData.company || "",
    photoURL: resolveProfileImage(user, firestoreData),
    authProvider: user.providerData[0]?.providerId || "password",
  };
}

async function fetchFirestoreUser(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() : {};
  } catch (error) {
    console.error("Failed to load user profile:", error);
    return {};
  }
}

export function guardAndLoadUser() {
  if (authResolvedPromise) return authResolvedPromise;

  authResolvedPromise = new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Safety net: if Firebase never calls back (bad config, offline,
    // blocked network request, etc.) the page must still render
    // instead of staying stuck on the skeleton forever.
    const timeoutId = setTimeout(() => {
      console.error(
        "[layout.js] Auth check timed out after " +
          AUTH_TIMEOUT_MS +
          "ms — check that ../firebase/firebase.js resolves and that " +
          "the Firebase project config is valid. Rendering page without " +
          "a confirmed session.",
      );
      settle(currentUserData);
    }, AUTH_TIMEOUT_MS);

    if (authListenerBound) return;
    authListenerBound = true;

    try {
      onAuthStateChanged(
        auth,
        async (user) => {
          try {
            if (!user) {
              clearTimeout(timeoutId);
              teardownNotifBadgeListener();
              window.location.href = LOGIN_PATH;
              settle(null);
              return;
            }

            if (
              !user.emailVerified &&
              user.providerData[0]?.providerId === "password"
            ) {
              clearTimeout(timeoutId);
              window.location.href = LOGIN_PATH;
              settle(null);
              return;
            }

            const cached = readCachedUser(user.uid);
            if (cached) {
              currentUserData = cached;
              applyUserToUI(currentUserData);
              clearTimeout(timeoutId);
              settle(currentUserData);
            }

            const firestoreData = await fetchFirestoreUser(user.uid);
            const freshUserData = buildUserData(user, firestoreData);

            currentUserData = freshUserData;
            writeCachedUser(freshUserData);
            applyUserToUI(freshUserData);

            clearTimeout(timeoutId);
            settle(freshUserData);
          } catch (error) {
            console.error("[layout.js] Auth state handling failed:", error);
            clearTimeout(timeoutId);
            settle(currentUserData);
          }
        },
        (error) => {
          console.error("[layout.js] onAuthStateChanged error:", error);
          clearTimeout(timeoutId);
          settle(currentUserData);
        },
      );
    } catch (error) {
      console.error(
        "[layout.js] Failed to attach auth listener — is Firebase initialised correctly in ../firebase/firebase.js?",
        error,
      );
      clearTimeout(timeoutId);
      settle(currentUserData);
    }
  });

  return authResolvedPromise;
}

/* ==========================================================
   PROFILE IMAGE RESOLUTION
========================================================== */
function resolveProfileImage(user, firestoreData) {
  const isGoogleUser = user.providerData[0]?.providerId === "google.com";

  if (isGoogleUser && user.photoURL) {
    return user.photoURL;
  }

  if (firestoreData.photoURL) {
    return firestoreData.photoURL;
  }

  if (user.photoURL) {
    return user.photoURL;
  }

  return "";
}

function buildInitialsAvatar(fullName) {
  const initials = encodeURIComponent(fullName.slice(0, 2));
  return `https://ui-avatars.com/api/?name=${initials}&background=6c5ce7&color=fff`;
}

/* ==========================================================
   APPLY USER TO UI
========================================================== */
export function applyUserToUI(userData) {
  if (!userData) return;

  const nameEl = $(".sidebar__user .user__name");
  const roleEl = $(".sidebar__user .user__role");
  const avatarEl = $(".sidebar__user .user__avatar");

  if (nameEl) nameEl.textContent = userData.fullName;
  if (roleEl) roleEl.textContent = capitalize(userData.role);

  const fallbackAvatar = buildInitialsAvatar(userData.fullName || "U");

  if (avatarEl) {
    avatarEl.referrerPolicy = "no-referrer";
    avatarEl.onerror = () => {
      avatarEl.onerror = null;
      avatarEl.src = fallbackAvatar;
    };
    avatarEl.src = userData.photoURL || fallbackAvatar;
  }

  const welcomeNameEl = $("#userName");
  if (welcomeNameEl) {
    welcomeNameEl.textContent = (userData.fullName || "User").split(" ")[0];
  }

  const topbarAvatarEl = document.querySelector(".topbar__avatar");
  if (topbarAvatarEl) topbarAvatarEl.style.display = "none";
}

/* ==========================================================
   LOGOUT
========================================================== */
export async function handleLogout() {
  try {
    teardownNotifBadgeListener();
    await signOut(auth);
    try {
      sessionStorage.removeItem(USER_CACHE_KEY);
    } catch (error) {
      /* ignore */
    }
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
let userMenuBound = false;

export function setupUserMenu() {
  const trigger = $("#userMenuTrigger");
  const menu = $("#userMenu");
  if (!trigger || !menu || userMenuBound) return;
  userMenuBound = true;

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
          window.location.href = "./help-center.html";
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
let sidebarToggleBound = false;

export function setupSidebarToggle() {
  const menuBtn = $("#menuToggle");
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");
  const app = $(".app");
  if (!menuBtn || !sidebar || !overlay || !app || sidebarToggleBound) return;
  sidebarToggleBound = true;

  restoreSidebarState();

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
      const collapsed = app.classList.toggle("sidebar-collapsed");
      writeStorage(localStorage, SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } else {
      sidebar.classList.contains("open") ? closeMobile() : openMobile();
    }
  });

  overlay.addEventListener("click", closeMobile);
}

/* ==========================================================
   GLOBAL REALTIME NOTIFICATION BADGE
   ----------------------------------------------------------
   - Single onSnapshot listener over the "notifications" collection,
     attached once per page load (guarded against duplicates).
   - Works globally because layout.js is imported by every module
     (Dashboard, Employees, Departments, Attendance, Leave, Payroll,
     Holiday, Documents, Notifications, Help Center, Settings) — no
     per-page wiring or HTML changes are required.
   - Reuses the existing #notifBadge element. Does not create a new
     badge and does not touch page markup or CSS.
========================================================== */
const NOTIF_BADGE_ID = "notifBadge";
const NOTIFICATIONS_PAGE = "./notifications.html";

let notifBadgeUnsubscribe = null;
let notifBellClickBound = false;

/**
 * A notification is "unread" if isRead is explicitly false, OR — for
 * documents created before this upgrade — if the legacy `read` field
 * is falsy. Anything without either field defaults to unread so new
 * notifications are never silently missed.
 */
function isNotifUnread(data) {
  if (typeof data.isRead === "boolean") return !data.isRead;
  if (typeof data.read === "boolean") return !data.read;
  return true;
}

function isNotifDeleted(data) {
  return data.isDeleted === true;
}

/**
 * Decides whether a notification is meant for the signed-in user.
 * Supports a single string audience ("All", a role, a department, or
 * a specific uid) as well as an array of audience values.
 */
function notifMatchesAudience(data, user) {
  const audience = data.audience;

  if (!audience || audience === "All" || audience === "Everyone") {
    return true;
  }

  const candidates = [
    user?.uid,
    user?.role,
    user?.department,
    user?.company,
  ].filter(Boolean);

  if (Array.isArray(audience)) {
    return audience.some(
      (a) => a === "All" || a === "Everyone" || candidates.includes(a),
    );
  }

  return candidates.includes(audience);
}

function computeUnreadCount(snapshot, user) {
  let count = 0;
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (
      !isNotifDeleted(data) &&
      isNotifUnread(data) &&
      notifMatchesAudience(data, user)
    ) {
      count++;
    }
  });
  return count;
}

/* ----------------------------------------------------------
   BADGE RENDER (0 -> hidden, 1-99 -> count, 100+ -> "99+")
---------------------------------------------------------- */
function renderNotifBadge(count) {
  const badge = document.getElementById(NOTIF_BADGE_ID);
  if (!badge) return;

  if (!count || count <= 0) {
    badge.textContent = "";
    badge.hidden = true;
    badge.style.display = "none";
    badge.classList.remove("show");
    badge.setAttribute("aria-hidden", "true");
    return;
  }

  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = false;
  badge.style.display = "";
  badge.classList.add("show");
  badge.removeAttribute("aria-hidden");
}

/* ----------------------------------------------------------
   BELL CLICK -> notifications.html
   Tries common bell wrapper ids/selectors first, then falls back to
   the closest clickable ancestor of the badge itself, so no HTML
   needs to be modified to wire this up.
---------------------------------------------------------- */
function getNotifBellTrigger() {
  const badge = document.getElementById(NOTIF_BADGE_ID);
  return (
    document.getElementById("notifBell") ||
    document.getElementById("notificationBell") ||
    document.querySelector("[data-notif-bell]") ||
    document.querySelector(".topbar__notif") ||
    badge?.closest("a, button, .topbar__icon-btn, .icon-btn") ||
    badge
  );
}

function bindNotifBellClick() {
  if (notifBellClickBound) return;

  const trigger = getNotifBellTrigger();
  if (!trigger) return;

  notifBellClickBound = true;
  trigger.style.cursor = "pointer";
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = NOTIFICATIONS_PAGE;
  });
}

/* ----------------------------------------------------------
   ATTACH / TEARDOWN
   Only one listener is ever created (notifBadgeUnsubscribe guard).
---------------------------------------------------------- */
function attachNotifBadgeListener(user) {
  if (notifBadgeUnsubscribe) return; // already listening, avoid duplicates

  try {
    notifBadgeUnsubscribe = onSnapshot(
      collection(db, "notifications"),
      (snapshot) => {
        renderNotifBadge(computeUnreadCount(snapshot, user));
      },
      (error) => {
        console.error("[layout.js] Notification badge listener error:", error);
      },
    );
  } catch (error) {
    console.error("[layout.js] Failed to attach notification listener:", error);
  }
}

export function teardownNotifBadgeListener() {
  if (notifBadgeUnsubscribe) {
    notifBadgeUnsubscribe();
    notifBadgeUnsubscribe = null;
  }
}

/**
 * Public entry point. Safe to call from any page (including
 * notifications.js) — idempotent thanks to the guards above.
 */
export function initNotificationBadge() {
  bindNotifBellClick();
  guardAndLoadUser()
    .then((user) => attachNotifBadgeListener(user))
    .catch((error) => {
      console.error("[layout.js] Notification badge init failed:", error);
    });
}

/* ----------------------------------------------------------
   AUTO-INIT
   layout.js is imported by every page's controller script, so the
   badge wires itself up automatically — no changes needed in any
   other file.
---------------------------------------------------------- */
if (typeof document !== "undefined" && !window.__hrmsNotifBadgeAutoInit) {
  window.__hrmsNotifBadgeAutoInit = true;

  const startNotifBadge = () => initNotificationBadge();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startNotifBadge, {
      once: true,
    });
  } else {
    startNotifBadge();
  }

  window.addEventListener("beforeunload", teardownNotifBadgeListener, {
    once: true,
  });
}
