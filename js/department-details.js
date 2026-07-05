/* ==========================================================
   IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
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
} from "./layout.js";

(function () {
  "use strict";

  /* =========================================================
     STATE
  ========================================================= */
  let departmentId = null;
  let departmentData = null;
  let allEmployees = [];
  let unsubscribeEmployees = null;

  const filters = {
    search: "",
    status: "all",
    sort: "newest",
  };

  /* =========================================================
     HELPERS
  ========================================================= */
  function formatDate(value) {
    if (!value) return "—";
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getDepartmentIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  /* =========================================================
     LOAD DEPARTMENT
  ========================================================= */
  async function loadDepartment() {
    departmentId = getDepartmentIdFromUrl();

    if (!departmentId) {
      window.location.href = "./departments.html";
      return false;
    }

    try {
      const snap = await getDoc(doc(db, "departments", departmentId));
      if (!snap.exists()) {
        showToast("error", "Department not found.");
        setTimeout(() => (window.location.href = "./departments.html"), 800);
        return false;
      }

      departmentData = { id: snap.id, ...snap.data() };
      return true;
    } catch (error) {
      console.error("Failed to load department:", error);
      showToast("error", "Could not load department.");
      setTimeout(() => (window.location.href = "./departments.html"), 800);
      return false;
    }
  }

  /* =========================================================
     LOAD EMPLOYEES (realtime)
  ========================================================= */
  function loadEmployees() {
    if (unsubscribeEmployees) unsubscribeEmployees();

    const employeesRef = collection(db, "employees");
    const q = query(
      employeesRef,
      where("department", "==", departmentData.departmentName),
    );

    unsubscribeEmployees = onSnapshot(
      q,
      (snap) => {
        allEmployees = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            docId: d.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          };
        });

        renderStatistics();
        renderEmployees();
      },
      (error) => {
        console.error("Failed to load employees:", error);
        showToast("error", "Could not load employees for this department.");
      },
    );
  }

  /* =========================================================
     RENDER: DEPARTMENT (hero + info panel)
  ========================================================= */
  function renderDepartment() {
    const d = departmentData;

    $("#ddName").textContent = d.departmentName || "Untitled Department";
    $("#ddDescription").textContent = d.description || "No description added.";
    $("#ddCodeChip").textContent = `Code: ${d.departmentCode || "—"}`;
    $("#ddCreatedChip").textContent = `Established: ${formatDate(d.createdAt)}`;

    const statusBadge = $("#ddStatusBadge");
    statusBadge.textContent = d.status === "inactive" ? "Inactive" : "Active";
    statusBadge.className = `status-badge ${d.status === "inactive" ? "inactive" : "active"}`;

    $("#ddHead").textContent = d.departmentHead || "—";
    $("#ddEmail").textContent = d.email || "—";
    $("#ddPhone").textContent = d.phone || "—";
    $("#ddLocation").textContent = d.location || "—";

    $("#infoName").textContent = d.departmentName || "—";
    $("#infoCode").textContent = d.departmentCode || "—";
    $("#infoHead").textContent = d.departmentHead || "—";
    $("#infoEmail").textContent = d.email || "—";
    $("#infoPhone").textContent = d.phone || "—";
    $("#infoLocation").textContent = d.location || "—";
    $("#infoStatus").textContent =
      d.status === "inactive" ? "Inactive" : "Active";
    $("#infoCreated").textContent = formatDate(d.createdAt);
    $("#infoUpdated").textContent = formatDate(d.updatedAt);

    $("#deleteDeptName").textContent = d.departmentName || "this department";

    renderProjects();
    renderActivity();
  }

  /* =========================================================
     RENDER: PROJECTS
     (reads department.projects array if present; otherwise
     shows an empty state — no dedicated collection exists yet)
  ========================================================= */
  function renderProjects() {
    const wrap = $("#ddProjectsList");
    const projects = departmentData.projects || [];

    if (!projects.length) {
      wrap.innerHTML = `
        <p class="empty-state">
          No projects linked to this department yet.
        </p>`;
      return;
    }

    wrap.innerHTML = `
      <div class="dd-projects">
        ${projects
          .map(
            (p) => `
          <div class="dd-project-row">
            <div>
              <p class="dd-project-row__name">${p.name || "Untitled Project"}</p>
              <p class="dd-project-row__manager">${p.manager || "—"}</p>
            </div>
            <div class="dd-project-row__meta">
              <span class="dd-project-row__deadline">${p.deadline || "—"}</span>
              <span class="status-badge ${p.status === "Completed" ? "active" : p.status === "Pending" ? "leave" : "inactive"}">
                ${p.status || "—"}
              </span>
            </div>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  /* =========================================================
     RENDER: RECENT ACTIVITY
     (reads department.activityLog array if present; otherwise
     builds a minimal timeline from known data)
  ========================================================= */
  function renderActivity() {
    const list = $("#ddActivityList");
    const log = departmentData.activityLog || [];

    if (!log.length) {
      list.innerHTML = `
        <li class="dd-timeline__item">
          <span class="dd-timeline__dot success"></span>
          <div>
            <p>Department created</p>
            <span class="dd-timeline__time">${formatDate(departmentData.createdAt)}</span>
          </div>
        </li>
        ${
          departmentData.updatedAt
            ? `
        <li class="dd-timeline__item">
          <span class="dd-timeline__dot info"></span>
          <div>
            <p>Department information updated</p>
            <span class="dd-timeline__time">${formatDate(departmentData.updatedAt)}</span>
          </div>
        </li>`
            : ""
        }`;
      return;
    }

    list.innerHTML = log
      .map(
        (item) => `
      <li class="dd-timeline__item">
        <span class="dd-timeline__dot ${item.dot || "info"}"></span>
        <div>
          <p>${item.text}</p>
          <span class="dd-timeline__time">${item.time || ""}</span>
        </div>
      </li>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: STATISTICS
  ========================================================= */
  function renderStatistics() {
    const total = allEmployees.length;
    const active = allEmployees.filter((e) => e.status === "active").length;
    const projectsCount = (departmentData.projects || []).length;
    const attendance = departmentData.avgAttendance ?? null;

    const stats = [
      {
        label: "Total Employees",
        value: total,
        icon: "ri-team-line",
        color: "blue",
      },
      {
        label: "Active Employees",
        value: active,
        icon: "ri-user-follow-line",
        color: "green",
      },
      {
        label: "Projects",
        value: projectsCount,
        icon: "ri-briefcase-line",
        color: "purple",
      },
      {
        label: "Average Attendance",
        value: attendance !== null ? attendance + "%" : "—",
        icon: "ri-bar-chart-2-line",
        color: "orange",
      },
    ];

    $("#ddStatsGrid").innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card">
        <div class="stat-card__top">
          <div class="stat-card__icon ${s.color}"><i class="${s.icon}"></i></div>
        </div>
        <p class="stat-card__label">${s.label}</p>
        <p class="stat-card__value">${s.value}</p>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: EMPLOYEES TABLE
  ========================================================= */
  function renderEmployees() {
    const filtered = getFilteredEmployees();
    const tbody = $("#ddEmployeesBody");
    const emptyState = $("#ddEmployeesEmpty");
    const tableWrap = $(
      ".table-scroll",
      $("#ddEmployeesTable").closest(".dd-employees-card"),
    );

    if (!allEmployees.length) {
      tableWrap.style.display = "none";
      emptyState.classList.remove("dd-hidden");
      return;
    }

    tableWrap.style.display = "";
    emptyState.classList.add("dd-hidden");

    if (!filtered.length) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="empty-state">No employees match your search/filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((emp) => {
        const avatar =
          emp.profileImage ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (emp.fullName || "E").slice(0, 2),
          )}&background=6c5ce7&color=fff`;

        return `
        <tr>
          <td>
            <div class="employee-cell">
              <img src="${avatar}" alt="${emp.fullName}" />
              <p class="employee-cell__name">${emp.fullName || "—"}</p>
            </div>
          </td>
          <td>${emp.employeeId || "—"}</td>
          <td>${emp.designation || "—"}</td>
          <td>${emp.email || "—"}</td>
          <td>${emp.phone || "—"}</td>
          <td>${emp.joiningDate || "—"}</td>
          <td>
            <span class="status-badge ${emp.status || "active"}">
              ${emp.status === "inactive" ? "Inactive" : emp.status === "leave" ? "On Leave" : "Active"}
            </span>
          </td>
          <td>
            <div class="row-actions">
              <a class="row-actions__btn" href="./employee-details.html?id=${emp.docId}" title="View">
                <i class="ri-eye-line"></i>
              </a>
              <a class="row-actions__btn edit" href="./employees.html?edit=${emp.docId}" title="Edit">
                <i class="ri-pencil-line"></i>
              </a>
              <button class="row-actions__btn delete" data-doc-id="${emp.docId}" data-action="delete-employee" title="Delete">
                <i class="ri-delete-bin-line"></i>
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function getFilteredEmployees() {
    let result = [...allEmployees];

    if (filters.status !== "all") {
      result = result.filter((e) => (e.status || "active") === filters.status);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((e) =>
        [e.fullName, e.email, e.designation]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      if (filters.sort === "newest") {
        return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
      }
      if (filters.sort === "oldest") {
        return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
      }
      if (filters.sort === "joining") {
        return new Date(b.joiningDate || 0) - new Date(a.joiningDate || 0);
      }
      return 0;
    });

    return result;
  }

  function searchEmployees(value) {
    filters.search = value;
    renderEmployees();
  }

  function filterEmployees(status) {
    filters.status = status;
    renderEmployees();
  }

  function sortEmployees(sortBy) {
    filters.sort = sortBy;
    renderEmployees();
  }

  /* =========================================================
     EDIT DEPARTMENT MODAL
  ========================================================= */
  function openEditModal() {
    const d = departmentData;
    $("#deptName").value = d.departmentName || "";
    $("#deptCode").value = d.departmentCode || "";
    $("#deptHead").value = d.departmentHead || "";
    $("#deptEmail").value = d.email || "";
    $("#deptPhone").value = d.phone || "";
    $("#deptLocation").value = d.location || "";
    $("#deptStatus").value = d.status || "active";
    $("#deptDescription").value = d.description || "";

    $("#editDeptModalOverlay").classList.add("show");
  }

  function closeEditModal() {
    $("#editDeptModalOverlay").classList.remove("show");
  }

  async function saveDepartment(e) {
    e.preventDefault();

    const updated = {
      departmentName: $("#deptName").value.trim(),
      departmentCode: $("#deptCode").value.trim(),
      departmentHead: $("#deptHead").value.trim(),
      email: $("#deptEmail").value.trim(),
      phone: $("#deptPhone").value.trim(),
      location: $("#deptLocation").value.trim(),
      status: $("#deptStatus").value,
      description: $("#deptDescription").value.trim(),
      updatedAt: serverTimestamp(),
    };

    if (!updated.departmentName || !updated.departmentCode) {
      showToast("error", "Department name and code are required.");
      return;
    }

    const saveBtn = $("#saveDeptBtn");
    saveBtn.disabled = true;

    try {
      await updateDoc(doc(db, "departments", departmentId), updated);
      showToast("success", "Department updated successfully.");
      closeEditModal();
      await refreshDepartment();
    } catch (error) {
      console.error("Failed to update department:", error);
      showToast("error", "Could not update department.");
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* =========================================================
     DELETE DEPARTMENT
  ========================================================= */
  function openDeleteModal() {
    $("#deleteDeptModalOverlay").classList.add("show");
  }

  function closeDeleteModal() {
    $("#deleteDeptModalOverlay").classList.remove("show");
  }

  async function deleteDepartment() {
    const confirmBtn = $("#confirmDeleteDeptBtn");
    confirmBtn.disabled = true;

    try {
      await deleteDoc(doc(db, "departments", departmentId));
      showToast("success", "Department deleted successfully.");
      setTimeout(() => {
        window.location.href = "./departments.html";
      }, 700);
    } catch (error) {
      console.error("Failed to delete department:", error);
      showToast("error", "Could not delete department.");
      confirmBtn.disabled = false;
    }
  }

  /* =========================================================
     REFRESH
  ========================================================= */
  async function refreshDepartment() {
    const ok = await loadDepartment();
    if (!ok) return;
    renderDepartment();
    loadEmployees();
  }

  /* =========================================================
     EXPORT EMPLOYEES (CSV)
  ========================================================= */
  function exportEmployeesToCsv() {
    if (!allEmployees.length) {
      showToast("error", "No employees to export.");
      return;
    }

    const headers = [
      "Full Name",
      "Employee ID",
      "Designation",
      "Email",
      "Phone",
      "Joining Date",
      "Status",
    ];
    const rows = allEmployees.map((e) => [
      e.fullName || "",
      e.employeeId || "",
      e.designation || "",
      e.email || "",
      e.phone || "",
      e.joiningDate || "",
      e.status || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${departmentData.departmentName || "department"}-employees.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast("success", "Employees exported successfully.");
  }

  /* =========================================================
     EVENT BINDINGS
  ========================================================= */
  function bindEvents() {
    $("#editDepartmentBtn").addEventListener("click", openEditModal);
    $("#qaEditDept").addEventListener("click", openEditModal);
    $("#closeEditDeptModalBtn").addEventListener("click", closeEditModal);
    $("#cancelEditDeptBtn").addEventListener("click", closeEditModal);
    $("#editDeptModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "editDeptModalOverlay") closeEditModal();
    });
    $("#editDeptForm").addEventListener("submit", saveDepartment);

    $("#deleteDepartmentBtn").addEventListener("click", openDeleteModal);
    $("#qaDelete").addEventListener("click", openDeleteModal);
    $("#closeDeleteDeptModalBtn").addEventListener("click", closeDeleteModal);
    $("#cancelDeleteDeptBtn").addEventListener("click", closeDeleteModal);
    $("#deleteDeptModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "deleteDeptModalOverlay") closeDeleteModal();
    });
    $("#confirmDeleteDeptBtn").addEventListener("click", deleteDepartment);

    $("#ddEmployeeSearch").addEventListener("input", (e) =>
      searchEmployees(e.target.value),
    );
    $("#ddStatusFilter").addEventListener("change", (e) =>
      filterEmployees(e.target.value),
    );
    $("#ddSortSelect").addEventListener("change", (e) =>
      sortEmployees(e.target.value),
    );

    $("#qaExport").addEventListener("click", exportEmployeesToCsv);

    $("#ddEmployeesBody").addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="delete-employee"]');
      if (!btn) return;
      showToast("error", "Delete employee from the Employees page for now.");
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

    const ok = await loadDepartment();
    if (!ok) return;

    renderDepartment();
    loadEmployees();
    bindEvents();

    $("#skeletonWrap").classList.add("dd-hidden");
    $("#realContent").classList.remove("dd-hidden");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
