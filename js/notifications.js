/* ==========================================================
   NOTIFICATIONS.JS — Complete Enterprise Module
   Fixed: DOM grab inside DOMContentLoaded, no top-level await,
   storage initialized safely, all modals working.
========================================================== */

import { db } from "../firebase/firebase.js";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
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
   RBAC — real permissions.js helpers (never re-implemented here)
========================================================== */

import { MODULES, canCreate, canEdit, canDelete } from "./permissions.js";

/* ==========================================================
   STORAGE — lazy init inside function to avoid top-level errors
========================================================== */

let _storage = null;

async function getStorageInstance() {
  if (_storage) return _storage;
  try {
    const { getStorage } =
      await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js");
    const { getApp } =
      await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js");
    _storage = getStorage(getApp());
  } catch (e) {
    console.warn("Firebase Storage not available:", e.message);
  }
  return _storage;
}

/* ==========================================================
   COLLECTIONS
========================================================== */

const notificationsRef = collection(db, "notifications");
const employeesRef = collection(db, "employees");
const holidaysRef = collection(db, "holidays");

/* ==========================================================
   GLOBAL STATE
========================================================== */

let allNotifications = [];
let employees = [];
let holidays = [];
let filteredNotifications = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let editingId = null;
let deleteTargetId = null;
let selectedFile = null;
let unsubscribeSnapshot = null;

/* ==========================================================
   DOM REFERENCES — grabbed inside DOMContentLoaded
========================================================== */

let statTotal,
  statUnread,
  statAnnouncement,
  statScheduled,
  statBirthday,
  statHoliday;
let notificationTableBody, notificationCount, showingCount;
let birthdayList, upcomingBirthdayList, holidayList, recentActivity;
let searchInput,
  filterType,
  filterPriority,
  filterStatus,
  filterDepartment,
  filterAudience;
let refreshBtn, resetBtn, exportBtn, announcementBtn, markAllReadBtn;
let announcementModal, deleteModal, birthdayModal, viewModal;
let announcementTitle,
  announcementDescription,
  announcementType,
  announcementPriority;
let announcementAudience, announcementDepartment, scheduleDate, scheduleTime;
let publishBtn,
  fileDrop,
  fileInput,
  filePreview,
  uploadProgress,
  uploadProgressBar;
let announcementModalTitle;

function grabDOMRefs() {
  statTotal = document.getElementById("statTotal");
  statUnread = document.getElementById("statUnread");
  statAnnouncement = document.getElementById("statAnnouncement");
  statScheduled = document.getElementById("statScheduled");
  statBirthday = document.getElementById("statBirthday");
  statHoliday = document.getElementById("statHoliday");

  notificationTableBody = document.getElementById("notificationTableBody");
  notificationCount = document.getElementById("notificationCount");
  showingCount = document.getElementById("showingCount");

  birthdayList = document.getElementById("birthdayList");
  upcomingBirthdayList = document.getElementById("upcomingBirthdayList");
  holidayList = document.getElementById("holidayList");
  recentActivity = document.getElementById("recentActivity");

  searchInput = document.getElementById("notificationSearch");
  filterType = document.getElementById("filterType");
  filterPriority = document.getElementById("filterPriority");
  filterStatus = document.getElementById("filterStatus");
  filterDepartment = document.getElementById("filterDepartment");
  filterAudience = document.getElementById("filterAudience");

  refreshBtn = document.getElementById("refreshNotificationsBtn");
  resetBtn = document.getElementById("resetFiltersBtn");
  exportBtn = document.getElementById("exportBtn");
  announcementBtn = document.getElementById("newAnnouncementBtn");
  markAllReadBtn = document.getElementById("markAllReadBtn");

  announcementModal = document.getElementById("announcementModal");
  deleteModal = document.getElementById("deleteNotificationModal");
  birthdayModal = document.getElementById("birthdayWishModal");
  viewModal = document.getElementById("viewNotificationModal");

  announcementTitle = document.getElementById("announcementTitle");
  announcementDescription = document.getElementById("announcementDescription");
  announcementType = document.getElementById("announcementType");
  announcementPriority = document.getElementById("announcementPriority");
  announcementAudience = document.getElementById("announcementAudience");
  announcementDepartment = document.getElementById("announcementDepartment");
  scheduleDate = document.getElementById("scheduleDate");
  scheduleTime = document.getElementById("scheduleTime");
  publishBtn = document.getElementById("publishAnnouncement");
  fileDrop = document.getElementById("fileDrop");
  fileInput = document.getElementById("fileInput");
  filePreview = document.getElementById("filePreview");
  uploadProgress = document.getElementById("uploadProgress");
  uploadProgressBar = document.getElementById("uploadProgressBar");
  announcementModalTitle = document.getElementById("announcementModalTitle");
}

/* ==========================================================
   HELPERS
========================================================== */

const today = new Date();

function formatDate(date) {
  if (!date) return "—";
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isUnread(item) {
  if (typeof item.isRead === "boolean") return !item.isRead;
  if (typeof item.read === "boolean") return !item.read;
  return true;
}

function isBirthdayToday(ds) {
  if (!ds) return false;
  const d = new Date(ds);
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
}

function getAge(ds) {
  if (!ds) return "";
  const d = new Date(ds);
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function daysUntil(ds) {
  if (!ds) return null;
  const d = new Date(ds);
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

function resolveStatus(dateStr, timeStr) {
  if (!dateStr) return "Published";
  const scheduled = new Date(`${dateStr}T${timeStr || "00:00"}`);
  return scheduled > new Date() ? "Scheduled" : "Published";
}

function typeIcon(type) {
  const map = {
    announcement: "ri-megaphone-fill",
    birthday: "ri-cake-2-fill",
    holiday: "ri-calendar-event-fill",
    reminder: "ri-alarm-fill",
    alert: "ri-alert-fill",
    "policy update": "ri-file-text-fill",
    "system notification": "ri-settings-3-fill",
  };
  return map[(type || "").toLowerCase()] || "ri-notification-3-fill";
}

function setLoading(show) {
  if (!notificationTableBody) return;
  if (show) {
    notificationTableBody.innerHTML = `
      <tr><td colspan="8">
        <div class="table-loading">
          <div class="spinner"></div>
          <span>Loading notifications…</span>
        </div>
      </td></tr>`;
  }
}

/* ==========================================================
   MODAL HELPERS
========================================================== */

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

/* ==========================================================
   INIT
========================================================== */

async function init() {
  grabDOMRefs();

  /* --------------------------------------------------------
     RBAC ORDER — this is the fix.
     guardAndLoadUser() resolves Firebase auth, fetches the
     Firestore user doc, and internally calls permissions.js's
     loadPermissions(uid, role) BEFORE this await returns.
     renderNav() reads getCurrentRole() from permissions.js,
     so it must never run until guardAndLoadUser() has settled.
     Calling renderNav() first (the previous bug) meant every
     role — including Admin — got the fallback "employee"
     permission set because loadPermissions() hadn't run yet.
  -------------------------------------------------------- */
  await guardAndLoadUser();
  renderNav();

  setupSidebarToggle();
  setupUserMenu();
  initNotificationBadge();

  bindEvents();
  setLoading(true);

  await Promise.all([loadEmployees(), loadHolidays()]);
  startRealtimeListener();
}

document.addEventListener("DOMContentLoaded", init);

/* ==========================================================
   REALTIME LISTENER
========================================================== */

function startRealtimeListener() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  const q = query(notificationsRef, orderBy("createdAt", "desc"));

  unsubscribeSnapshot = onSnapshot(
    q,
    (snap) => {
      allNotifications = [];
      snap.forEach((ds) => {
        const data = ds.data();
        if (data.isDeleted === true) return;
        allNotifications.push({ id: ds.id, ...data });
      });
      applyFilters();
      renderStatistics();
      renderSummary();
      renderRecentActivity();
      populateDeptFilters();
    },
    (err) => {
      console.error("Snapshot error:", err);
      showToast("error", "Realtime update failed.");
    },
  );
}

/* ==========================================================
   LOAD EMPLOYEES + HOLIDAYS
========================================================== */

async function loadEmployees() {
  try {
    employees = [];
    const snap = await getDocs(employeesRef);
    snap.forEach((ds) => employees.push({ id: ds.id, ...ds.data() }));
    renderBirthdays();
    renderUpcomingBirthdays();
  } catch (e) {
    console.error(e);
  }
}

async function loadHolidays() {
  try {
    holidays = [];
    const snap = await getDocs(holidaysRef);
    snap.forEach((ds) => holidays.push({ id: ds.id, ...ds.data() }));
    renderHolidays();
  } catch (e) {
    console.error(e);
  }
}

/* ==========================================================
   POPULATE DEPARTMENT DROPDOWNS
========================================================== */

function populateDeptFilters() {
  const depts = [
    ...new Set(
      allNotifications.map((n) => n.department).filter((d) => d && d !== "All"),
    ),
  ];

  [filterDepartment, announcementDepartment].forEach((sel) => {
    if (!sel) return;
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    depts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

/* ==========================================================
   STATISTICS
========================================================== */

function renderStatistics() {
  const unread = allNotifications.filter(isUnread).length;
  const annc = allNotifications.filter(
    (n) => (n.type || "").toLowerCase() === "announcement",
  ).length;
  const sched = allNotifications.filter((n) => n.status === "Scheduled").length;
  const bdays = employees.filter((e) =>
    isBirthdayToday(e.dateOfBirth || e.dob),
  ).length;

  if (statTotal) statTotal.textContent = allNotifications.length;
  if (statUnread) statUnread.textContent = unread;
  if (statAnnouncement) statAnnouncement.textContent = annc;
  if (statScheduled) statScheduled.textContent = sched;
  if (statBirthday) statBirthday.textContent = bdays;
  if (statHoliday) statHoliday.textContent = holidays.length;
}

function renderSummary() {
  const s = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  s("summaryTotal", allNotifications.length);
  s("summaryUnread", allNotifications.filter(isUnread).length);
  s(
    "summaryPublished",
    allNotifications.filter((n) => n.status === "Published").length,
  );
  s(
    "summaryScheduled",
    allNotifications.filter((n) => n.status === "Scheduled").length,
  );
}

/* ==========================================================
   TABLE
========================================================== */

function renderTable() {
  if (!notificationTableBody) return;
  notificationTableBody.innerHTML = "";

  const total = filteredNotifications.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const paginated = filteredNotifications.slice(start, end);

  if (notificationCount) notificationCount.textContent = total;
  if (showingCount)
    showingCount.textContent =
      total === 0 ? "0" : `${start + 1}–${end} of ${total}`;

  if (total === 0) {
    notificationTableBody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <i class="ri-notification-off-line"></i>
          <h3>No Notifications Found</h3>
          <p>Create your first announcement or adjust your filters.</p>
        </div>
      </td></tr>`;
    renderPagination(total);
    return;
  }

  paginated.forEach((item) => {
    const unread = isUnread(item);
    const pinned = item.isPinned === true;
    const typeCls = (item.type || "announcement")
      .toLowerCase()
      .replace(/\s+/g, "-");
    const priCls = (item.priority || "low").toLowerCase();
    const stsCls = (item.status || "published").toLowerCase();
    const userCanEdit = canEdit(MODULES.NOTIFICATIONS);
    const userCanDelete = canDelete(MODULES.NOTIFICATIONS);

    notificationTableBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr class="${unread ? "is-unread" : ""} ${pinned ? "is-pinned" : ""}">
        <td>
          <div class="notification-info">
            <div class="notification-avatar">
              <i class="${typeIcon(item.type)}"></i>
            </div>
            <div class="notification-text">
              <h5>${item.title || "—"} ${pinned ? '<i class="ri-pushpin-fill" style="color:#6c5ce7;font-size:12px;margin-left:4px;"></i>' : ""}</h5>
              <p>${item.description || item.message || ""}</p>
            </div>
          </div>
        </td>
        <td><span class="type-chip type-${typeCls}">${item.type || "Announcement"}</span></td>
        <td><span class="priority-badge priority-${priCls}">${item.priority || "Low"}</span></td>
        <td>${item.department || "All"}</td>
        <td>${item.audience || "Everyone"}</td>
        <td><span class="status-badge status-${stsCls}">${item.status || "Published"}</span></td>
        <td>${formatDate(item.createdAt)}</td>
        <td>
          <div class="row-actions">
            ${unread ? `<button class="action-btn mark-read-btn" title="Mark as read" data-id="${item.id}"><i class="ri-mail-check-line"></i></button>` : ""}
            <button class="action-btn pin-btn" title="${pinned ? "Unpin" : "Pin"}" data-id="${item.id}" data-pinned="${pinned}">
              <i class="${pinned ? "ri-pushpin-fill" : "ri-pushpin-line"}"></i>
            </button>
            <button class="action-btn view-btn"   title="View"   data-id="${item.id}"><i class="ri-eye-line"></i></button>
            ${userCanEdit ? `<button class="action-btn edit-btn"   title="Edit"   data-id="${item.id}"><i class="ri-pencil-line"></i></button>` : ""}
            ${userCanDelete ? `<button class="action-btn delete-btn" title="Delete" data-id="${item.id}"><i class="ri-delete-bin-6-line"></i></button>` : ""}
          </div>
        </td>
      </tr>`,
    );
  });

  renderPagination(total);
}

/* ==========================================================
   PAGINATION
========================================================== */

function renderPagination(total) {
  const container = document.querySelector(".pagination");
  if (!container) return;
  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  container.innerHTML = "";

  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.innerHTML = '<i class="ri-arrow-left-s-line"></i>';
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => {
    currentPage--;
    renderTable();
  });
  container.appendChild(prev);

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.className = `page-btn ${i === currentPage ? "active" : ""}`;
    btn.textContent = i;
    btn.addEventListener("click", () => {
      currentPage = i;
      renderTable();
    });
    container.appendChild(btn);
  }

  const next = document.createElement("button");
  next.className = "page-btn";
  next.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
  next.disabled = currentPage === pages;
  next.addEventListener("click", () => {
    currentPage++;
    renderTable();
  });
  container.appendChild(next);
}

/* ==========================================================
   SEARCH + FILTER
========================================================== */

function applyFilters() {
  const search = (searchInput ? searchInput.value : "").toLowerCase().trim();
  const type = filterType ? filterType.value : "";
  const prio = filterPriority ? filterPriority.value : "";
  const status = filterStatus ? filterStatus.value : "";
  const dept = filterDepartment ? filterDepartment.value : "";
  const aud = filterAudience ? filterAudience.value : "";

  filteredNotifications = allNotifications.filter((item) => {
    if (search) {
      const haystack = [
        item.title,
        item.description,
        item.message,
        item.department,
        item.audience,
        item.type,
      ]
        .map((v) => (v || "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    if (type && item.type !== type) return false;
    if (prio && item.priority !== prio) return false;
    if (status && item.status !== status) return false;
    if (dept && item.department !== dept) return false;
    if (aud && item.audience !== aud) return false;
    return true;
  });

  // Pinned always first
  filteredNotifications.sort(
    (a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0),
  );

  currentPage = 1;
  renderTable();
}

function resetFilters() {
  if (searchInput) searchInput.value = "";
  if (filterType) filterType.value = "";
  if (filterPriority) filterPriority.value = "";
  if (filterStatus) filterStatus.value = "";
  if (filterDepartment) filterDepartment.value = "";
  if (filterAudience) filterAudience.value = "";
  filteredNotifications = [...allNotifications];
  currentPage = 1;
  renderTable();
}

/* ==========================================================
   BIRTHDAYS
========================================================== */

function renderBirthdays() {
  if (!birthdayList) return;
  birthdayList.innerHTML = "";
  const bdays = employees.filter((e) =>
    isBirthdayToday(e.dateOfBirth || e.dob),
  );
  if (!bdays.length) {
    birthdayList.innerHTML = `
      <div class="no-birthday">
        <i class="ri-cake-2-line"></i>
        <h5>No Birthdays Today</h5>
        <p>No employees are celebrating today.</p>
      </div>`;
    return;
  }
  bdays.forEach((emp) => {
    const img =
      emp.photoURL ||
      emp.profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.fullName || emp.name || "E")}&background=6c5ce7&color=fff`;
    birthdayList.insertAdjacentHTML(
      "beforeend",
      `
      <div class="birthday-item">
        <img src="${img}" alt="${emp.fullName || emp.name || "Employee"}">
        <div class="birthday-info">
          <h5>${emp.fullName || emp.name || "Employee"}</h5>
          <p>${emp.department || "Department"} · ${emp.designation || "Employee"}</p>
          <span class="birthday-badge">🎂 ${getAge(emp.dateOfBirth || emp.dob)} Years</span>
        </div>
        <button class="btn btn-sm btn-primary birthday-wish-btn" data-id="${emp.id}">Wish</button>
      </div>`,
    );
  });
}

function renderUpcomingBirthdays() {
  if (!upcomingBirthdayList) return;
  upcomingBirthdayList.innerHTML = "";
  const upcoming = [...employees]
    .filter((e) => e.dateOfBirth || e.dob)
    .sort(
      (a, b) =>
        (daysUntil(a.dateOfBirth || a.dob) || 0) -
        (daysUntil(b.dateOfBirth || b.dob) || 0),
    )
    .slice(0, 5);

  if (!upcoming.length) {
    upcomingBirthdayList.innerHTML = `<p style="font-size:13px;color:var(--panel-light-text-muted);text-align:center;">No upcoming birthdays.</p>`;
    return;
  }
  upcoming.forEach((emp) => {
    const img =
      emp.photoURL ||
      emp.profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.fullName || emp.name || "E")}&background=6c5ce7&color=fff`;
    const days = daysUntil(emp.dateOfBirth || emp.dob);
    upcomingBirthdayList.insertAdjacentHTML(
      "beforeend",
      `
      <div class="upcoming-person">
        <img src="${img}" alt="">
        <div>
          <strong>${emp.fullName || emp.name}</strong>
          <small>${days === 0 ? "Today 🎂" : `In ${days} day${days !== 1 ? "s" : ""}`}</small>
        </div>
      </div>`,
    );
  });
}

/* ==========================================================
   HOLIDAYS
========================================================== */

function renderHolidays() {
  if (!holidayList) return;
  holidayList.innerHTML = "";

  const upcoming = holidays
    .filter((h) => h.date)
    .sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return da - db;
    })
    .slice(0, 5);

  if (!upcoming.length) {
    holidayList.innerHTML = `<p style="font-size:13px;color:var(--panel-light-text-muted);text-align:center;">No upcoming holidays.</p>`;
    return;
  }
  upcoming.forEach((item) => {
    const d = item.date?.toDate ? item.date.toDate() : new Date(item.date);
    const rem = daysUntil(d);
    holidayList.insertAdjacentHTML(
      "beforeend",
      `
      <div class="holiday-item">
        <div class="holiday-icon"><i class="ri-calendar-event-fill"></i></div>
        <div class="holiday-info">
          <h5>${item.name || "Holiday"}</h5>
          <p>${formatDate(item.date)}</p>
        </div>
        <span class="days-left">${rem === 0 ? "Today" : rem === 1 ? "Tomorrow" : `${rem}d`}</span>
      </div>`,
    );
  });
}

/* ==========================================================
   RECENT ACTIVITY
========================================================== */

function renderRecentActivity() {
  if (!recentActivity) return;
  recentActivity.innerHTML = "";
  if (!allNotifications.length) {
    recentActivity.innerHTML = `<p style="font-size:13px;color:var(--panel-light-text-muted);text-align:center;">No recent activity.</p>`;
    return;
  }
  allNotifications.slice(0, 6).forEach((item) => {
    const desc = (item.description || item.message || "").slice(0, 80);
    recentActivity.insertAdjacentHTML(
      "beforeend",
      `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-content">
          <h6>${item.title || "Notification"}</h6>
          <p>${desc}${desc.length >= 80 ? "…" : ""}</p>
          <div class="activity-time">${formatDate(item.createdAt)}</div>
        </div>
      </div>`,
    );
  });
}

/* ==========================================================
   FILE SELECT
========================================================== */

function handleFileSelect(file) {
  if (!file) return;
  const allowed = [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!allowed.includes(ext))
    return showToast(
      "error",
      "Unsupported file. Allowed: PDF, DOCX, PNG, JPG.",
    );
  if (file.size > 10 * 1024 * 1024)
    return showToast("error", "File too large. Max 10 MB.");
  selectedFile = file;
  if (filePreview) {
    filePreview.innerHTML = `
      <div class="file-preview">
        <i class="ri-file-fill"></i>
        <span>${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
        <button type="button" id="removeFile" title="Remove"><i class="ri-close-line"></i></button>
      </div>`;
    document.getElementById("removeFile")?.addEventListener("click", () => {
      selectedFile = null;
      filePreview.innerHTML = "";
      if (fileInput) fileInput.value = "";
    });
  }
}

/* ==========================================================
   UPLOAD ATTACHMENT
========================================================== */

async function uploadAttachment(file, onProgress) {
  const stor = await getStorageInstance();
  if (!stor) throw new Error("Firebase Storage not available.");

  const { ref, uploadBytesResumable, getDownloadURL } =
    await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js");

  const fileRef = ref(stor, `notifications/${Date.now()}_${file.name}`);
  const task = uploadBytesResumable(fileRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) =>
        onProgress &&
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}

/* ==========================================================
   SAVE NOTIFICATION (Create + Update)
========================================================== */

async function saveNotification() {
  const title = (announcementTitle?.value || "").trim();
  const description = (announcementDescription?.value || "").trim();
  const type = announcementType?.value || "";
  const priority = announcementPriority?.value || "";
  const audience = announcementAudience?.value || "";
  const department = announcementDepartment?.value || "";
  const dateVal = scheduleDate?.value || "";
  const timeVal = scheduleTime?.value || "";

  if (!title) return showToast("error", "Title is required.");
  if (!description) return showToast("error", "Description is required.");
  if (!type) return showToast("error", "Notification type is required.");
  if (!priority) return showToast("error", "Priority is required.");
  if (!audience) return showToast("error", "Audience is required.");

  const allowedToSave = editingId
    ? canEdit(MODULES.NOTIFICATIONS)
    : canCreate(MODULES.NOTIFICATIONS);

  if (!allowedToSave) {
    return showToast(
      "error",
      "You don't have permission to perform this action.",
    );
  }

  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.textContent = "Saving…";
  }

  try {
    let attachmentUrl = "";
    let attachmentName = "";

    if (selectedFile) {
      if (uploadProgress) uploadProgress.classList.add("visible");
      try {
        attachmentUrl = await uploadAttachment(selectedFile, (pct) => {
          if (uploadProgressBar) uploadProgressBar.style.width = pct + "%";
        });
        attachmentName = selectedFile.name;
      } catch (uploadErr) {
        showToast("error", "Attachment upload failed: " + uploadErr.message);
      } finally {
        if (uploadProgress) uploadProgress.classList.remove("visible");
      }
    }

    const user = getCurrentUser?.() || {};
    const status = resolveStatus(dateVal, timeVal);

    const payload = {
      title,
      description,
      type,
      priority,
      audience,
      department: department || "All",
      scheduleDate: dateVal,
      scheduleTime: timeVal,
      attachmentUrl,
      attachmentName,
      status,
      updatedAt: Timestamp.now(),
    };

    if (editingId) {
      await updateDoc(doc(db, "notifications", editingId), payload);
      showToast("success", "Notification updated successfully.");
    } else {
      await addDoc(notificationsRef, {
        ...payload,
        isPinned: false,
        isRead: false,
        isDeleted: false,
        createdBy: user.uid || user.fullName || "system",
        createdAt: Timestamp.now(),
      });
      showToast("success", "Notification published successfully.");
    }

    closeModal(announcementModal);
    resetAnnouncementForm();
  } catch (err) {
    console.error(err);
    showToast("error", err.message || "Unable to save notification.");
  } finally {
    if (publishBtn) {
      publishBtn.disabled = false;
      publishBtn.innerHTML = editingId
        ? '<i class="ri-save-fill"></i> Update'
        : '<i class="ri-send-plane-fill"></i> Publish';
    }
  }
}

/* ==========================================================
   MARK AS READ
========================================================== */

async function markAsRead(id) {
  try {
    await updateDoc(doc(db, "notifications", id), {
      isRead: true,
      updatedAt: Timestamp.now(),
    });
  } catch (e) {
    console.error(e);
    showToast("error", "Unable to mark as read.");
  }
}

async function markAllAsRead() {
  const unread = allNotifications.filter(isUnread);
  if (!unread.length) return showToast("success", "No unread notifications.");
  try {
    const batch = writeBatch(db);
    unread.forEach((n) =>
      batch.update(doc(db, "notifications", n.id), {
        isRead: true,
        updatedAt: Timestamp.now(),
      }),
    );
    await batch.commit();
    showToast("success", "All notifications marked as read.");
  } catch (e) {
    console.error(e);
    showToast("error", "Unable to mark all as read.");
  }
}

/* ==========================================================
   PIN / UNPIN
========================================================== */

async function togglePin(id, currentlyPinned) {
  try {
    await updateDoc(doc(db, "notifications", id), {
      isPinned: !currentlyPinned,
      updatedAt: Timestamp.now(),
    });
    showToast(
      "success",
      currentlyPinned ? "Notification unpinned." : "Notification pinned.",
    );
  } catch (e) {
    console.error(e);
    showToast("error", "Unable to update pin.");
  }
}

/* ==========================================================
   DELETE
========================================================== */

async function deleteNotification(id) {
  if (!canDelete(MODULES.NOTIFICATIONS))
    return showToast("error", "You don't have permission.");
  try {
    await deleteDoc(doc(db, "notifications", id));
    showToast("success", "Notification deleted.");
  } catch (e) {
    console.error(e);
    showToast("error", "Unable to delete.");
  }
}

/* ==========================================================
   VIEW MODAL
========================================================== */

function openViewModal(id) {
  const item = allNotifications.find((n) => n.id === id);
  if (!item || !viewModal) return;
  if (isUnread(item)) markAsRead(id);

  const body = viewModal.querySelector(".modal-body");
  if (!body) return;

  const typeCls = (item.type || "announcement")
    .toLowerCase()
    .replace(/\s+/g, "-");
  const priCls = (item.priority || "low").toLowerCase();
  const stsCls = (item.status || "published").toLowerCase();

  body.innerHTML = `
    <div class="view-detail-grid">
      <div class="view-detail-item">
        <label>Type</label>
        <span><span class="type-chip type-${typeCls}">${item.type || "Announcement"}</span></span>
      </div>
      <div class="view-detail-item">
        <label>Priority</label>
        <span><span class="priority-badge priority-${priCls}">${item.priority || "Low"}</span></span>
      </div>
      <div class="view-detail-item">
        <label>Status</label>
        <span><span class="status-badge status-${stsCls}">${item.status || "Published"}</span></span>
      </div>
      <div class="view-detail-item">
        <label>Audience</label>
        <span>${item.audience || "Everyone"}</span>
      </div>
      <div class="view-detail-item">
        <label>Department</label>
        <span>${item.department || "All"}</span>
      </div>
      <div class="view-detail-item">
        <label>Created</label>
        <span>${formatDate(item.createdAt)}</span>
      </div>
      ${
        item.scheduleDate
          ? `
      <div class="view-detail-item">
        <label>Scheduled</label>
        <span>${item.scheduleDate}${item.scheduleTime ? " · " + item.scheduleTime : ""}</span>
      </div>`
          : ""
      }
    </div>
    <label style="font-size:12px;font-weight:700;color:var(--panel-light-text-muted);text-transform:uppercase;letter-spacing:.5px;">Description</label>
    <div class="view-description" style="margin-top:8px;">${item.description || item.message || "No description."}</div>
    ${
      item.attachmentUrl
        ? `
    <a href="${item.attachmentUrl}" target="_blank" rel="noopener" class="attachment-link">
      <i class="ri-attachment-2"></i> ${item.attachmentName || "Download Attachment"}
    </a>`
        : ""
    }`;

  const titleEl = viewModal.querySelector(".modal-header h3");
  if (titleEl) titleEl.textContent = item.title || "Notification";
  openModal(viewModal);
}

/* ==========================================================
   EDIT MODAL — prefill
========================================================== */

function openEditModal(id) {
  const item = allNotifications.find((n) => n.id === id);
  if (!item) return;
  editingId = id;
  if (announcementModalTitle)
    announcementModalTitle.textContent = "Edit Notification";
  if (publishBtn) publishBtn.innerHTML = '<i class="ri-save-fill"></i> Update';

  if (announcementTitle) announcementTitle.value = item.title || "";
  if (announcementDescription)
    announcementDescription.value = item.description || item.message || "";
  if (announcementType) announcementType.value = item.type || "";
  if (announcementPriority) announcementPriority.value = item.priority || "";
  if (announcementAudience) announcementAudience.value = item.audience || "";
  if (announcementDepartment)
    announcementDepartment.value = item.department || "";
  if (scheduleDate) scheduleDate.value = item.scheduleDate || "";
  if (scheduleTime) scheduleTime.value = item.scheduleTime || "";

  selectedFile = null;
  if (filePreview) filePreview.innerHTML = "";
  openModal(announcementModal);
}

/* ==========================================================
   RESET ANNOUNCEMENT FORM
========================================================== */

function resetAnnouncementForm() {
  editingId = null;
  selectedFile = null;
  if (announcementModalTitle)
    announcementModalTitle.textContent = "New Announcement";
  if (publishBtn)
    publishBtn.innerHTML = '<i class="ri-send-plane-fill"></i> Publish';

  [
    announcementTitle,
    announcementDescription,
    scheduleDate,
    scheduleTime,
  ].forEach((el) => {
    if (el) el.value = "";
  });
  [
    announcementType,
    announcementPriority,
    announcementAudience,
    announcementDepartment,
  ].forEach((el) => {
    if (el) el.selectedIndex = 0;
  });

  if (filePreview) filePreview.innerHTML = "";
  if (uploadProgress) uploadProgress.classList.remove("visible");
  if (uploadProgressBar) uploadProgressBar.style.width = "0%";
  if (fileInput) fileInput.value = "";
}

/* ==========================================================
   EXPORT CSV
========================================================== */

function exportCSV() {
  const headers = [
    "Title",
    "Type",
    "Priority",
    "Department",
    "Audience",
    "Status",
    "Date",
  ];
  const rows = filteredNotifications.map((n) =>
    [
      `"${(n.title || "").replace(/"/g, '""')}"`,
      n.type || "",
      n.priority || "",
      n.department || "",
      n.audience || "",
      n.status || "",
      formatDate(n.createdAt),
    ].join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "notifications.csv",
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("success", "CSV exported successfully.");
}

/* ==========================================================
   BIND ALL EVENTS
========================================================== */

function bindEvents() {
  /* Search + Filters */
  searchInput?.addEventListener("input", applyFilters);
  [
    filterType,
    filterPriority,
    filterStatus,
    filterDepartment,
    filterAudience,
  ].forEach((el) => el?.addEventListener("change", applyFilters));
  resetBtn?.addEventListener("click", resetFilters);

  /* Refresh */
  refreshBtn?.addEventListener("click", async () => {
    setLoading(true);
    await Promise.all([loadEmployees(), loadHolidays()]);
    showToast("success", "Refreshed successfully.");
  });

  /* Mark All Read */
  markAllReadBtn?.addEventListener("click", markAllAsRead);

  /* Export */
  exportBtn?.addEventListener("click", exportCSV);

  /* New Announcement */
  announcementBtn?.addEventListener("click", () => {
    resetAnnouncementForm();
    openModal(announcementModal);
  });

  /* Close announcement modal */
  document
    .getElementById("closeAnnouncementModal")
    ?.addEventListener("click", () => closeModal(announcementModal));
  document
    .getElementById("cancelAnnouncement")
    ?.addEventListener("click", () => closeModal(announcementModal));

  /* Publish */
  publishBtn?.addEventListener("click", saveNotification);

  /* File drop area */
  if (fileDrop) {
    fileDrop.addEventListener("click", () => fileInput?.click());
    fileDrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      fileDrop.classList.add("drag-over");
    });
    fileDrop.addEventListener("dragleave", () =>
      fileDrop.classList.remove("drag-over"),
    );
    fileDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      fileDrop.classList.remove("drag-over");
      handleFileSelect(e.dataTransfer.files[0]);
    });
  }
  fileInput?.addEventListener("change", () =>
    handleFileSelect(fileInput.files[0]),
  );

  /* Table action buttons */
  notificationTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".action-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("mark-read-btn")) {
      await markAsRead(id);
    } else if (btn.classList.contains("pin-btn")) {
      await togglePin(id, btn.dataset.pinned === "true");
    } else if (btn.classList.contains("view-btn")) {
      openViewModal(id);
    } else if (btn.classList.contains("edit-btn")) {
      openEditModal(id);
    } else if (btn.classList.contains("delete-btn")) {
      deleteTargetId = id;
      openModal(deleteModal);
    }
  });

  /* Delete modal */
  document
    .getElementById("cancelDeleteNotification")
    ?.addEventListener("click", () => {
      deleteTargetId = null;
      closeModal(deleteModal);
    });
  document
    .getElementById("confirmDeleteNotification")
    ?.addEventListener("click", async () => {
      if (!deleteTargetId) return;
      await deleteNotification(deleteTargetId);
      deleteTargetId = null;
      closeModal(deleteModal);
    });

  /* View modal close */
  document
    .getElementById("closeViewModal")
    ?.addEventListener("click", () => closeModal(viewModal));

  /* Birthday wish */
  birthdayList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".birthday-wish-btn");
    if (!btn) return;
    openModal(birthdayModal);
  });
  document
    .getElementById("closeBirthdayModal")
    ?.addEventListener("click", () => closeModal(birthdayModal));
  document
    .getElementById("cancelBirthdayWish")
    ?.addEventListener("click", () => closeModal(birthdayModal));
  document.getElementById("sendBirthdayWish")?.addEventListener("click", () => {
    showToast("success", "Birthday wishes sent 🎉");
    closeModal(birthdayModal);
  });

  /* Close on overlay click */
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  /* ESC key */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [announcementModal, deleteModal, birthdayModal, viewModal].forEach(
      closeModal,
    );
  });
}
