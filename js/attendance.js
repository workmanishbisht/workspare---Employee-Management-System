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

  const COMPANY_START_TIME = "09:30";

  let allAttendance = [];
  let allEmployees = [];
  let unsubscribeAttendance = null;
  let editingDocId = null;
  let pendingDeleteId = null;

  const filters = {
    search: "",
    department: "all",
    status: "all",
    date: "",
    month: "",
    sort: "newest",
  };

  /* =========================================================
     TIME HELPERS
  ========================================================= */
  function timeToMinutes(t) {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    if (mins === null || isNaN(mins) || mins < 0) return "00:00";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function computeWorkingHours(checkIn, checkOut, breakDuration) {
    const inM = timeToMinutes(checkIn);
    const outM = timeToMinutes(checkOut);
    const breakM = timeToMinutes(breakDuration) || 0;

    if (inM === null || outM === null) {
      return { workingHours: "00:00", overtime: "00:00" };
    }

    let diff = outM - inM - breakM;
    if (diff < 0) diff = 0;

    const overtimeMin = diff > 480 ? diff - 480 : 0;

    return {
      workingHours: minutesToTime(diff),
      overtime: minutesToTime(overtimeMin),
    };
  }

  function isLateCheckIn(checkIn) {
    const inM = timeToMinutes(checkIn);
    const startM = timeToMinutes(COMPANY_START_TIME);
    return inM !== null && inM > startM;
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function todayStr() {
    return new Date().toISOString().split("T")[0];
  }

  function statusClass(status) {
    return (status || "present").toLowerCase().replace(/\s+/g, "");
  }

  /* =========================================================
     FIRESTORE: EMPLOYEES (for select dropdown + lookups)
  ========================================================= */
  async function loadEmployeesForSelect() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      allEmployees = snap.docs.map((d) => ({ ...d.data(), docId: d.id }));
    } catch (error) {
      console.error("Failed to load employees:", error);
      allEmployees = [];
    }

    const select = $("#attEmployeeSelect");
    const options = allEmployees
      .map(
        (e) =>
          `<option value="${e.employeeId}">${e.fullName} — ${e.employeeId}</option>`,
      )
      .join("");
    select.innerHTML = `<option value="" disabled selected>Select employee</option>${options}`;

    const deptFilter = $("#attDepartmentFilter");
    const departments = [
      ...new Set(allEmployees.map((e) => e.department).filter(Boolean)),
    ];
    deptFilter.innerHTML =
      `<option value="all">All Departments</option>` +
      departments.map((d) => `<option value="${d}">${d}</option>`).join("");
  }

  /* =========================================================
     FIRESTORE: ATTENDANCE (realtime)
  ========================================================= */
  function loadAttendance() {
    if (unsubscribeAttendance) unsubscribeAttendance();

    unsubscribeAttendance = onSnapshot(
      collection(db, "attendance"),
      (snap) => {
        allAttendance = snap.docs.map((d) => ({ ...d.data(), docId: d.id }));
        renderStats();
        renderAttendance();

        hideSkeleton("attSkeleton", "attContent");
      },
      (error) => {
        console.error("Failed to load attendance:", error);
        showToast("error", "Could not load attendance records.");
      },
    );
  }

  /* =========================================================
     RENDER: STATS
  ========================================================= */
  function renderStats() {
    const today = todayStr();
    const todayRecords = allAttendance.filter((a) => a.date === today);

    const present = todayRecords.filter((a) => a.status === "Present").length;
    const absent = todayRecords.filter((a) => a.status === "Absent").length;
    const late = todayRecords.filter((a) => a.status === "Late").length;
    const onLeave = todayRecords.filter((a) => a.status === "On Leave").length;

    const workingMinutesList = todayRecords
      .filter((a) => a.status === "Present" || a.status === "Late")
      .map((a) => timeToMinutes(a.workingHours))
      .filter((m) => m !== null);

    const avgMinutes = workingMinutesList.length
      ? Math.round(
          workingMinutesList.reduce((sum, m) => sum + m, 0) /
            workingMinutesList.length,
        )
      : 0;

    const totalEmployees = allEmployees.length || 1;

    const stats = [
      {
        label: "Present Today",
        value: present,
        icon: "ri-user-follow-line",
        color: "green",
        changeLabel: `${Math.round((present / totalEmployees) * 100)}% of employees`,
      },
      {
        label: "Absent Today",
        value: absent,
        icon: "ri-user-unfollow-line",
        color: "orange",
        changeLabel: `${Math.round((absent / totalEmployees) * 100)}% of employees`,
      },
      {
        label: "Late Employees",
        value: late,
        icon: "ri-time-line",
        color: "purple",
        changeLabel: "checked in after 09:30",
      },
      {
        label: "On Leave",
        value: onLeave,
        icon: "ri-calendar-close-line",
        color: "blue",
        changeLabel: "approved leave today",
      },
      {
        label: "Avg. Working Hours",
        value: minutesToTime(avgMinutes),
        icon: "ri-hourglass-line",
        color: "indigo",
        changeLabel: "based on present staff",
      },
    ];

    $("#attStatsGrid").innerHTML = stats
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
     RENDER: ATTENDANCE TABLE
  ========================================================= */
  function getFilteredAttendance() {
    let result = [...allAttendance];

    if (filters.department !== "all") {
      result = result.filter((a) => a.department === filters.department);
    }

    if (filters.status !== "all") {
      result = result.filter((a) => a.status === filters.status);
    }

    if (filters.date) {
      result = result.filter((a) => a.date === filters.date);
    }

    if (filters.month) {
      result = result.filter((a) => (a.date || "").startsWith(filters.month));
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((a) =>
        [a.employeeName, a.employeeId, a.department]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      const cmp = (a.date || "").localeCompare(b.date || "");
      return filters.sort === "newest" ? -cmp : cmp;
    });

    return result;
  }

  function renderAttendance() {
    const filtered = getFilteredAttendance();
    const tbody = $("#attTableBody");
    const emptyState = $("#attEmptyState");
    const tableCard = $(".att-table-card");
    const tableScroll = $(".table-scroll", tableCard);

    if (!allAttendance.length) {
      tableScroll.style.display = "none";
      emptyState.classList.remove("att-hidden");
      return;
    }

    tableScroll.style.display = "";
    emptyState.classList.add("att-hidden");

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No records match your search/filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((a) => {
        const avatar =
          a.employeePhoto ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (a.employeeName || "E").slice(0, 2),
          )}&background=6c5ce7&color=fff`;

        return `
        <tr data-doc-id="${a.docId}">
          <td>
            <div class="employee-cell">
              <img src="${avatar}" alt="${a.employeeName}" />
              <div>
                <p class="employee-cell__name">${a.employeeName || "—"}</p>
                <p class="employee-cell__id">${a.designation || ""}</p>
              </div>
            </div>
          </td>
          <td>${a.employeeId || "—"}</td>
          <td>${a.department || "—"}</td>
          <td>${a.checkIn || "—"}</td>
          <td>${a.checkOut || "—"}</td>
          <td>${a.workingHours || "—"}</td>
          <td>${a.breakDuration || "—"}</td>
          <td>${a.overtime || "—"}</td>
          <td><span class="status-badge ${statusClass(a.status)}">${a.status || "—"}</span></td>
          <td>
            <div class="row-actions">
              <a class="row-actions__btn" href="./attendance-details.html?id=${a.docId}" title="View">
                <i class="ri-eye-line"></i>
              </a>
              <button class="row-actions__btn edit" data-action="edit" data-doc-id="${a.docId}" title="Edit">
                <i class="ri-pencil-line"></i>
              </button>
              <button class="row-actions__btn delete" data-action="delete" data-doc-id="${a.docId}" title="Delete">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function searchAttendance(value) {
    filters.search = value;
    renderAttendance();
  }

  function filterAttendance() {
    filters.department = $("#attDepartmentFilter").value;
    filters.status = $("#attStatusFilter").value;
    filters.date = $("#attDateFilter").value;
    filters.month = $("#attMonthFilter").value;
    filters.sort = $("#attSortSelect").value;
    renderAttendance();
  }

  function resetFilters() {
    filters.search = "";
    filters.department = "all";
    filters.status = "all";
    filters.date = "";
    filters.month = "";
    filters.sort = "newest";

    $("#attSearchInput").value = "";
    $("#attDepartmentFilter").value = "all";
    $("#attStatusFilter").value = "all";
    $("#attDateFilter").value = "";
    $("#attMonthFilter").value = "";
    $("#attSortSelect").value = "newest";

    renderAttendance();
  }

  /* =========================================================
     MODAL: MARK / EDIT ATTENDANCE
  ========================================================= */
  function updateCalcPreview() {
    const { workingHours, overtime } = computeWorkingHours(
      $("#attCheckIn").value,
      $("#attCheckOut").value,
      $("#attBreak").value,
    );
    $("#attWorkingPreview").textContent = workingHours;
    $("#attOvertimePreview").textContent = overtime;

    const statusSelect = $("#attStatus");
    if (
      isLateCheckIn($("#attCheckIn").value) &&
      statusSelect.value === "Present"
    ) {
      statusSelect.value = "Late";
    }
  }

  function openAttendanceModal(record) {
    editingDocId = record ? record.docId : null;

    $("#attDocId").value = editingDocId || "";
    $("#attEmployeeSelect").value = record?.employeeId || "";
    $("#attDate").value = record?.date || todayStr();
    $("#attStatus").value = record?.status || "";
    $("#attCheckIn").value = record?.checkIn || "";
    $("#attCheckOut").value = record?.checkOut || "";
    $("#attBreak").value = record?.breakDuration || "00:00";
    $("#attNotes").value = record?.notes || "";

    $("#attModalTitle").textContent = record
      ? "Edit Attendance"
      : "Mark Attendance";
    $("#attSaveBtnText").textContent = record
      ? "Update Attendance"
      : "Save Attendance";

    updateCalcPreview();
    $("#attModalOverlay").classList.add("show");
  }

  function closeAttendanceModal() {
    $("#attModalOverlay").classList.remove("show");
    $("#attForm").reset();
    editingDocId = null;
  }

  async function saveAttendance(e) {
    e.preventDefault();

    const employeeId = $("#attEmployeeSelect").value;
    const employee = allEmployees.find((emp) => emp.employeeId === employeeId);
    const date = $("#attDate").value;
    const status = $("#attStatus").value;
    const checkIn = $("#attCheckIn").value;
    const checkOut = $("#attCheckOut").value;
    const breakDuration = $("#attBreak").value || "00:00";
    const notes = $("#attNotes").value.trim();

    if (!employeeId || !date || !checkIn || !status) {
      showToast("error", "Employee, date, check-in and status are required.");
      return;
    }

    const { workingHours, overtime } = computeWorkingHours(
      checkIn,
      checkOut,
      breakDuration,
    );

    const payload = {
      employeeId,
      employeeName: employee?.fullName || "",
      employeePhoto: employee?.profileImage || "",
      designation: employee?.designation || "",
      department: employee?.department || "",
      date,
      checkIn,
      checkOut,
      breakDuration,
      workingHours,
      overtime,
      status,
      notes,
      updatedAt: serverTimestamp(),
    };

    const saveBtn = $("#attSaveBtn");
    saveBtn.disabled = true;

    try {
      if (editingDocId) {
        await updateAttendance(editingDocId, payload);
        showToast("success", "Attendance updated successfully.");
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "attendance"), payload);
        showToast("success", "Attendance marked successfully.");
      }
      closeAttendanceModal();
    } catch (error) {
      console.error("Failed to save attendance:", error);
      showToast("error", "Could not save attendance. Please try again.");
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function updateAttendance(docId, payload) {
    await updateDoc(doc(db, "attendance", docId), payload);
  }

  /* =========================================================
     DELETE ATTENDANCE
  ========================================================= */
  function openDeleteModal(docId, name) {
    pendingDeleteId = docId;
    $("#attDeleteName").textContent = name || "this employee";
    $("#attDeleteModalOverlay").classList.add("show");
  }

  function closeDeleteModal() {
    $("#attDeleteModalOverlay").classList.remove("show");
    pendingDeleteId = null;
  }

  async function deleteAttendance() {
    if (!pendingDeleteId) return;
    const confirmBtn = $("#attDeleteConfirmBtn");
    confirmBtn.disabled = true;

    try {
      await deleteDoc(doc(db, "attendance", pendingDeleteId));
      showToast("success", "Attendance record deleted.");
      closeDeleteModal();
    } catch (error) {
      console.error("Failed to delete attendance:", error);
      showToast("error", "Could not delete attendance record.");
    } finally {
      confirmBtn.disabled = false;
    }
  }

  /* =========================================================
     EXPORT
  ========================================================= */
  function exportCsv() {
    const rows = getFilteredAttendance();
    if (!rows.length) {
      showToast("error", "No records to export.");
      return;
    }

    const headers = [
      "Employee Name",
      "Employee ID",
      "Department",
      "Date",
      "Check In",
      "Check Out",
      "Working Hours",
      "Break",
      "Overtime",
      "Status",
      "Notes",
    ];

    const csvRows = rows.map((a) => [
      a.employeeName || "",
      a.employeeId || "",
      a.department || "",
      a.date || "",
      a.checkIn || "",
      a.checkOut || "",
      a.workingHours || "",
      a.breakDuration || "",
      a.overtime || "",
      a.status || "",
      a.notes || "",
    ]);

    const csvContent = [headers, ...csvRows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "attendance-export.csv";
    link.click();
    URL.revokeObjectURL(url);

    showToast("success", "Attendance exported as CSV.");
  }

  function exportComingSoon(format) {
    showToast("error", `${format} export is coming soon.`);
  }

  /* =========================================================
     REFRESH
  ========================================================= */
  async function refreshAttendance() {
    await loadEmployeesForSelect();
  }

  /* =========================================================
     EVENT BINDINGS
  ========================================================= */
  function bindEvents() {
    $("#openMarkAttendanceBtn").addEventListener("click", () =>
      openAttendanceModal(null),
    );
    $("#attEmptyMarkBtn").addEventListener("click", () =>
      openAttendanceModal(null),
    );
    $("#attModalCloseBtn").addEventListener("click", closeAttendanceModal);
    $("#attCancelBtn").addEventListener("click", closeAttendanceModal);
    $("#attModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "attModalOverlay") closeAttendanceModal();
    });
    $("#attForm").addEventListener("submit", saveAttendance);

    ["attCheckIn", "attCheckOut", "attBreak"].forEach((id) => {
      $(`#${id}`).addEventListener("input", updateCalcPreview);
    });

    $("#attDeleteCloseBtn").addEventListener("click", closeDeleteModal);
    $("#attDeleteCancelBtn").addEventListener("click", closeDeleteModal);
    $("#attDeleteModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "attDeleteModalOverlay") closeDeleteModal();
    });
    $("#attDeleteConfirmBtn").addEventListener("click", deleteAttendance);

    $("#attTableBody").addEventListener("click", (e) => {
      const btn = e.target.closest(".row-actions__btn");
      if (!btn) return;

      const docId = btn.dataset.docId;
      const record = allAttendance.find((a) => a.docId === docId);
      if (!record) return;

      if (btn.dataset.action === "edit") {
        openAttendanceModal(record);
      } else if (btn.dataset.action === "delete") {
        openDeleteModal(docId, record.employeeName);
      }
    });

    $("#attSearchInput").addEventListener("input", (e) =>
      searchAttendance(e.target.value),
    );
    $("#attDepartmentFilter").addEventListener("change", filterAttendance);
    $("#attStatusFilter").addEventListener("change", filterAttendance);
    $("#attDateFilter").addEventListener("change", filterAttendance);
    $("#attMonthFilter").addEventListener("change", filterAttendance);
    $("#attSortSelect").addEventListener("change", filterAttendance);
    $("#attResetFiltersBtn").addEventListener("click", resetFilters);

    $("#attExportCsvBtn").addEventListener("click", exportCsv);
    $("#attExportExcelBtn").addEventListener("click", () =>
      exportComingSoon("Excel"),
    );
    $("#attExportPdfBtn").addEventListener("click", () =>
      exportComingSoon("PDF"),
    );
    $("#attPrintBtn").addEventListener("click", () => window.print());
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    showSkeleton("attSkeleton", "attContent");

    await loadEmployeesForSelect();
    loadAttendance();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();