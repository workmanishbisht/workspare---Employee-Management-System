import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  $,
  showToast,
  capitalize,
  renderNav,
  guardAndLoadUser,
  setupUserMenu,
  setupSidebarToggle,
} from "../js/layout.js";

(function () {
  "use strict";

  /* =========================================================
     STATE
  ========================================================= */
  let allDepartments = [];
  let searchTerm = "";
  let currentPage = 1;
  let pageSize = 10;
  let editingId = null;
  let pendingDeleteId = null;

  /* =========================================================
     FIRESTORE: LOAD
  ========================================================= */
  async function loadDepartments() {
    try {
      const snap = await getDocs(
        query(collection(db, "departments"), orderBy("createdAt", "desc")),
      );
      allDepartments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return allDepartments;
    } catch (error) {
      console.error("Failed to load departments:", error);
      showToast("error", "Could not load departments.");
      allDepartments = [];
      return allDepartments;
    }
  }

  /* =========================================================
     FIRESTORE: CREATE / UPDATE / DELETE
  ========================================================= */
  function isDepartmentCodeTaken(code, excludeId = null) {
    const normalized = (code || "").trim().toLowerCase();
    return allDepartments.some(
      (d) =>
        d.id !== excludeId &&
        (d.departmentCode || "").trim().toLowerCase() === normalized,
    );
  }

  async function saveDepartment(payload) {
    if (isDepartmentCodeTaken(payload.departmentCode)) {
      showToast(
        "error",
        "Department Code already exists. Please use a unique code.",
      );
      return false;
    }

    try {
      await addDoc(collection(db, "departments"), {
        ...payload,
        employeeCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Failed to create department:", error);
      showToast("error", "Could not create department.");
      return false;
    }
  }

  async function updateDepartment(id, payload) {
    if (isDepartmentCodeTaken(payload.departmentCode, id)) {
      showToast(
        "error",
        "Department Code already exists. Please use a unique code.",
      );
      return false;
    }

    try {
      await updateDoc(doc(db, "departments", id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Failed to update department:", error);
      showToast("error", "Could not update department.");
      return false;
    }
  }

  async function deleteDepartment(id) {
    try {
      await deleteDoc(doc(db, "departments", id));
      return true;
    } catch (error) {
      console.error("Failed to delete department:", error);
      showToast("error", "Could not delete department.");
      return false;
    }
  }

  /* =========================================================
     STATS
  ========================================================= */
  function renderStats(departments) {
    const total = departments.length;
    const totalEmployees = departments.reduce(
      (sum, d) => sum + (Number(d.employeeCount) || 0),
      0,
    );
    const active = departments.filter(
      (d) => (d.status || "").toLowerCase() === "active",
    ).length;
    const heads = new Set(
      departments.map((d) => (d.departmentHead || "").trim()).filter(Boolean),
    ).size;

    $("#statTotalDepartments").textContent = total;
    $("#statTotalEmployees").textContent = totalEmployees;
    $("#statActiveDepartments").textContent = active;
    $("#statDepartmentHeads").textContent = heads;
  }

  /* =========================================================
     HELPERS
  ========================================================= */
  function getInitials(name) {
    if (!name) return "?";
    return name
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("");
  }

  function statusPillClass(status) {
    const s = (status || "").toLowerCase();
    if (s === "active") return "status-pill--active";
    if (s === "inactive") return "status-pill--inactive";
    return "status-pill--warning";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getTimestampMillis(value) {
    if (!value) return 0;
    const date = value.toDate ? value.toDate() : new Date(value);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  /* =========================================================
     SEARCH
  ========================================================= */
  function searchDepartments(term, departments) {
    const t = (term || "").trim().toLowerCase();
    if (!t) return departments;

    return departments.filter(
      (d) =>
        (d.departmentName || "").toLowerCase().includes(t) ||
        (d.departmentHead || "").toLowerCase().includes(t) ||
        (d.location || "").toLowerCase().includes(t),
    );
  }

  /* =========================================================
     FILTER
  ========================================================= */
  function filterDepartments(departments) {
    const statusVal = $("#statusFilter")?.value || "";
    const typeVal = $("#typeFilter")?.value || "";

    return departments.filter((d) => {
      const matchesStatus = !statusVal || d.status === statusVal;
      const matchesType = !typeVal || d.departmentCode === typeVal;
      return matchesStatus && matchesType;
    });
  }

  /* =========================================================
     SORT
  ========================================================= */
  function sortDepartments(departments) {
    const sortVal = $("#sortFilter")?.value || "newest";

    return departments.slice().sort((a, b) => {
      if (sortVal === "name-asc") {
        return (a.departmentName || "").localeCompare(b.departmentName || "");
      }
      if (sortVal === "name-desc") {
        return (b.departmentName || "").localeCompare(a.departmentName || "");
      }
      if (sortVal === "employees-desc") {
        return (Number(b.employeeCount) || 0) - (Number(a.employeeCount) || 0);
      }
      const aTime = getTimestampMillis(a.createdAt);
      const bTime = getTimestampMillis(b.createdAt);
      return sortVal === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }

  /* =========================================================
     PIPELINE: SEARCH → FILTER → SORT
  ========================================================= */
  function getProcessedDepartments() {
    let result = searchDepartments(searchTerm, allDepartments);
    result = filterDepartments(result);
    result = sortDepartments(result);
    return result;
  }

  function populateTypeFilter() {
    const typeFilter = $("#typeFilter");
    if (!typeFilter) return;
    const currentVal = typeFilter.value;
    const codes = Array.from(
      new Set(allDepartments.map((d) => d.departmentCode).filter(Boolean)),
    );
    typeFilter.innerHTML =
      `<option value="">All Types</option>` +
      codes.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (codes.includes(currentVal)) typeFilter.value = currentVal;
  }

  function resetFilters() {
    searchTerm = "";
    if ($("#departmentSearchInput")) $("#departmentSearchInput").value = "";
    if ($("#departmentTableSearch")) $("#departmentTableSearch").value = "";
    if ($("#statusFilter")) $("#statusFilter").value = "";
    if ($("#typeFilter")) $("#typeFilter").value = "";
    if ($("#sortFilter")) $("#sortFilter").value = "newest";
    currentPage = 1;
    renderDepartments(getProcessedDepartments());
  }

  /* =========================================================
     RENDER: TABLE ROW
  ========================================================= */
  function renderRow(dept) {
    const color = dept.color || "#6d5bf6";
    const icon = dept.icon || "ri-building-4-line";
    const initials = getInitials(dept.departmentHead);

    return `
      <tr data-id="${dept.id}">
        <td>
          <div class="dept-cell">
            <div class="dept-cell__icon" style="background:${color}">
              <i class="${icon}"></i>
            </div>
            <div>
              <p class="dept-cell__name">${dept.departmentName || "Untitled"}</p>
              <p class="dept-cell__desc">${dept.description || "No description"}</p>
            </div>
          </div>
        </td>
        <td>
          <div class="dept-head-cell">
            <span class="dept-head-cell__avatar">${initials}</span>
            <div>
              <p class="dept-head-cell__name">${dept.departmentHead || "Unassigned"}</p>
              <p class="dept-head-cell__title">Department Head</p>
            </div>
          </div>
        </td>
        <td><span class="employee-count-badge">${dept.employeeCount || 0}</span></td>
        <td>
          <span class="dept-location">
            <i class="ri-map-pin-line"></i>
            ${dept.location || "Not set"}
          </span>
        </td>
        <td>
          <span class="status-pill ${statusPillClass(dept.status)}">
            ${capitalize(dept.status || "Active")}
          </span>
        </td>
        <td>${formatDate(dept.createdAt)}</td>
        <td>
          <div class="dept-actions">
            <button class="dept-action-btn" data-action="view" data-id="${dept.id}" aria-label="View">
              <i class="ri-eye-line"></i>
            </button>
            <button class="dept-action-btn" data-action="edit" data-id="${dept.id}" aria-label="Edit">
              <i class="ri-pencil-line"></i>
            </button>
            <button class="dept-action-btn" data-action="menu" data-id="${dept.id}" aria-label="More actions">
              <i class="ri-more-2-fill"></i>
            </button>
            <div class="dept-actions-menu" id="menu-${dept.id}">
              <button data-action="view" data-id="${dept.id}">
                <i class="ri-eye-line"></i> View Details
              </button>
              <button data-action="edit" data-id="${dept.id}">
                <i class="ri-pencil-line"></i> Edit
              </button>
              <button class="dept-actions-menu__danger" data-action="delete" data-id="${dept.id}">
                <i class="ri-delete-bin-6-line"></i> Delete
              </button>
            </div>
          </div>
        </td>
      </tr>`;
  }

  /* =========================================================
     RENDER: TABLE + PAGINATION + EMPTY STATE
  ========================================================= */
  function renderDepartments(departments) {
    const tbody = $("#departmentsTableBody");
    const emptyState = $("#departmentsEmptyState");
    const tableWrap = document.querySelector(".table-wrap");
    if (!tbody) return;

    const total = departments.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageItems = departments.slice(start, start + pageSize);

    if (allDepartments.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
      if (tableWrap) tableWrap.style.display = "none";
      renderPagination(0, 1, 0, 0);
      return;
    }

    if (emptyState) emptyState.hidden = true;
    if (tableWrap) tableWrap.style.display = "";

    if (total === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="dept-no-results">
            No departments match your search or filters.
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
      attachRowListeners();
    }

    renderPagination(total, totalPages, start, pageItems.length);
  }

  function renderPagination(total, totalPages, start, shown) {
    const info = $("#paginationInfo");
    const controls = $("#paginationControls");
    if (!info || !controls) return;

    info.textContent =
      total === 0
        ? "Showing 0 of 0 departments"
        : `Showing ${start + 1} to ${start + shown} of ${total} departments`;

    let html = `<button data-page="prev" ${currentPage === 1 ? "disabled" : ""}><i class="ri-arrow-left-s-line"></i></button>`;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
        html += `<button data-page="${p}" class="${p === currentPage ? "active" : ""}">${p}</button>`;
      } else if (p === 2 || p === totalPages - 1) {
        html += `<span>...</span>`;
      }
    }

    html += `<button data-page="next" ${currentPage === totalPages ? "disabled" : ""}><i class="ri-arrow-right-s-line"></i></button>`;
    controls.innerHTML = html;

    controls.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        if (val === "prev") currentPage = Math.max(1, currentPage - 1);
        else if (val === "next")
          currentPage = Math.min(totalPages, currentPage + 1);
        else currentPage = Number(val);
        renderDepartments(getProcessedDepartments());
      });
    });
  }

  /* =========================================================
     LOADING STATES (skeleton cards + skeleton table)
  ========================================================= */
  function setLoading(isLoading) {
    const statsSkeleton = $("#deptStatsSkeleton");
    const statsGrid = $("#deptStatsGrid");
    const tableSkeleton = $("#departmentsSkeleton");
    const tableWrap = document.querySelector(".table-wrap");
    const emptyState = $("#departmentsEmptyState");

    if (statsSkeleton) statsSkeleton.classList.toggle("active", isLoading);
    if (statsGrid) statsGrid.style.display = isLoading ? "none" : "";

    if (tableSkeleton) tableSkeleton.classList.toggle("active", isLoading);
    if (isLoading) {
      if (tableWrap) tableWrap.style.display = "none";
      if (emptyState) emptyState.hidden = true;
    }
  }

  /* =========================================================
     ROW ACTIONS (view / edit / delete / three-dot menu)
  ========================================================= */
  function closeAllMenus() {
    document
      .querySelectorAll(".dept-actions-menu.open")
      .forEach((m) => m.classList.remove("open"));
  }

  function attachRowListeners() {
    document.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = el.dataset.action;
        const id = el.dataset.id;
        const dept = allDepartments.find((d) => d.id === id);
        if (!dept) return;

        if (action === "menu") {
          const menu = $(`#menu-${id}`);
          const isOpen = menu?.classList.contains("open");
          closeAllMenus();
          if (menu && !isOpen) menu.classList.add("open");
          return;
        }

        closeAllMenus();

        if (action === "view") {
          window.location.href = `./department-details.html?id=${encodeURIComponent(id)}`;
        } else if (action === "edit") {
          openAddDepartmentModal(dept);
        } else if (action === "delete") {
          openDeleteModal(dept);
        }
      });
    });

    document.addEventListener("click", closeAllMenus, { once: true });
  }

  /* =========================================================
     ADD / EDIT DEPARTMENT MODAL
  ========================================================= */
  function openAddDepartmentModal(dept = null) {
    const overlay = $("#departmentModalOverlay");
    const form = $("#departmentForm");
    const title = $("#departmentModalTitle");
    const saveBtn = $("#saveDepartmentBtn");
    if (!overlay || !form) return;

    form.reset();
    editingId = dept ? dept.id : null;

    if (dept) {
      Object.keys(dept).forEach((key) => {
        const field = form.elements.namedItem(key);
        if (field) field.value = dept[key] ?? "";
      });
      if (title)
        title.innerHTML = `<i class="ri-building-4-line"></i> Edit Department`;
      if (saveBtn)
        saveBtn.innerHTML = `<i class="ri-save-3-line"></i> Save Changes`;
    } else {
      if (title)
        title.innerHTML = `<i class="ri-building-4-line"></i> Add Department`;
      if (saveBtn)
        saveBtn.innerHTML = `<i class="ri-save-3-line"></i> Create Department`;
    }

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDepartmentModal() {
    const overlay = $("#departmentModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    editingId = null;
  }

  function validateDepartmentForm(payload) {
    if (!payload.departmentName) {
      showToast("error", "Department Name is required.");
      return false;
    }
    if (!payload.departmentCode) {
      showToast("error", "Department Code is required.");
      return false;
    }
    if (!payload.departmentHead) {
      showToast("error", "Department Head is required.");
      return false;
    }
    return true;
  }

  async function handleDepartmentSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const saveBtn = $("#saveDepartmentBtn");
    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => {
      if (key === "id") return;
      payload[key] = typeof value === "string" ? value.trim() : value;
    });

    if (!validateDepartmentForm(payload)) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="ri-loader-4-line"></i> Saving…`;
    }

    const ok = editingId
      ? await updateDepartment(editingId, payload)
      : await saveDepartment(payload);

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = editingId
        ? `<i class="ri-save-3-line"></i> Save Changes`
        : `<i class="ri-save-3-line"></i> Create Department`;
    }

    if (!ok) return;

    const wasEditing = Boolean(editingId);
    closeDepartmentModal();
    showToast(
      "success",
      wasEditing
        ? "Department updated successfully."
        : "Department created successfully.",
    );
    await refreshDepartmentTable();
  }

  function setupDepartmentModal() {
    const addBtn = $("#addDepartmentBtn");
    const emptyAddBtn = $("#emptyStateAddBtn");
    const closeBtn = $("#closeDepartmentModal");
    const cancelBtn = $("#cancelDepartmentBtn");
    const overlay = $("#departmentModalOverlay");
    const form = $("#departmentForm");

    addBtn?.addEventListener("click", () => openAddDepartmentModal());
    emptyAddBtn?.addEventListener("click", () => openAddDepartmentModal());
    closeBtn?.addEventListener("click", closeDepartmentModal);
    cancelBtn?.addEventListener("click", closeDepartmentModal);
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeDepartmentModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay?.classList.contains("open")) {
        closeDepartmentModal();
      }
    });
    form?.addEventListener("submit", handleDepartmentSubmit);
  }

  /* =========================================================
     DELETE DEPARTMENT CONFIRMATION MODAL
  ========================================================= */
  function openDeleteModal(dept) {
    const overlay = $("#deleteDepartmentModalOverlay");
    const nameEl = $("#deleteDepartmentName");
    if (!overlay) return;
    pendingDeleteId = dept.id;
    if (nameEl) nameEl.textContent = dept.departmentName || "this department";
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDeleteModal() {
    const overlay = $("#deleteDepartmentModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    pendingDeleteId = null;
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const confirmBtn = $("#confirmDeleteDepartmentBtn");

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<i class="ri-loader-4-line"></i> Deleting…`;
    }

    const ok = await deleteDepartment(id);

    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `Yes, Delete`;
    }

    closeDeleteModal();

    if (ok) {
      showToast("success", "Department deleted successfully.");
      await refreshDepartmentTable();
    }
  }

  function setupDeleteModal() {
    const overlay = $("#deleteDepartmentModalOverlay");
    const cancelBtn = $("#cancelDeleteDepartmentBtn");
    const confirmBtn = $("#confirmDeleteDepartmentBtn");

    cancelBtn?.addEventListener("click", closeDeleteModal);
    confirmBtn?.addEventListener("click", handleConfirmDelete);

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeDeleteModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay?.classList.contains("open")) {
        closeDeleteModal();
      }
    });
  }

  /* =========================================================
     SEARCH / FILTER / SORT LISTENERS
  ========================================================= */
  function handleSearchInput(e) {
    searchTerm = e.target.value;
    currentPage = 1;
    renderDepartments(getProcessedDepartments());
  }

  function setupFilters() {
    $("#departmentSearchInput")?.addEventListener("input", handleSearchInput);
    $("#departmentTableSearch")?.addEventListener("input", handleSearchInput);

    $("#statusFilter")?.addEventListener("change", () => {
      currentPage = 1;
      renderDepartments(getProcessedDepartments());
    });
    $("#typeFilter")?.addEventListener("change", () => {
      currentPage = 1;
      renderDepartments(getProcessedDepartments());
    });
    $("#sortFilter")?.addEventListener("change", () => {
      currentPage = 1;
      renderDepartments(getProcessedDepartments());
    });

    $("#resetFiltersBtn")?.addEventListener("click", resetFilters);

    $("#pageSizeSelect")?.addEventListener("change", (e) => {
      pageSize = Number(e.target.value);
      currentPage = 1;
      renderDepartments(getProcessedDepartments());
    });
  }

  /* =========================================================
     REFRESH TABLE (reload from Firestore + re-render)
  ========================================================= */
  async function refreshDepartmentTable() {
    setLoading(true);
    await loadDepartments();
    populateTypeFilter();
    renderStats(allDepartments);
    renderDepartments(getProcessedDepartments());
    setLoading(false);
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();
    setupDepartmentModal();
    setupDeleteModal();
    setupFilters();

    await refreshDepartmentTable();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
