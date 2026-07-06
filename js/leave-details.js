import { db } from "../firebase/firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  $,
  showToast,
  renderNav,
  guardAndLoadUser,
  setupUserMenu,
  setupSidebarToggle,
} from "./layout.js";

(function () {
  "use strict";

  const LEAVE_POLICY = {
    "Annual Leave": 20,
    "Sick Leave": 10,
    "Casual Leave": 10,
    "Personal Leave": 5,
  };

  let leaveId = null;
  let leaveData = null;
  let employeeData = null;
  let departmentData = null;
  let allEmployeeLeaves = [];

  /* =========================================================
     HELPERS
  ========================================================= */
  function getLeaveIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
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
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusClass(status) {
    return (status || "pending").toLowerCase();
  }

  function shortId(id) {
    return `LR-${id.slice(-4).toUpperCase()}`;
  }

  /* =========================================================
     LOAD LEAVE
  ========================================================= */
  async function loadLeave() {
    leaveId = getLeaveIdFromUrl();

    if (!leaveId) {
      window.location.href = "./leave-management.html";
      return false;
    }

    try {
      const snap = await getDoc(doc(db, "leaveRequests", leaveId));
      if (!snap.exists()) {
        showToast("error", "Leave request not found.");
        setTimeout(() => (window.location.href = "./leave.html"), 800);
        return false;
      }

      leaveData = { id: snap.id, ...snap.data() };
      return true;
    } catch (error) {
      console.error("Failed to load leave request:", error);
      showToast("error", "Could not load leave request.");
      setTimeout(() => (window.location.href = "./leave.html"), 800);
      return false;
    }
  }

  /* =========================================================
     LOAD EMPLOYEE + DEPARTMENT
  ========================================================= */
  async function loadEmployee() {
    try {
      const q = query(collection(db, "employees"), where("employeeId", "==", leaveData.employeeId));
      const snap = await getDocs(q);
      employeeData = snap.empty ? null : { ...snap.docs[0].data(), docId: snap.docs[0].id };
    } catch (error) {
      console.error("Failed to load employee:", error);
      employeeData = null;
    }

    try {
      const deptQuery = query(
        collection(db, "departments"),
        where("departmentName", "==", leaveData.department),
      );
      const deptSnap = await getDocs(deptQuery);
      departmentData = deptSnap.empty ? null : deptSnap.docs[0].data();
    } catch (error) {
      console.error("Failed to load department:", error);
      departmentData = null;
    }

    try {
      const leavesQuery = query(
        collection(db, "leaveRequests"),
        where("employeeId", "==", leaveData.employeeId),
      );
      const leavesSnap = await getDocs(leavesQuery);
      allEmployeeLeaves = leavesSnap.docs.map((d) => ({ ...d.data(), docId: d.id }));
    } catch (error) {
      console.error("Failed to load employee leave history:", error);
      allEmployeeLeaves = [];
    }
  }

  /* =========================================================
     RENDER: HERO
  ========================================================= */
  function renderHero() {
    const l = leaveData;
    const e = employeeData;

    const avatar =
      e?.profileImage ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent((l.employeeName || "E").slice(0, 2))}&background=6c5ce7&color=fff`;

    $("#ldEmployeePhoto").src = avatar;
    $("#ldSideEmployeePhoto").src = avatar;

    $("#ldEmployeeName").textContent = l.employeeName || "—";
    $("#ldSideEmployeeName").textContent = l.employeeName || "—";
    $("#ldSideEmployeeMeta").textContent = `${l.designation || "—"} • ${l.department || "—"}`;

    $("#ldEmployeeIdChip").textContent = `ID: ${l.employeeId || "—"}`;
    $("#ldDeptChip").textContent = `Dept: ${l.department || "—"}`;
    $("#ldDesignation").textContent = l.designation || "—";

    const statusBadge = $("#ldStatusBadge");
    statusBadge.textContent = l.status || "Pending";
    statusBadge.className = `status-badge ${statusClass(l.status)}`;

    $("#ldRequestNumber").textContent = `Leave Request #${shortId(l.id)}`;

    $("#ldManager").textContent = departmentData?.departmentHead || "—";
    $("#ldEmail").textContent = e?.email || "—";
    $("#ldPhone").textContent = e?.phone || "—";
    $("#ldLocation").textContent = departmentData?.location || "—";

    $("#sideEmployeeId").textContent = l.employeeId || "—";
    $("#sideDepartment").textContent = l.department || "—";
    $("#sideDesignation").textContent = l.designation || "—";

    if (e?.docId) {
      $("#ldEmployeeCardLink").href = `./employee-details.html?id=${e.docId}`;
    }

    updateActionButtonsVisibility();
  }

  function updateActionButtonsVisibility() {
    const isPending = leaveData.status === "Pending";
    $("#ldApproveBtn").style.display = isPending ? "" : "none";
    $("#ldRejectBtn").style.display = isPending ? "" : "none";
    $("#qaApprove").style.display = isPending ? "" : "none";
    $("#qaReject").style.display = isPending ? "" : "none";
  }

  /* =========================================================
     RENDER: LEAVE INFO
  ========================================================= */
  function renderLeaveInfo() {
    const l = leaveData;

    $("#infoLeaveType").textContent = l.leaveType || "—";
    $("#infoDuration").textContent = `${l.duration || 0} Day${l.duration > 1 ? "s" : ""}`;
    $("#infoStartDate").textContent = formatDate(l.startDate);
    $("#infoEndDate").textContent = formatDate(l.endDate);
    $("#infoAppliedOn").textContent = formatTimestamp(l.createdAt);
    $("#infoEmergencyContact").textContent = l.emergencyContact || "—";
    $("#infoReason").textContent = l.reason || "No reason provided.";

    const attachmentBlock = $("#ldAttachmentBlock");
    if (l.attachment) {
      attachmentBlock.classList.remove("dd-hidden");
      $("#infoAttachment").href = l.attachment;
    } else {
      attachmentBlock.classList.add("dd-hidden");
    }
  }

  /* =========================================================
     RENDER: APPROVAL INFO
  ========================================================= */
  function renderApprovalInfo() {
    const l = leaveData;

    $("#infoCurrentStatus").textContent = l.status || "Pending";
    $("#infoApprovedBy").textContent = l.approvedBy || "—";
    $("#infoApprovedDate").textContent = l.approvedDate ? formatTimestamp(l.approvedDate) : "—";
    $("#infoRejectedBy").textContent = l.rejectedBy || "—";
    $("#infoRejectedDate").textContent = l.rejectedDate ? formatTimestamp(l.rejectedDate) : "—";

    const rejectionBlock = $("#ldRejectionReasonBlock");
    if (l.status === "Rejected") {
      rejectionBlock.classList.remove("dd-hidden");
      $("#infoRejectionReason").textContent = l.rejectionReason || "No reason provided.";
    } else {
      rejectionBlock.classList.add("dd-hidden");
    }
  }

  /* =========================================================
     RENDER: TIMELINE
  ========================================================= */
  function renderTimeline() {
    const l = leaveData;
    const steps = [
      {
        label: "Applied",
        time: formatTimestamp(l.createdAt),
        done: true,
      },
      {
        label: "Under Review",
        time: l.status === "Pending" ? "In progress" : formatTimestamp(l.createdAt),
        done: true,
      },
    ];

    if (l.status === "Approved") {
      steps.push({
        label: "Approved",
        time: formatTimestamp(l.approvedDate),
        done: true,
        dot: "success",
      });
    } else if (l.status === "Rejected") {
      steps.push({
        label: "Rejected",
        time: formatTimestamp(l.rejectedDate),
        done: true,
        dot: "error",
      });
    } else {
      steps.push({
        label: "Approved / Rejected",
        time: "Pending decision",
        done: false,
      });
    }

    $("#ldTimeline").innerHTML = steps
      .map(
        (s) => `
      <li class="dd-timeline__item">
        <span class="dd-timeline__dot ${s.dot || (s.done ? "info" : "muted")}"></span>
        <div>
          <p>${s.label}</p>
          <span class="dd-timeline__time">${s.time}</span>
        </div>
      </li>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: LEAVE BALANCE
  ========================================================= */
  function renderLeaveBalance() {
    const types = ["Annual Leave", "Sick Leave", "Personal Leave"];

    const cards = types.map((type) => {
      const used = allEmployeeLeaves
        .filter((l) => l.leaveType === type && l.status === "Approved")
        .reduce((sum, l) => sum + (Number(l.duration) || 0), 0);
      const allotted = LEAVE_POLICY[type] || 0;
      const remaining = Math.max(allotted - used, 0);

      return { type, used, allotted, remaining };
    });

    $("#ldLeaveBalanceGrid").innerHTML = cards
      .map(
        (c) => `
      <div class="ld-balance-card">
        <p class="ld-balance-card__type">${c.type}</p>
        <div class="ld-balance-card__row">
          <span>Used</span><strong>${c.used} Days</strong>
        </div>
        <div class="ld-balance-card__row">
          <span>Remaining</span><strong>${c.remaining} Days</strong>
        </div>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     SIDEBAR: UPCOMING + RECENT
  ========================================================= */
  function renderSidebarLists() {
    const today = new Date().toISOString().split("T")[0];

    const upcoming = allEmployeeLeaves
      .filter((l) => l.status === "Approved" && l.startDate >= today && l.docId !== leaveData.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

    $("#ldUpcomingLeave").innerHTML = upcoming
      ? `
      <div class="lm-upcoming-item">
        <div>
          <p class="lm-upcoming-item__name">${upcoming.leaveType}</p>
          <p class="lm-upcoming-item__type">${formatDate(upcoming.startDate)} – ${formatDate(upcoming.endDate)}</p>
        </div>
        <span class="status-badge approved">Approved</span>
      </div>`
      : `<p class="empty-state">No other upcoming leaves.</p>`;

    const recent = allEmployeeLeaves
      .filter((l) => l.docId !== leaveData.id)
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))
      .slice(0, 4);

    $("#ldRecentLeaves").innerHTML = recent.length
      ? recent
          .map(
            (l) => `
        <a href="./leave-details.html?id=${l.docId}" class="lm-upcoming-item ld-recent-link">
          <div>
            <p class="lm-upcoming-item__name">${l.leaveType}</p>
            <p class="lm-upcoming-item__type">${formatDate(l.startDate)}</p>
          </div>
          <span class="status-badge ${statusClass(l.status)}">${l.status}</span>
        </a>`,
          )
          .join("")
      : `<p class="empty-state">No other leave requests found.</p>`;
  }

  /* =========================================================
     APPROVE / REJECT / EDIT / DELETE
  ========================================================= */
  async function approveLeave() {
    const btn = $("#ldApproveConfirmBtn");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "leaveRequests", leaveId), {
        status: "Approved",
        approvedBy: "Admin",
        approvedDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Leave request approved.");
      closeModal("#ldApproveModalOverlay");
      await refreshLeave();
    } catch (error) {
      console.error("Failed to approve leave:", error);
      showToast("error", "Could not approve leave request.");
    } finally {
      btn.disabled = false;
    }
  }

  async function rejectLeave() {
    const btn = $("#ldRejectConfirmBtn");
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "leaveRequests", leaveId), {
        status: "Rejected",
        rejectedBy: "Admin",
        rejectedDate: serverTimestamp(),
        rejectionReason: $("#ldRejectReason").value.trim(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Leave request rejected.");
      closeModal("#ldRejectModalOverlay");
      await refreshLeave();
    } catch (error) {
      console.error("Failed to reject leave:", error);
      showToast("error", "Could not reject leave request.");
    } finally {
      btn.disabled = false;
    }
  }

  function openEditModal() {
    $("#ldLeaveType").value = leaveData.leaveType || "Annual Leave";
    $("#ldStartDate").value = leaveData.startDate || "";
    $("#ldEndDate").value = leaveData.endDate || "";
    $("#ldReason").value = leaveData.reason || "";
    $("#ldEmergencyContact").value = leaveData.emergencyContact || "";
    $("#ldAttachment").value = leaveData.attachment || "";
    $("#ldEditModalOverlay").classList.add("show");
  }

  async function editLeave(e) {
    e.preventDefault();

    const startDate = $("#ldStartDate").value;
    const endDate = $("#ldEndDate").value;
    const s = new Date(`${startDate}T00:00:00`);
    const en = new Date(`${endDate}T00:00:00`);
    const duration = Math.round((en - s) / (1000 * 60 * 60 * 24)) + 1;

    if (duration <= 0) {
      showToast("error", "End date must be on or after start date.");
      return;
    }

    try {
      await updateDoc(doc(db, "leaveRequests", leaveId), {
        leaveType: $("#ldLeaveType").value,
        startDate,
        endDate,
        duration,
        reason: $("#ldReason").value.trim(),
        emergencyContact: $("#ldEmergencyContact").value.trim(),
        attachment: $("#ldAttachment").value.trim(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Leave request updated.");
      closeModal("#ldEditModalOverlay");
      await refreshLeave();
    } catch (error) {
      console.error("Failed to update leave request:", error);
      showToast("error", "Could not update leave request.");
    }
  }

  async function deleteLeave() {
    const btn = $("#ldDeleteConfirmBtn");
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "leaveRequests", leaveId));
      showToast("success", "Leave request deleted.");
      setTimeout(() => (window.location.href = "./leave-management.html"), 700);
    } catch (error) {
      console.error("Failed to delete leave request:", error);
      showToast("error", "Could not delete leave request.");
      btn.disabled = false;
    }
  }

  function printLeave() {
    window.print();
  }

  /* =========================================================
     REFRESH
  ========================================================= */
  async function refreshLeave() {
    const ok = await loadLeave();
    if (!ok) return;
    await loadEmployee();
    renderHero();
    renderLeaveInfo();
    renderApprovalInfo();
    renderTimeline();
    renderLeaveBalance();
    renderSidebarLists();
  }

  /* =========================================================
     MODAL HELPERS
  ========================================================= */
  function closeModal(selector) {
    $(selector).classList.remove("show");
  }

  /* =========================================================
     EVENT BINDINGS
  ========================================================= */
  function bindEvents() {
    $("#ldApproveBtn").addEventListener("click", () => openApprove());
    $("#qaApprove").addEventListener("click", () => openApprove());
    $("#ldApproveCloseBtn").addEventListener("click", () => closeModal("#ldApproveModalOverlay"));
    $("#ldApproveCancelBtn").addEventListener("click", () => closeModal("#ldApproveModalOverlay"));
    $("#ldApproveModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ldApproveModalOverlay") closeModal("#ldApproveModalOverlay");
    });
    $("#ldApproveConfirmBtn").addEventListener("click", approveLeave);

    $("#ldRejectBtn").addEventListener("click", () => openReject());
    $("#qaReject").addEventListener("click", () => openReject());
    $("#ldRejectCloseBtn").addEventListener("click", () => closeModal("#ldRejectModalOverlay"));
    $("#ldRejectCancelBtn").addEventListener("click", () => closeModal("#ldRejectModalOverlay"));
    $("#ldRejectModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ldRejectModalOverlay") closeModal("#ldRejectModalOverlay");
    });
    $("#ldRejectConfirmBtn").addEventListener("click", rejectLeave);

    $("#ldEditBtn").addEventListener("click", openEditModal);
    $("#qaEdit").addEventListener("click", openEditModal);
    $("#ldEditCloseBtn").addEventListener("click", () => closeModal("#ldEditModalOverlay"));
    $("#ldEditCancelBtn").addEventListener("click", () => closeModal("#ldEditModalOverlay"));
    $("#ldEditModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ldEditModalOverlay") closeModal("#ldEditModalOverlay");
    });
    $("#ldEditForm").addEventListener("submit", editLeave);

    $("#ldDeleteBtn").addEventListener("click", () => $("#ldDeleteModalOverlay").classList.add("show"));
    $("#ldDeleteCloseBtn").addEventListener("click", () => closeModal("#ldDeleteModalOverlay"));
    $("#ldDeleteCancelBtn").addEventListener("click", () => closeModal("#ldDeleteModalOverlay"));
    $("#ldDeleteModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ldDeleteModalOverlay") closeModal("#ldDeleteModalOverlay");
    });
    $("#ldDeleteConfirmBtn").addEventListener("click", deleteLeave);

    $("#ldPrintBtn").addEventListener("click", printLeave);
    $("#qaPrint").addEventListener("click", printLeave);
    $("#qaDownload").addEventListener("click", printLeave);

    function openApprove() {
      $("#ldApproveName").textContent = leaveData.employeeName || "this employee";
      $("#ldApproveModalOverlay").classList.add("show");
    }

    function openReject() {
      $("#ldRejectName").textContent = leaveData.employeeName || "this employee";
      $("#ldRejectReason").value = "";
      $("#ldRejectModalOverlay").classList.add("show");
    }
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    const ok = await loadLeave();
    if (!ok) return;

    await loadEmployee();

    renderHero();
    renderLeaveInfo();
    renderApprovalInfo();
    renderTimeline();
    renderLeaveBalance();
    renderSidebarLists();
    bindEvents();

    $("#ldSkeleton").classList.add("dd-hidden");
    $("#ldContent").classList.remove("dd-hidden");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
