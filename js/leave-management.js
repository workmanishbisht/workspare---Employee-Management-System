import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  $,
  showToast,
  renderNav,
  guardAndLoadUser,
  setupUserMenu,
  setupSidebarToggle,
  showSkeleton,
  hideSkeleton,
} from "./layout.js";

(function () {
  "use strict";

  const LEAVE_POLICY = {
    "Annual Leave": 20,
    "Sick Leave": 10,
    "Casual Leave": 10,
    "Personal Leave": 5,
  };

  let allLeaves = [];
  let allEmployees = [];
  let unsubscribeLeaves = null;
  let editingDocId = null;
  let pendingApproveId = null;
  let pendingRejectId = null;
  let pendingDeleteId = null;

  const filters = {
    tab: "all",
    search: "",
    department: "all",
    leaveType: "all",
    month: "",
    sort: "newest",
  };

  /* =========================================================
     HELPERS
  ========================================================= */
  function calcDuration(start, end) {
    if (!start || !end) return 0;
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatTimestamp(ts) {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function statusClass(status) {
    return (status || "pending").toLowerCase();
  }

  function todayStr() {
    return new Date().toISOString().split("T")[0];
  }

  /* =========================================================
     FIRESTORE: EMPLOYEES (for dropdown + lookups)
  ========================================================= */
  async function loadEmployeesForSelect() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      allEmployees = snap.docs.map((d) => ({ ...d.data(), docId: d.id }));
    } catch (error) {
      console.error("Failed to load employees:", error);
      allEmployees = [];
    }

    const select = $("#lmEmployeeSelect");
    select.innerHTML =
      `<option value="" disabled selected>Select employee</option>` +
      allEmployees
        .map((e) => `<option value="${e.employeeId}">${e.fullName} — ${e.employeeId}</option>`)
        .join("");

    const deptFilter = $("#lmDepartmentFilter");
    const departments = [...new Set(allEmployees.map((e) => e.department).filter(Boolean))];
    deptFilter.innerHTML =
      `<option value="all">All Departments</option>` +
      departments.map((d) => `<option value="${d}">${d}</option>`).join("");
  }

  /* =========================================================
     FIRESTORE: LEAVE REQUESTS (realtime)
  ========================================================= */
  function loadLeaveRequests() {
    if (unsubscribeLeaves) unsubscribeLeaves();

    unsubscribeLeaves = onSnapshot(
      collection(db, "leaveRequests"),
      (snap) => {
        allLeaves = snap.docs.map((d) => ({ ...d.data(), docId: d.id }));
        renderStatistics();
        renderLeaveTable();
        renderLeaveBalance();
        renderUpcomingLeaves();

        hideSkeleton("lmSkeleton", "lmContent");
      },
      (error) => {
        console.error("Failed to load leave requests:", error);
        showToast("error", "Could not load leave requests.");
      },
    );
  }

  /* =========================================================
     RENDER: STATISTICS
  ========================================================= */
  function renderStatistics() {
    const total = allLeaves.length;
    const approved = allLeaves.filter((l) => l.status === "Approved").length;
    const pending = allLeaves.filter((l) => l.status === "Pending").length;
    const rejected = allLeaves.filter((l) => l.status === "Rejected").length;

    const totalAllotted =
      allEmployees.length * Object.values(LEAVE_POLICY).reduce((a, b) => a + b, 0);
    const totalUsed = allLeaves
      .filter((l) => l.status === "Approved")
      .reduce((sum, l) => sum + (Number(l.duration) || 0), 0);
    const remainingBalance = Math.max(totalAllotted - totalUsed, 0);

    const stats = [
      {
        label: "Total Leave Requests",
        value: total,
        icon: "ri-calendar-2-line",
        color: "blue",
        changeLabel: "all time requests",
      },
      {
        label: "Approved Leaves",
        value: approved,
        icon: "ri-checkbox-circle-line",
        color: "green",
        changeLabel: total ? Math.round((approved / total) * 100) + "% of total" : "0% of total",
      },
      {
        label: "Pending Requests",
        value: pending,
        icon: "ri-time-line",
        color: "orange",
        changeLabel: "awaiting review",
      },
      {
        label: "Rejected Leaves",
        value: rejected,
        icon: "ri-close-circle-line",
        color: "purple",
        changeLabel: total ? Math.round((rejected / total) * 100) + "% of total" : "0% of total",
      },
      {
        label: "Available Leave Balance",
        value: remainingBalance,
        icon: "ri-wallet-3-line",
        color: "indigo",
        changeLabel: "days remaining org-wide",
      },
    ];

    $("#lmStatsGrid").innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card">
        <div class="stat-card__top">
          <div class="stat-card__icon ${s.color}"><i class="${s.icon}"></i></div>
        </div>
        <p class="stat-card__label">${s.label}</p>
        <p class="stat-card__value">${s.value}</p>
        <div class="stat-card__bottom">
          <span class="stat-card__change neutral">${s.changeLabel}</span>
        </div>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: LEAVE BALANCE SIDEBAR
  ========================================================= */
  function renderLeaveBalance() {
    const wrap = $("#lmLeaveBalanceList");

    const rows = Object.keys(LEAVE_POLICY).map((type) => {
      const allotted = LEAVE_POLICY[type] * (allEmployees.length || 1);
      const used = allLeaves
        .filter((l) => l.leaveType === type && l.status === "Approved")
        .reduce((sum, l) => sum + (Number(l.duration) || 0), 0);
      const remaining = Math.max(allotted - used, 0);
      const pct = allotted ? Math.min(Math.round((used / allotted) * 100), 100) : 0;

      return { type, allotted, used, remaining, pct };
    });

    wrap.innerHTML = rows
      .map(
        (r) => `
      <div class="lm-balance-item">
        <div class="lm-balance-item__head">
          <span>${r.type}</span>
          <strong>${r.used} / ${r.allotted} days used</strong>
        </div>
        <div class="lm-balance-item__bar">
          <div class="lm-balance-item__fill" style="width:${r.pct}%"></div>
        </div>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: UPCOMING LEAVES SIDEBAR
  ========================================================= */
  function renderUpcomingLeaves() {
    const wrap = $("#lmUpcomingList");
    const today = todayStr();

    const upcoming = allLeaves
      .filter((l) => l.status === "Approved" && l.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5);

    if (!upcoming.length) {
      wrap.innerHTML = `<p class="empty-state">No upcoming approved leaves.</p>`;
      return;
    }

    wrap.innerHTML = upcoming
      .map(
        (l) => `
      <div class="lm-upcoming-item">
        <div>
          <p class="lm-upcoming-item__name">${l.employeeName || "—"}</p>
          <p class="lm-upcoming-item__type">${l.leaveType || "—"}</p>
        </div>
        <div class="lm-upcoming-item__meta">
          <span>${formatDate(l.startDate)}</span>
          <span>${l.duration} Day${l.duration > 1 ? "s" : ""}</span>
        </div>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: LEAVE TABLE
  ========================================================= */
  function getFilteredLeaves() {
    let result = [...allLeaves];

    if (filters.tab !== "all") {
      result = result.filter((l) => l.status === filters.tab);
    }

    if (filters.department !== "all") {
      result = result.filter((l) => l.department === filters.department);
    }

    if (filters.leaveType !== "all") {
      result = result.filter((l) => l.leaveType === filters.leaveType);
    }

    if (filters.month) {
      result = result.filter((l) => (l.startDate || "").startsWith(filters.month));
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((l) =>
        [l.employeeName, l.employeeId, l.department, l.leaveType]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      const cmp = (a.startDate || "").localeCompare(b.startDate || "");
      return filters.sort === "newest" ? -cmp : cmp;
    });

    return result;
  }

  function renderLeaveTable() {
    const filtered = getFilteredLeaves();
    const tbody = $("#lmTableBody");
    const emptyState = $("#lmEmptyState");
    const tableScroll = $(".att-table-card .table-scroll");

    if (!allLeaves.length) {
      tableScroll.style.display = "none";
      emptyState.classList.remove("att-hidden");
      return;
    }

    tableScroll.style.display = "";
    emptyState.classList.add("att-hidden");

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No leave requests match your search/filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((l) => {
        const avatar =
          l.employeePhoto ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (l.employeeName || "E").slice(0, 2),
          )}&background=6c5ce7&color=fff`;

        const canModerate = l.status === "Pending";

        return `
        <tr data-doc-id="${l.docId}">
          <td>
            <div class="employee-cell">
              <img src="${avatar}" alt="${l.employeeName}" />
              <div>
                <p class="employee-cell__name">${l.employeeName || "—"}</p>
                <p class="employee-cell__id">${l.employeeId || ""}</p>
              </div>
            </div>
          </td>
          <td>${l.leaveType || "—"}</td>
          <td>${formatDate(l.startDate)} – ${formatDate(l.endDate)}</td>
          <td>${l.duration || 0} Day${l.duration > 1 ? "s" : ""}</td>
          <td class="lm-reason-cell" title="${l.reason || ""}">${l.reason || "—"}</td>
          <td><span class="status-badge ${statusClass(l.status)}">${l.status || "Pending"}</span></td>
          <td>${formatTimestamp(l.createdAt)}</td>
          <td>
            <div class="row-actions">
              <a class="row-actions__btn" href="./leave-details.html?id=${l.docId}" title="View">
                <i class="ri-eye-line"></i>
              </a>
              <button class="row-actions__btn edit" data-action="edit" data-doc-id="${l.docId}" title="Edit">
                <i class="ri-pencil-line"></i>
              </button>
              ${
                canModerate
                  ? `
              <button class="row-actions__btn approve" data-action="approve" data-doc-id="${l.docId}" title="Approve">
                <i class="ri-check-line"></i>
              </button>
              <button class="row-actions__btn reject" data-action="reject" data-doc-id="${l.docId}" title="Reject">
                <i class="ri-close-line"></i>
              </button>`
                  : ""
              }
              <button class="row-actions__btn delete" data-action="delete" data-doc-id="${l.docId}" title="Delete">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function searchLeaveRequests(value) {
    filters.search = value;
    renderLeaveTable();
  }

  function filterLeaveRequests() {
    filters.department = $("#lmDepartmentFilter").value;
    filters.leaveType = $("#lmLeaveTypeFilter").value;
    filters.month = $("#lmMonthFilter").value;
    filters.sort = $("#lmSortSelect").value;
    renderLeaveTable();
  }

  function setActiveTab(tab) {
    filters.tab = tab;
    document.querySelectorAll(".lm-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    renderLeaveTable();
  }

  function resetFilters() {
    filters.search = "";
    filters.department = "all";
    filters.leaveType = "all";
    filters.month = "";
    filters.sort = "newest";
    filters.tab = "all";

    $("#lmSearchInput").value = "";
    $("#lmDepartmentFilter").value = "all";
    $("#lmLeaveTypeFilter").value = "all";
    $("#lmMonthFilter").value = "";
    $("#lmSortSelect").value = "newest";
    setActiveTab("all");
  }

  /* =========================================================
     MODAL: APPLY / EDIT LEAVE
  ========================================================= */
  function updateDurationPreview() {
    const duration = calcDuration($("#lmStartDate").value, $("#lmEndDate").value);
    $("#lmDurationPreview").textContent = `${duration} Day${duration !== 1 ? "s" : ""}`;
  }

  function openLeaveModal(leave) {
    editingDocId = leave ? leave.docId : null;

    $("#lmDocId").value = editingDocId || "";
    $("#lmEmployeeSelect").value = leave?.employeeId || "";
    $("#lmLeaveType").value = leave?.leaveType || "";
    $("#lmStartDate").value = leave?.startDate || todayStr();
    $("#lmEndDate").value = leave?.endDate || todayStr();
    $("#lmReason").value = leave?.reason || "";
    $("#lmEmergencyContact").value = leave?.emergencyContact || "";
    $("#lmAttachment").value = leave?.attachment || "";

    $("#lmModalTitle").textContent = leave ? "Edit Leave Request" : "Apply Leave";
    $("#lmSaveBtnText").textContent = leave ? "Update Leave" : "Submit Leave";

    updateDurationPreview();
    $("#lmModalOverlay").classList.add("show");
  }

  function closeLeaveModal() {
    $("#lmModalOverlay").classList.remove("show");
    $("#lmForm").reset();
    editingDocId = null;
  }

  async function saveLeaveRequest(e) {
    e.preventDefault();

    const employeeId = $("#lmEmployeeSelect").value;
    const employee = allEmployees.find((emp) => emp.employeeId === employeeId);
    const leaveType = $("#lmLeaveType").value;
    const startDate = $("#lmStartDate").value;
    const endDate = $("#lmEndDate").value;
    const reason = $("#lmReason").value.trim();
    const emergencyContact = $("#lmEmergencyContact").value.trim();
    const attachment = $("#lmAttachment").value.trim();

    if (!employeeId || !leaveType || !startDate || !endDate || !reason) {
      showToast("error", "Please fill all required fields.");
      return;
    }

    const duration = calcDuration(startDate, endDate);
    if (duration <= 0) {
      showToast("error", "End date must be on or after start date.");
      return;
    }

    const payload = {
      employeeId,
      employeeName: employee?.fullName || "",
      employeePhoto: employee?.profileImage || "",
      department: employee?.department || "",
      designation: employee?.designation || "",
      leaveType,
      startDate,
      endDate,
      duration,
      reason,
      emergencyContact,
      attachment,
      updatedAt: serverTimestamp(),
    };

    const saveBtn = $("#lmSaveBtn");
    saveBtn.disabled = true;

    try {
      if (editingDocId) {
        await updateLeaveRequest(editingDocId, payload);
        showToast("success", "Leave request updated successfully.");
      } else {
        payload.status = "Pending";
        payload.approvedBy = "";
        payload.approvedDate = null;
        payload.rejectionReason = "";
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "leaveRequests"), payload);
        showToast("success", "Leave request submitted successfully.");
      }
      closeLeaveModal();
    } catch (error) {
      console.error("Failed to save leave request:", error);
      showToast("error", "Could not save leave request.");
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function updateLeaveRequest(docId, payload) {
    await updateDoc(doc(db, "leaveRequests", docId), payload);
  }

  /* =========================================================
     APPROVE / REJECT
  ========================================================= */
  function openApproveModal(docId, name) {
    pendingApproveId = docId;
    $("#lmApproveName").textContent = name || "this employee";
    $("#lmApproveModalOverlay").classList.add("show");
  }

  function closeApproveModal() {
    $("#lmApproveModalOverlay").classList.remove("show");
    pendingApproveId = null;
  }

  async function approveLeave() {
    if (!pendingApproveId) return;
    const btn = $("#lmApproveConfirmBtn");
    btn.disabled = true;

    try {
      await updateDoc(doc(db, "leaveRequests", pendingApproveId), {
        status: "Approved",
        approvedBy: "Admin",
        approvedDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Leave request approved.");
      closeApproveModal();
    } catch (error) {
      console.error("Failed to approve leave:", error);
      showToast("error", "Could not approve leave request.");
    } finally {
      btn.disabled = false;
    }
  }

  function openRejectModal(docId, name) {
    pendingRejectId = docId;
    $("#lmRejectName").textContent = name || "this employee";
    $("#lmRejectReason").value = "";
    $("#lmRejectModalOverlay").classList.add("show");
  }

  function closeRejectModal() {
    $("#lmRejectModalOverlay").classList.remove("show");
    pendingRejectId = null;
  }

  async function rejectLeave() {
    if (!pendingRejectId) return;
    const btn = $("#lmRejectConfirmBtn");
    btn.disabled = true;

    try {
      await updateDoc(doc(db, "leaveRequests", pendingRejectId), {
        status: "Rejected",
        rejectionReason: $("#lmRejectReason").value.trim(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Leave request rejected.");
      closeRejectModal();
    } catch (error) {
      console.error("Failed to reject leave:", error);
      showToast("error", "Could not reject leave request.");
    } finally {
      btn.disabled = false;
    }
  }

  /* =========================================================
     DELETE LEAVE
  ========================================================= */
  function openDeleteModal(docId, name) {
    pendingDeleteId = docId;
    $("#lmDeleteName").textContent = name || "this employee";
    $("#lmDeleteModalOverlay").classList.add("show");
  }

  function closeDeleteModal() {
    $("#lmDeleteModalOverlay").classList.remove("show");
    pendingDeleteId = null;
  }

  async function deleteLeave() {
    if (!pendingDeleteId) return;
    const btn = $("#lmDeleteConfirmBtn");
    btn.disabled = true;

    try {
      await deleteDoc(doc(db, "leaveRequests", pendingDeleteId));
      showToast("success", "Leave request deleted.");
      closeDeleteModal();
    } catch (error) {
      console.error("Failed to delete leave request:", error);
      showToast("error", "Could not delete leave request.");
    } finally {
      btn.disabled = false;
    }
  }

  /* =========================================================
     REFRESH
  ========================================================= */
  async function refreshLeaveTable() {
    await loadEmployeesForSelect();
  }

  /* =========================================================
     EVENT BINDINGS
  ========================================================= */
  function bindEvents() {
    $("#openApplyLeaveBtn").addEventListener("click", () => openLeaveModal(null));
    $("#lmEmptyApplyBtn").addEventListener("click", () => openLeaveModal(null));
    $("#lmModalCloseBtn").addEventListener("click", closeLeaveModal);
    $("#lmCancelBtn").addEventListener("click", closeLeaveModal);
    $("#lmModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "lmModalOverlay") closeLeaveModal();
    });
    $("#lmForm").addEventListener("submit", saveLeaveRequest);

    $("#lmStartDate").addEventListener("input", updateDurationPreview);
    $("#lmEndDate").addEventListener("input", updateDurationPreview);

    $("#lmApproveCloseBtn").addEventListener("click", closeApproveModal);
    $("#lmApproveCancelBtn").addEventListener("click", closeApproveModal);
    $("#lmApproveModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "lmApproveModalOverlay") closeApproveModal();
    });
    $("#lmApproveConfirmBtn").addEventListener("click", approveLeave);

    $("#lmRejectCloseBtn").addEventListener("click", closeRejectModal);
    $("#lmRejectCancelBtn").addEventListener("click", closeRejectModal);
    $("#lmRejectModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "lmRejectModalOverlay") closeRejectModal();
    });
    $("#lmRejectConfirmBtn").addEventListener("click", rejectLeave);

    $("#lmDeleteCloseBtn").addEventListener("click", closeDeleteModal);
    $("#lmDeleteCancelBtn").addEventListener("click", closeDeleteModal);
    $("#lmDeleteModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "lmDeleteModalOverlay") closeDeleteModal();
    });
    $("#lmDeleteConfirmBtn").addEventListener("click", deleteLeave);

    $("#lmTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest(".row-actions__btn");
      if (!btn) return;

      const docId = btn.dataset.docId;
      const leave = allLeaves.find((l) => l.docId === docId);
      if (!leave) return;

      if (btn.dataset.action === "edit") {
        openLeaveModal(leave);
      } else if (btn.dataset.action === "approve") {
        openApproveModal(docId, leave.employeeName);
      } else if (btn.dataset.action === "reject") {
        openRejectModal(docId, leave.employeeName);
      } else if (btn.dataset.action === "delete") {
        openDeleteModal(docId, leave.employeeName);
      }
    });

    $("#lmSearchInput").addEventListener("input", (e) => searchLeaveRequests(e.target.value));
    $("#lmDepartmentFilter").addEventListener("change", filterLeaveRequests);
    $("#lmLeaveTypeFilter").addEventListener("change", filterLeaveRequests);
    $("#lmMonthFilter").addEventListener("change", filterLeaveRequests);
    $("#lmSortSelect").addEventListener("change", filterLeaveRequests);
    $("#lmResetFiltersBtn").addEventListener("click", resetFilters);

    document.querySelectorAll(".lm-tab").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    showSkeleton("lmSkeleton", "lmContent");

    await loadEmployeesForSelect();
    loadLeaveRequests();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();