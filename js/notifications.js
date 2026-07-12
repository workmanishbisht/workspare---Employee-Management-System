/* ==========================================================
   NOTIFICATIONS.JS
   PART 1
   Imports + State + Initialization
========================================================== */

import { db } from "../firebase/firebase.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
  renderNav,
  guardAndLoadUser,
  setupSidebarToggle,
  setupUserMenu,
  showToast,
  getCurrentUser,
  initNotificationBadge,
} from "./layout.js";

/* ==========================================================
   COLLECTIONS
========================================================== */

const notificationsRef = collection(db, "notifications");
const employeesRef = collection(db, "employees");
const holidaysRef = collection(db, "holidays");

/* ==========================================================
   GLOBAL STATE
========================================================== */

let notifications = [];
let employees = [];
let holidays = [];

let filteredNotifications = [];

let currentNotification = null;

let currentPage = 1;
const pageSize = 10;

/* ==========================================================
   DOM ELEMENTS
========================================================== */

// Statistics

const statTotal = document.getElementById("statTotal");
const statUnread = document.getElementById("statUnread");
const statAnnouncement = document.getElementById("statAnnouncement");
const statScheduled = document.getElementById("statScheduled");
const statBirthday = document.getElementById("statBirthday");
const statHoliday = document.getElementById("statHoliday");

// Table

const notificationTableBody = document.getElementById("notificationTableBody");

const notificationCount = document.getElementById("notificationCount");

// Sidebar

const birthdayList = document.getElementById("birthdayList");

const upcomingBirthdayList = document.getElementById("upcomingBirthdayList");

const holidayList = document.getElementById("holidayList");

const recentActivity = document.getElementById("recentActivity");

// Search

const searchInput = document.getElementById("notificationSearch");

// Filters

const filterType = document.getElementById("filterType");

const filterPriority = document.getElementById("filterPriority");

const filterStatus = document.getElementById("filterStatus");

const filterDepartment = document.getElementById("filterDepartment");

const filterAudience = document.getElementById("filterAudience");

// Buttons

const refreshBtn = document.getElementById("refreshNotificationsBtn");

const resetBtn = document.getElementById("resetFiltersBtn");

const announcementBtn = document.getElementById("newAnnouncementBtn");

// Optional: only wired up if these exist in the page markup already.
const markAllReadBtn = document.getElementById("markAllReadBtn");

/* ==========================================================
   HELPERS
========================================================== */

const today = new Date();

function formatDate(date) {
  if (!date) return "-";

  const d = date.toDate ? date.toDate() : new Date(date);

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isBirthdayToday(dateString) {
  if (!dateString) return false;

  const dob = new Date(dateString);

  return (
    dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()
  );
}

function getAge(dateString) {
  if (!dateString) return "";

  const dob = new Date(dateString);

  let age = today.getFullYear() - dob.getFullYear();

  const month = today.getMonth() - dob.getMonth();

  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

/**
 * Unread check shared across the dashboard. Treats the new `isRead`
 * field as the source of truth, but falls back to the legacy `read`
 * field for notifications created before this upgrade.
 */
function isUnread(item) {
  if (typeof item.isRead === "boolean") return !item.isRead;
  if (typeof item.read === "boolean") return !item.read;
  return true;
}

/* ==========================================================
   INIT
========================================================== */

async function init() {
  renderNav();

  await guardAndLoadUser();

  setupSidebarToggle();

  setupUserMenu();

  // Realtime bell/badge — safe to call again here, it's idempotent.
  initNotificationBadge();

  bindEvents();

  await loadInitialData();
}

/* ==========================================================
   LOAD INITIAL DATA
========================================================== */

async function loadInitialData() {
  try {
    await Promise.all([loadNotifications(), loadEmployees(), loadHolidays()]);

    renderDashboard();
  } catch (error) {
    console.error(error);

    showToast("error", "Failed to load notifications.");
  }
}

/* ==========================================================
   START
========================================================== */

document.addEventListener(
  "DOMContentLoaded",

  init,
);

/* ==========================================================
   PART 2
   LOAD DATA + RENDER
========================================================== */

async function loadNotifications() {
  notifications = [];

  const q = query(notificationsRef, orderBy("createdAt", "desc"));

  const snap = await getDocs(q);

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    // Soft-deleted notifications never show up in the list/table.
    if (data.isDeleted === true) return;

    notifications.push({
      id: docSnap.id,

      ...data,
    });
  });

  filteredNotifications = [...notifications];
}

async function loadEmployees() {
  employees = [];

  const snap = await getDocs(employeesRef);

  snap.forEach((docSnap) => {
    employees.push({
      id: docSnap.id,

      ...docSnap.data(),
    });
  });
}

async function loadHolidays() {
  holidays = [];

  const snap = await getDocs(holidaysRef);

  snap.forEach((docSnap) => {
    holidays.push({
      id: docSnap.id,

      ...docSnap.data(),
    });
  });
}

/* ==========================================================
   MAIN RENDER
========================================================== */

function renderDashboard() {
  renderStatistics();

  renderSummary();

  renderTable();

  renderBirthdays();

  renderUpcomingBirthdays();

  renderHolidays();

  renderRecentActivity();
}

/* ==========================================================
   STATISTICS
========================================================== */

function renderStatistics() {
  const unread = notifications.filter((n) => isUnread(n)).length;

  const announcements = notifications.filter(
    (n) => n.type === "Announcement",
  ).length;

  const scheduled = notifications.filter(
    (n) => n.status === "Scheduled",
  ).length;

  const birthdays = employees.filter((e) =>
    isBirthdayToday(e.dateOfBirth || e.dob),
  ).length;

  statTotal.textContent = notifications.length;

  statUnread.textContent = unread;

  statAnnouncement.textContent = announcements;

  statScheduled.textContent = scheduled;

  statBirthday.textContent = birthdays;

  statHoliday.textContent = holidays.length;
}

/* ==========================================================
   SUMMARY
========================================================== */

function renderSummary() {
  const setValue = (id, value) => {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = value;
    }
  };

  setValue(
    "summaryTotal",

    notifications.length,
  );

  setValue(
    "summaryUnread",

    notifications.filter((n) => isUnread(n)).length,
  );

  setValue(
    "summaryPublished",

    notifications.filter((n) => n.status === "Published").length,
  );

  setValue(
    "summaryScheduled",

    notifications.filter((n) => n.status === "Scheduled").length,
  );
}

/* ==========================================================
   TABLE
========================================================== */

function renderTable() {
  notificationTableBody.innerHTML = "";

  notificationCount.textContent = filteredNotifications.length;

  if (filteredNotifications.length === 0) {
    notificationTableBody.innerHTML = `

        <tr>

        <td colspan="8">

            <div class="empty-state">

                <i class="ri-notification-off-line"></i>

                <h3>

                    No Notifications Found

                </h3>

                <p>

                    Create your first announcement.

                </p>

            </div>

        </td>

        </tr>

        `;

    return;
  }

  filteredNotifications.forEach((item) => {
    const unread = isUnread(item);

    notificationTableBody.insertAdjacentHTML(
      "beforeend",

      `

<tr class="${unread ? "is-unread" : ""}">

<td>

<div class="notification-info">

<div class="notification-avatar">

<i class="ri-notification-3-fill"></i>

</div>

<div class="notification-text">

<h5>${item.title || "-"}</h5>

<p>${item.description || item.message || ""}</p>

</div>

</div>

</td>

<td>

<span class="type-chip type-${(item.type || "announcement").toLowerCase()}">

${item.type || "Announcement"}

</span>

</td>

<td>

<span class="priority-badge priority-${(item.priority || "low").toLowerCase()}">

${item.priority || "Low"}

</span>

</td>

<td>

${item.department || "All"}

</td>

<td>

${item.audience || "Everyone"}

</td>

<td>

<span class="status-badge status-${(item.status || "published").toLowerCase()}">

${item.status || "Published"}

</span>

</td>

<td>

${formatDate(item.createdAt)}

</td>

<td>

<div class="row-actions">

${
  unread
    ? `<button class="action-btn mark-read-btn" title="Mark as read" data-id="${item.id}"><i class="ri-mail-check-line"></i></button>`
    : ""
}

<button class="action-btn view-btn"

data-id="${item.id}">

<i class="ri-eye-line"></i>

</button>

<button class="action-btn edit-btn"

data-id="${item.id}">

<i class="ri-pencil-line"></i>

</button>

<button class="action-btn delete-btn"

data-id="${item.id}">

<i class="ri-delete-bin-6-line"></i>

</button>

</div>

</td>

</tr>

`,
    );
  });
}

/* ==========================================================
   PART 3
   BIRTHDAYS + HOLIDAYS + RECENT ACTIVITY
========================================================== */

/* ==========================================================
   TODAY'S BIRTHDAYS
========================================================== */

function renderBirthdays() {
  birthdayList.innerHTML = "";

  const birthdays = employees.filter((emp) =>
    isBirthdayToday(emp.dateOfBirth || emp.dob),
  );

  if (!birthdays.length) {
    birthdayList.innerHTML = `
            <div class="no-birthday">
                <i class="ri-cake-2-line"></i>
                <h5>No Birthdays Today</h5>
                <p>No employees are celebrating today.</p>
            </div>
        `;

    return;
  }

  birthdays.forEach((emp) => {
    const image =
      emp.photoURL ||
      emp.profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.fullName || emp.name || "Employee")}`;

    birthdayList.insertAdjacentHTML(
      "beforeend",
      `
            <div class="birthday-item">

                <img src="${image}" alt="">

                <div class="birthday-info">

                    <h5>${emp.fullName || emp.name}</h5>

                    <p>

                        ${emp.department || "Department"}

                        •

                        ${emp.designation || "Employee"}

                    </p>

                    <span class="birthday-badge">

                        🎂 ${getAge(emp.dateOfBirth || emp.dob)} Years

                    </span>

                </div>

                <button
                    class="btn btn-sm btn-primary birthday-wish-btn"
                    data-id="${emp.id}"
                >

                    Wish

                </button>

            </div>
            `,
    );
  });
}

/* ==========================================================
   UPCOMING BIRTHDAYS
========================================================== */

function renderUpcomingBirthdays() {
  upcomingBirthdayList.innerHTML = "";

  const upcoming = [...employees]

    .filter((emp) => emp.dateOfBirth || emp.dob)

    .sort((a, b) => {
      const da = new Date(a.dateOfBirth || a.dob);

      const db = new Date(b.dateOfBirth || b.dob);

      return da.getMonth() - db.getMonth() || da.getDate() - db.getDate();
    })

    .slice(0, 5);

  if (!upcoming.length) {
    upcomingBirthdayList.innerHTML = `<p>No upcoming birthdays.</p>`;

    return;
  }

  upcoming.forEach((emp) => {
    const img =
      emp.photoURL ||
      emp.profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.fullName || emp.name)}`;

    upcomingBirthdayList.insertAdjacentHTML(
      "beforeend",

      `

<div class="upcoming-person">

<img src="${img}">

<div>

<strong>

${emp.fullName || emp.name}

</strong>

<small>

${formatDate(emp.dateOfBirth || emp.dob)}

</small>

</div>

</div>

`,
    );
  });
}

/* ==========================================================
   HOLIDAYS
========================================================== */

function renderHolidays() {
  holidayList.innerHTML = "";

  if (!holidays.length) {
    holidayList.innerHTML = `<p>No upcoming holidays.</p>`;

    return;
  }

  holidays.forEach((item) => {
    holidayList.insertAdjacentHTML(
      "beforeend",

      `

<div class="holiday-item">

<div class="holiday-icon">

<i class="ri-calendar-event-fill"></i>

</div>

<div class="holiday-info">

<h5>

${item.name}

</h5>

<p>

${formatDate(item.date)}

</p>

</div>

<span class="days-left">

Upcoming

</span>

</div>

`,
    );
  });
}

/* ==========================================================
   RECENT ACTIVITY
========================================================== */

function renderRecentActivity() {
  recentActivity.innerHTML = "";

  notifications

    .slice(0, 6)

    .forEach((item) => {
      recentActivity.insertAdjacentHTML(
        "beforeend",

        `

<div class="activity-item">

<div class="activity-dot"></div>

<div class="activity-content">

<h6>

${item.title || "Notification"}

</h6>

<p>

${item.description || item.message || ""}

</p>

<div class="activity-time">

${formatDate(item.createdAt)}

</div>

</div>

</div>

`,
      );
    });
}

/* ==========================================================
   PART 4
   SEARCH + FILTER + CRUD + EVENTS
========================================================== */

/* ==========================================================
   SEARCH
========================================================== */

function applyFilters() {
  const search = searchInput.value.toLowerCase().trim();

  const type = filterType.value;

  const priority = filterPriority.value;

  const status = filterStatus.value;

  const department = filterDepartment.value;

  const audience = filterAudience.value;

  filteredNotifications = notifications.filter((item) => {
    const matchSearch =
      (item.title || "").toLowerCase().includes(search) ||
      (item.description || item.message || "").toLowerCase().includes(search);

    const matchType = !type || item.type === type;

    const matchPriority = !priority || item.priority === priority;

    const matchStatus = !status || item.status === status;

    const matchDepartment = !department || item.department === department;

    const matchAudience = !audience || item.audience === audience;

    return (
      matchSearch &&
      matchType &&
      matchPriority &&
      matchStatus &&
      matchDepartment &&
      matchAudience
    );
  });

  renderTable();
}

/* ==========================================================
   RESET FILTERS
========================================================== */

function resetFilters() {
  searchInput.value = "";

  filterType.value = "";

  filterPriority.value = "";

  filterStatus.value = "";

  filterDepartment.value = "";

  filterAudience.value = "";

  filteredNotifications = [...notifications];

  renderTable();
}

/* ==========================================================
   CREATE NOTIFICATION
   Populates the full notification object required by the global
   badge system: title, description, type, priority, status,
   createdAt, createdBy, audience, isRead, isDeleted.
========================================================== */

async function createNotification(data) {
  try {
    const user = getCurrentUser?.() || {};

    await addDoc(
      notificationsRef,

      {
        title: data.title || "",
        description: data.description || data.message || "",
        type: data.type || "Announcement",
        priority: data.priority || "Low",
        status: data.status || "Published",
        department: data.department || "All",
        audience: data.audience || "All",

        createdBy: user.uid || user.fullName || "system",

        isRead: false,
        isDeleted: false,

        createdAt: Timestamp.now(),

        updatedAt: Timestamp.now(),
      },
    );

    showToast(
      "success",

      "Notification Created",
    );

    // The global onSnapshot listener in layout.js updates the badge
    // automatically the moment this write lands — no manual refresh
    // call is needed here.

    await loadNotifications();

    renderDashboard();
  } catch (error) {
    console.error(error);

    showToast(
      "error",

      "Unable to create notification.",
    );
  }
}

/* ==========================================================
   UPDATE
========================================================== */

async function updateNotification(id, data) {
  try {
    await updateDoc(
      doc(db, "notifications", id),

      {
        ...data,

        updatedAt: Timestamp.now(),
      },
    );

    showToast(
      "success",

      "Notification Updated",
    );

    await loadNotifications();

    renderDashboard();
  } catch (error) {
    console.error(error);
  }
}

/* ==========================================================
   MARK AS READ (single)
========================================================== */

async function markNotificationRead(id) {
  try {
    await updateDoc(doc(db, "notifications", id), {
      isRead: true,
      updatedAt: Timestamp.now(),
    });

    // Badge decreases automatically via the realtime listener.

    await loadNotifications();

    renderDashboard();
  } catch (error) {
    console.error(error);

    showToast("error", "Unable to mark notification as read.");
  }
}

/* ==========================================================
   MARK ALL AS READ
========================================================== */

async function markAllNotificationsRead() {
  const unread = notifications.filter((n) => isUnread(n));

  if (!unread.length) {
    showToast("success", "No unread notifications.");
    return;
  }

  try {
    const batch = writeBatch(db);

    unread.forEach((n) => {
      batch.update(doc(db, "notifications", n.id), {
        isRead: true,
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();

    showToast("success", "All notifications marked as read.");

    // Badge hides automatically once the batch commits.

    await loadNotifications();

    renderDashboard();
  } catch (error) {
    console.error(error);

    showToast("error", "Unable to mark all as read.");
  }
}

/* ==========================================================
   DELETE
========================================================== */

async function removeNotification(id) {
  try {
    await deleteDoc(doc(db, "notifications", id));

    showToast(
      "success",

      "Notification Deleted",
    );

    // Badge/unread count refreshes instantly via the realtime listener.

    await loadNotifications();

    renderDashboard();
  } catch (error) {
    console.error(error);
  }
}

/* ==========================================================
   BIRTHDAY WISH
========================================================== */

function sendBirthdayWish(employeeId) {
  showToast(
    "success",

    "Birthday wishes sent 🎉",
  );
}

/* ==========================================================
   EVENTS
========================================================== */

function bindEvents() {
  /* Search */

  searchInput?.addEventListener(
    "input",

    applyFilters,
  );

  /* Filters */

  [
    filterType,

    filterPriority,

    filterStatus,

    filterDepartment,

    filterAudience,
  ].forEach((el) => {
    el?.addEventListener(
      "change",

      applyFilters,
    );
  });

  /* Reset */

  resetBtn?.addEventListener(
    "click",

    resetFilters,
  );

  /* Refresh */

  refreshBtn?.addEventListener(
    "click",

    async () => {
      await loadInitialData();

      showToast(
        "success",

        "Notifications refreshed.",
      );
    },
  );

  /* Mark All As Read (only wired up if the button exists on the page) */

  markAllReadBtn?.addEventListener(
    "click",

    markAllNotificationsRead,
  );

  /* Table Actions */

  notificationTableBody.addEventListener(
    "click",

    async (e) => {
      const btn = e.target.closest(".action-btn");

      if (!btn) return;

      const id = btn.dataset.id;

      if (btn.classList.contains("mark-read-btn")) {
        await markNotificationRead(id);
        return;
      }

      if (btn.classList.contains("view-btn")) {
        await markNotificationRead(id);
        window.location.href = `notification-details.html?id=${id}`;
      }

      if (btn.classList.contains("edit-btn")) {
        currentNotification = id;

        // Open Edit Modal
      }

      if (btn.classList.contains("delete-btn")) {
        const yes = confirm("Delete this notification?");

        if (yes) {
          await removeNotification(id);
        }
      }
    },
  );

  /* Birthday Wish */

  birthdayList.addEventListener(
    "click",

    (e) => {
      const btn = e.target.closest(".birthday-wish-btn");

      if (!btn) return;

      sendBirthdayWish(btn.dataset.id);
    },
  );
}

/* ==========================================================
   PART 5
   MODALS + VIEW + EDIT + DELETE
========================================================== */

const announcementModal = document.getElementById("announcementModal");

const deleteModal = document.getElementById("deleteNotificationModal");

const birthdayModal = document.getElementById("birthdayWishModal");

/* ==========================================================
   MODAL HELPERS
========================================================== */

function openModal(modal) {
  modal?.classList.remove("hidden");
}

function closeModal(modal) {
  modal?.classList.add("hidden");
}

/* ==========================================================
   ANNOUNCEMENT
========================================================== */

announcementBtn?.addEventListener("click", () => {
  openModal(announcementModal);
});

document
  .getElementById("closeAnnouncementModal")
  ?.addEventListener("click", () => {
    closeModal(announcementModal);
  });

document.getElementById("cancelAnnouncement")?.addEventListener("click", () => {
  closeModal(announcementModal);
});

/* ==========================================================
   DELETE
========================================================== */

let deleteId = null;

function openDeleteModal(id) {
  deleteId = id;

  openModal(deleteModal);
}

document
  .getElementById("cancelDeleteNotification")
  ?.addEventListener("click", () => {
    deleteId = null;

    closeModal(deleteModal);
  });

document
  .getElementById("confirmDeleteNotification")
  ?.addEventListener("click", async () => {
    if (!deleteId) return;

    await removeNotification(deleteId);

    closeModal(deleteModal);

    deleteId = null;
  });

/* ==========================================================
   BIRTHDAY MODAL
========================================================== */

function openBirthdayModal(id) {
  currentNotification = id;

  openModal(birthdayModal);
}

document.getElementById("closeBirthdayModal")?.addEventListener("click", () => {
  closeModal(birthdayModal);
});

document.getElementById("cancelBirthdayWish")?.addEventListener("click", () => {
  closeModal(birthdayModal);
});

document.getElementById("sendBirthdayWish")?.addEventListener("click", () => {
  showToast(
    "success",

    "Birthday wishes sent.",
  );

  closeModal(birthdayModal);
});

/* ==========================================================
   TABLE ACTIONS
========================================================== */

notificationTableBody.addEventListener(
  "click",

  (e) => {
    const btn = e.target.closest(".action-btn");

    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.classList.contains("mark-read-btn")) {
      markNotificationRead(id);
    } else if (btn.classList.contains("view-btn")) {
      markNotificationRead(id);
      window.location.href = `notification-details.html?id=${id}`;
    } else if (btn.classList.contains("edit-btn")) {
      currentNotification = id;

      openModal(announcementModal);
    } else if (btn.classList.contains("delete-btn")) {
      openDeleteModal(id);
    }
  },
);

/* ==========================================================
   BIRTHDAY BUTTON
========================================================== */

birthdayList.addEventListener(
  "click",

  (e) => {
    const btn = e.target.closest(".birthday-wish-btn");

    if (!btn) return;

    openBirthdayModal(btn.dataset.id);
  },
);

/* ==========================================================
   CLOSE MODALS ON OVERLAY
========================================================== */

document.querySelectorAll(".modal-overlay").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

/* ==========================================================
   ESC KEY
========================================================== */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal(announcementModal);

    closeModal(deleteModal);

    closeModal(birthdayModal);
  }
});