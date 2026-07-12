/* ==========================================================
   FIREBASE IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  $,
  $$,
  showToast,
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
  const TYPE_ICON = {
    Announcement: "ri-megaphone-fill",
    "System Alert": "ri-alarm-warning-fill",
    Reminder: "ri-alarm-fill",
    "Leave Update": "ri-calendar-close-fill",
    Attendance: "ri-calendar-check-fill",
    Payroll: "ri-bank-card-fill",
    "HR Notice": "ri-briefcase-4-fill",
    "Policy Update": "ri-file-shield-2-fill",
    Event: "ri-calendar-event-fill",
    Birthday: "ri-cake-2-fill",
    Holiday: "ri-sun-fill",
  };

  /* =========================================================
     STATE
  ========================================================= */
  let allNotifications = [];
  let filtered = [];
  let departments = [];
  let editingId = null;
  let pendingDeleteId = null;
  let openRowMenuId = null;
  let currentPage = 1;
  const pageSize = 10;
  let unsubscribeNotifications = null;
  let currentUser = null;

  /* =========================================================
     HELPERS
  ========================================================= */
  const escapeHtml = (str) =>
    String(str ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const toMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return new Date(ts).getTime() || 0;
  };

  const formatDate = (ts) =>
    ts
      ? new Date(toMillis(ts)).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  const readPercent = (n) => {
    const total = Number(n.totalRecipients) || 0;
    const read = Number(n.readCount) || 0;
    return total ? Math.round((read / total) * 100) : 0;
  };

  /* =========================================================
     DROPDOWNS
  ========================================================= */
  function setupDropdowns() {
    const t = $("#moreFiltersBtn");
    const m = $("#moreFiltersMenu");
    if (t && m) {
      t.addEventListener("click", (e) => {
        e.stopPropagation();
        m.hidden = !m.hidden;
      });
      m.addEventListener("click", (e) => e.stopPropagation());
    }
    document.addEventListener("click", () => {
      if (m) m.hidden = true;
      closeRowMenu();
    });
  }

  function closeRowMenu() {
    if (!openRowMenuId) return;
    const menu = $(`#rowMenu-${openRowMenuId}`);
    if (menu) menu.hidden = true;
    openRowMenuId = null;
  }

  /* =========================================================
     init()
  ========================================================= */
  async function init() {
    showSkeleton("notifSkeleton", "notifTableContent");

    currentUser = await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    wireUI();
    setupDropdowns();
    await loadDepartments();
    loadNotifications();
  }

  document.addEventListener("DOMContentLoaded", init);

  /* =========================================================
     loadNotifications() — realtime Firestore listener
  ========================================================= */
  function loadNotifications() {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
    );
    unsubscribeNotifications = onSnapshot(
      q,
      (snap) => {
        allNotifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        currentPage = 1;
        filterNotifications();
        renderStatistics();
        renderSidebarWidgets();
        hideSkeleton("notifSkeleton", "notifTableContent");
      },
      (error) => {
        console.error("Failed to load notifications:", error);
        showToast("error", "Could not load notifications.");
        hideSkeleton("notifSkeleton", "notifTableContent");
      },
    );
  }

  function refreshNotifications() {
    if (unsubscribeNotifications) unsubscribeNotifications();
    loadNotifications();
  }

  async function loadDepartments() {
    try {
      const snap = await getDocs(collection(db, "departments"));
      departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const opts =
        '<option value="All Departments">All Departments</option>' +
        departments
          .map(
            (d) =>
              `<option value="${escapeHtml(d.name || d.id)}">${escapeHtml(d.name || d.id)}</option>`,
          )
          .join("");
      if ($("#notifDepartmentSelect"))
        $("#notifDepartmentSelect").innerHTML = opts;
      const filterOpts =
        '<option value="">All Departments</option>' +
        departments
          .map(
            (d) =>
              `<option value="${escapeHtml(d.name || d.id)}">${escapeHtml(d.name || d.id)}</option>`,
          )
          .join("");
      if ($("#filterDepartment")) $("#filterDepartment").innerHTML = filterOpts;
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  }

  /* =========================================================
     renderStatistics()
  ========================================================= */
  function renderStatistics() {
    const total = allNotifications.length;
    const unread = allNotifications.filter((n) => !n.isReadByAdmin).length;
    const announcements = allNotifications.filter(
      (n) => n.type === "Announcement" && n.status === "Published",
    ).length;
    const scheduled = allNotifications.filter(
      (n) => n.status === "Scheduled",
    ).length;

    setText("statTotal", total);
    setText("statUnread", unread);
    setText("statAnnouncements", announcements);
    setText("statScheduled", scheduled);

    const drafts = allNotifications.filter((n) => n.status === "Draft").length;
    const avgRead = total
      ? Math.round(
          allNotifications.reduce((sum, n) => sum + readPercent(n), 0) / total,
        )
      : 0;
    setText("sumTotal", total);
    setText("sumReadRate", `${avgRead}%`);
    setText("sumDrafts", drafts);
  }

  function setText(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value;
  }

  /* =========================================================
     searchNotifications() / filterNotifications()
  ========================================================= */
  function searchNotifications() {
    currentPage = 1;
    filterNotifications();
  }

  function filterNotifications() {
    const search = ($("#notifSearchInput")?.value || "").trim().toLowerCase();
    const type = $("#filterType")?.value || "";
    const priority = $("#filterPriority")?.value || "";
    const status = $("#filterStatus")?.value || "";
    const department = $("#filterDepartment")?.value || "";
    const dateRange = $("#filterDateRange")?.value || "";
    const sort = $("#sortNotifications")?.value || "date-desc";

    let rows = [...allNotifications];

    if (search) {
      rows = rows.filter(
        (n) =>
          (n.title || "").toLowerCase().includes(search) ||
          (n.description || "").toLowerCase().includes(search),
      );
    }
    if (type) rows = rows.filter((n) => n.type === type);
    if (priority) rows = rows.filter((n) => n.priority === priority);
    if (status) rows = rows.filter((n) => n.status === status);
    if (department) rows = rows.filter((n) => n.department === department);

    if (dateRange) {
      const now = Date.now();
      const spans = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5 };
      const span = spans[dateRange];
      if (span) rows = rows.filter((n) => now - toMillis(n.createdAt) <= span);
    }

    const priorityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    rows.sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return toMillis(a.createdAt) - toMillis(b.createdAt);
        case "priority-desc":
          return (
            (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
          );
        case "reads-desc":
          return (b.readCount || 0) - (a.readCount || 0);
        default:
          return toMillis(b.createdAt) - toMillis(a.createdAt);
      }
    });

    filtered = rows;
    renderNotifications();
  }

  function resetFilters() {
    $("#notifSearchInput").value = "";
    $("#filterType").value = "";
    $("#filterPriority").value = "";
    $("#filterStatus").value = "";
    $("#filterDepartment").value = "";
    $("#filterDateRange").value = "";
    $("#sortNotifications").value = "date-desc";
    currentPage = 1;
    filterNotifications();
  }

  /* =========================================================
     renderNotifications() — table + pagination
  ========================================================= */
  function renderNotifications() {
    const tbody = $("#notifTableBody");
    const emptyState = $("#notifEmptyState");
    const tableWrap = $("#notifTableWrap");
    const pagination = $("#notifPagination");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      tableWrap.style.display = "none";
      pagination.style.display = "none";
      return;
    }

    emptyState.hidden = true;
    tableWrap.style.display = "block";
    pagination.style.display = "flex";

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.map(rowTemplate).join("");
    renderPagination(totalPages);
    wireRowEvents(tbody);
  }

  function rowTemplate(n) {
    const priorityClass = `priority-badge--${(n.priority || "low").toLowerCase()}`;
    const statusClass = `status-badge--${(n.status || "draft").toLowerCase()}`;
    const icon = TYPE_ICON[n.type] || "ri-notification-3-fill";
    const pct = readPercent(n);

    return `
      <tr class="${!n.isReadByAdmin ? "unread" : ""}" data-row-id="${n.id}">
        <td>
          <div class="notif-title-cell">
            <span class="dot ${n.isReadByAdmin ? "read" : ""}"></span>
            <div class="notif-title-info">
              <span class="notif-title-name" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</span>
              <span class="notif-title-sub">${escapeHtml(n.description || "").slice(0, 60)}${(n.description || "").length > 60 ? "…" : ""}</span>
            </div>
          </div>
        </td>
        <td><span class="type-badge"><i class="${icon}"></i> ${escapeHtml(n.type || "—")}</span></td>
        <td><span class="priority-badge ${priorityClass}">${escapeHtml(n.priority || "Low")}</span></td>
        <td>${escapeHtml(n.targetAudience || "—")}</td>
        <td>${escapeHtml(n.createdBy || "—")}</td>
        <td>${formatDate(n.createdAt)}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(n.status || "Draft")}</span></td>
        <td>
          <div class="read-count-cell">
            <div class="read-count-track"><div class="read-count-bar" style="width:${pct}%"></div></div>
            <span class="read-count-text">${n.readCount || 0}/${n.totalRecipients || 0}</span>
          </div>
        </td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="row-action-btn" data-action="view" data-id="${n.id}" title="View"><i class="ri-eye-line"></i></button>
            <button class="row-action-btn" data-action="edit" data-id="${n.id}" title="Edit"><i class="ri-pencil-line"></i></button>
            <button class="row-action-btn" data-action="more" data-id="${n.id}" title="More"><i class="ri-more-2-fill"></i></button>
            <div class="row-menu" id="rowMenu-${n.id}" hidden>
              <button data-action="duplicate" data-id="${n.id}"><i class="ri-file-copy-line"></i> Duplicate</button>
              <button data-action="send-again" data-id="${n.id}"><i class="ri-send-plane-line"></i> Send Again</button>
              <button class="danger" data-action="delete" data-id="${n.id}"><i class="ri-delete-bin-line"></i> Delete</button>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function wireRowEvents(tbody) {
    $$("[data-action='view']", tbody).forEach((btn) =>
      btn.addEventListener(
        "click",
        () =>
          (window.location.href = `notification-details.html?id=${btn.dataset.id}`),
      ),
    );
    $$("[data-action='edit']", tbody).forEach((btn) =>
      btn.addEventListener("click", () =>
        openAnnouncementModal(btn.dataset.id),
      ),
    );
    $$("[data-action='delete']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => {
        closeRowMenu();
        openDeleteModal(btn.dataset.id);
      }),
    );
    $$("[data-action='duplicate']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => {
        closeRowMenu();
        duplicateAnnouncement(btn.dataset.id);
      }),
    );
    $$("[data-action='send-again']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => {
        closeRowMenu();
        sendAgain(btn.dataset.id);
      }),
    );

    $$("[data-action='more']", tbody).forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const menu = $(`#rowMenu-${id}`);
        const willOpen = menu.hidden;
        closeRowMenu();
        menu.hidden = !willOpen;
        openRowMenuId = willOpen ? id : null;
      }),
    );
  }

  function renderPagination(totalPages) {
    const info = $("#paginationInfo");
    const controls = $("#paginationControls");
    if (!info || !controls) return;

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, filtered.length);
    info.textContent = `Showing ${start}–${end} of ${filtered.length}`;

    let html = `<button class="pagination-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}><i class="ri-arrow-left-s-line"></i></button>`;
    for (let p = 1; p <= totalPages; p++) {
      html += `<button class="pagination-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`;
    }
    html += `<button class="pagination-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}><i class="ri-arrow-right-s-line"></i></button>`;
    controls.innerHTML = html;

    $$("[data-page]", controls).forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        if (val === "prev") currentPage = Math.max(1, currentPage - 1);
        else if (val === "next")
          currentPage = Math.min(totalPages, currentPage + 1);
        else currentPage = Number(val);
        renderNotifications();
      });
    });
  }

  /* =========================================================
     RIGHT SIDEBAR WIDGETS
  ========================================================= */
  function renderSidebarWidgets() {
    const unreadWrap = $("#unreadList");
    const scheduledWrap = $("#scheduledList");
    const activityWrap = $("#recentActivityList");

    const unread = allNotifications.filter((n) => !n.isReadByAdmin).slice(0, 5);
    if (unreadWrap) {
      unreadWrap.innerHTML = unread.length
        ? unread
            .map(
              (n) => `
            <div class="mini-item">
              <span class="mini-dot" style="background:var(--color-primary)"></span>
              <div class="mini-body">
                <div class="mini-title">${escapeHtml(n.title)}</div>
                <div class="mini-meta">${escapeHtml(n.type || "")} · ${formatDate(n.createdAt)}</div>
              </div>
            </div>`,
            )
            .join("")
        : `<p style="font-size:12.5px;color:var(--panel-light-text-muted);padding:8px 0;">You're all caught up.</p>`;
    }

    const scheduled = allNotifications
      .filter((n) => n.status === "Scheduled")
      .slice(0, 5);
    if (scheduledWrap) {
      scheduledWrap.innerHTML = scheduled.length
        ? scheduled
            .map(
              (n) => `
            <div class="mini-item">
              <span class="mini-dot" style="background:var(--stat-blue)"></span>
              <div class="mini-body">
                <div class="mini-title">${escapeHtml(n.title)}</div>
                <div class="mini-meta">${escapeHtml(n.scheduleDate || "")} ${escapeHtml(n.scheduleTime || "")}</div>
              </div>
            </div>`,
            )
            .join("")
        : `<p style="font-size:12.5px;color:var(--panel-light-text-muted);padding:8px 0;">Nothing scheduled.</p>`;
    }

    const recent = [...allNotifications]
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
      .slice(0, 5);
    if (activityWrap) {
      activityWrap.innerHTML = recent.length
        ? recent
            .map(
              (n) => `
            <div class="activity-item">
              <div class="activity-icon"><i class="${TYPE_ICON[n.type] || "ri-notification-3-fill"}"></i></div>
              <div class="activity-body">
                <strong>${escapeHtml(n.title)}</strong> was ${escapeHtml((n.status || "draft").toLowerCase())}
                <span class="activity-time">${formatDate(n.updatedAt || n.createdAt)}</span>
              </div>
            </div>`,
            )
            .join("")
        : `<p style="font-size:12.5px;color:var(--panel-light-text-muted);padding:8px 0;">No recent activity.</p>`;
    }
  }

  /* =========================================================
     MODAL: NEW / EDIT ANNOUNCEMENT
  ========================================================= */
  let selectedFile = null;

  function openAnnouncementModal(id = null) {
    editingId = id;
    const form = $("#announcementForm");
    form.reset();
    $("#notifDocId").value = "";
    $("#notifFileLabel").textContent = "Click to browse or drag a file here";
    selectedFile = null;

    if (id) {
      const record = allNotifications.find((n) => n.id === id);
      if (!record) return;
      $("#announcementModalTitle").textContent = "Edit Announcement";
      $("#notifDocId").value = id;
      fillForm(record);
    } else {
      $("#announcementModalTitle").textContent = "New Announcement";
      $("#allowPush").checked = true;
      $("#allowEmail").checked = true;
      $("#allowInApp").checked = true;
    }

    $("#announcementModalOverlay").hidden = false;
  }

  function closeAnnouncementModal() {
    $("#announcementModalOverlay").hidden = true;
    editingId = null;
  }

  function fillForm(n) {
    $("#notifTitleInput").value = n.title || "";
    $("#notifDescriptionInput").value = n.description || "";
    $("#notifTypeSelect").value = n.type || "Announcement";
    $("#notifPrioritySelect").value = n.priority || "Medium";
    $("#notifDepartmentSelect").value = n.department || "All Departments";
    $("#notifAudienceSelect").value = n.targetAudience || "Everyone";
    $("#notifScheduleDate").value = n.scheduleDate || "";
    $("#notifScheduleTime").value = n.scheduleTime || "";
    $("#allowPush").checked = !!n.allowPush;
    $("#allowEmail").checked = !!n.allowEmail;
    $("#allowInApp").checked = !!n.allowInApp;
    if (n.attachmentName) $("#notifFileLabel").textContent = n.attachmentName;
  }

  function setupFileDrop() {
    const zone = $("#notifFileDropZone");
    const input = $("#notifFileInput");
    if (!zone || !input) return;
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => handleFile(input.files[0]));
    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      }),
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
      }),
    );
    zone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
  }

  function handleFile(file) {
    if (!file) return;
    selectedFile = file;
    $("#notifFileLabel").textContent = file.name;
  }

  function readFormPayload(status) {
    return {
      title: $("#notifTitleInput").value.trim(),
      description: $("#notifDescriptionInput").value.trim(),
      type: $("#notifTypeSelect").value,
      priority: $("#notifPrioritySelect").value,
      department: $("#notifDepartmentSelect").value,
      targetAudience: $("#notifAudienceSelect").value,
      attachmentName: selectedFile ? selectedFile.name : "",
      attachmentUrl: "",
      scheduleDate: $("#notifScheduleDate").value || "",
      scheduleTime: $("#notifScheduleTime").value || "",
      allowPush: $("#allowPush").checked,
      allowEmail: $("#allowEmail").checked,
      allowInApp: $("#allowInApp").checked,
      status,
    };
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    await publishAnnouncement();
  }

  /* =========================================================
     createAnnouncement() / updateAnnouncement()
  ========================================================= */
  async function createAnnouncement(payload) {
    await addDoc(collection(db, "notifications"), {
      ...payload,
      createdBy: currentUser?.fullName || "Admin",
      createdById: currentUser?.uid || "",
      readCount: 0,
      totalRecipients: 0,
      isReadByAdmin: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateAnnouncement(id, payload) {
    await updateDoc(doc(db, "notifications", id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }

  /* =========================================================
     publishAnnouncement() / scheduleAnnouncement()
  ========================================================= */
  async function publishAnnouncement() {
    const title = $("#notifTitleInput").value.trim();
    if (!title) {
      showToast("error", "Please enter a title.");
      return;
    }

    const hasSchedule =
      $("#notifScheduleDate").value && $("#notifScheduleTime").value;
    const status = hasSchedule ? "Scheduled" : "Published";
    const payload = readFormPayload(status);

    try {
      if (editingId) {
        await updateAnnouncement(editingId, payload);
        showToast(
          "success",
          hasSchedule ? "Announcement scheduled." : "Announcement updated.",
        );
      } else {
        await createAnnouncement(payload);
        showToast(
          "success",
          hasSchedule ? "Announcement scheduled." : "Announcement published.",
        );
      }
      closeAnnouncementModal();
    } catch (error) {
      console.error("Publish failed:", error);
      showToast("error", "Something went wrong. Please try again.");
    }
  }

  async function scheduleAnnouncement(id, scheduleDate, scheduleTime) {
    try {
      await updateDoc(doc(db, "notifications", id), {
        status: "Scheduled",
        scheduleDate,
        scheduleTime,
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Announcement scheduled.");
    } catch (error) {
      console.error("Schedule failed:", error);
      showToast("error", "Could not schedule announcement.");
    }
  }

  async function saveDraft() {
    const title = $("#notifTitleInput").value.trim();
    if (!title) {
      showToast("error", "Please enter a title.");
      return;
    }
    const payload = readFormPayload("Draft");

    try {
      if (editingId) {
        await updateAnnouncement(editingId, payload);
      } else {
        await createAnnouncement(payload);
      }
      showToast("success", "Saved as draft.");
      closeAnnouncementModal();
    } catch (error) {
      console.error("Save draft failed:", error);
      showToast("error", "Could not save draft.");
    }
  }

  /* =========================================================
     deleteAnnouncement()
  ========================================================= */
  function openDeleteModal(id) {
    const record = allNotifications.find((n) => n.id === id);
    pendingDeleteId = id;
    $("#deleteTargetName").textContent = record
      ? record.title
      : "this notification";
    $("#deleteModalOverlay").hidden = false;
  }
  function closeDeleteModal() {
    pendingDeleteId = null;
    $("#deleteModalOverlay").hidden = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    await deleteAnnouncement(pendingDeleteId);
    closeDeleteModal();
  }

  async function deleteAnnouncement(id) {
    try {
      await deleteDoc(doc(db, "notifications", id));
      showToast("success", "Notification deleted.");
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("error", "Could not delete notification.");
    }
  }

  /* =========================================================
     duplicateAnnouncement()
  ========================================================= */
  async function duplicateAnnouncement(id) {
    const record = allNotifications.find((n) => n.id === id);
    if (!record) return;
    try {
      const { id: _omit, createdAt, updatedAt, readCount, ...rest } = record;
      await addDoc(collection(db, "notifications"), {
        ...rest,
        title: `${record.title} (Copy)`,
        status: "Draft",
        readCount: 0,
        totalRecipients: 0,
        isReadByAdmin: true,
        createdBy: currentUser?.fullName || "Admin",
        createdById: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Announcement duplicated as draft.");
    } catch (error) {
      console.error("Duplicate failed:", error);
      showToast("error", "Could not duplicate announcement.");
    }
  }

  /* =========================================================
     Send Again — republish an expired/sent notification
  ========================================================= */
  async function sendAgain(id) {
    try {
      await updateDoc(doc(db, "notifications", id), {
        status: "Published",
        readCount: 0,
        isReadByAdmin: false,
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Notification sent again.");
    } catch (error) {
      console.error("Send again failed:", error);
      showToast("error", "Could not send notification again.");
    }
  }

  /* =========================================================
     markAllRead()
  ========================================================= */
  async function markAllRead() {
    const unread = allNotifications.filter((n) => !n.isReadByAdmin);
    if (!unread.length) {
      showToast("success", "Nothing to mark — you're all caught up.");
      return;
    }

    try {
      const batch = writeBatch(db);
      unread.forEach((n) =>
        batch.update(doc(db, "notifications", n.id), { isReadByAdmin: true }),
      );
      await batch.commit();
      showToast("success", `Marked ${unread.length} notification(s) as read.`);
    } catch (error) {
      console.error("Mark all read failed:", error);
      showToast("error", "Could not mark notifications as read.");
    }
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    setupFileDrop();

    $("#newAnnouncementBtn")?.addEventListener("click", () =>
      openAnnouncementModal(),
    );
    $("#emptyStateCreateBtn")?.addEventListener("click", () =>
      openAnnouncementModal(),
    );
    $("#markAllReadBtn")?.addEventListener("click", markAllRead);

    $("#notifSearchInput")?.addEventListener("input", searchNotifications);
    [
      "filterType",
      "filterPriority",
      "filterStatus",
      "filterDepartment",
      "filterDateRange",
      "sortNotifications",
    ].forEach((id) =>
      $(`#${id}`)?.addEventListener("change", () => {
        currentPage = 1;
        filterNotifications();
      }),
    );
    $("#resetFiltersBtn")?.addEventListener("click", resetFilters);

    $("#closeAnnouncementModalBtn")?.addEventListener(
      "click",
      closeAnnouncementModal,
    );
    $("#cancelAnnouncementModalBtn")?.addEventListener(
      "click",
      closeAnnouncementModal,
    );
    $("#announcementForm")?.addEventListener("submit", handleFormSubmit);
    $("#saveDraftBtn")?.addEventListener("click", saveDraft);

    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
    $("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);

    $$(".modal-overlay").forEach((overlay) =>
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.hidden = true;
      }),
    );
  }
})();
