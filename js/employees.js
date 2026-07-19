/* ==========================================================
   IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
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
} from "../js/layout.js";

/* ==========================================================
   RBAC IMPORTS — consume existing permission system only
========================================================== */
import {
  MODULES,
  canView,
  canCreate,
  canEdit,
  canDelete,
} from "../js/permissions.js";

(function () {
  "use strict";

  /* =========================================================
     STATE
  ========================================================= */
  let allEmployees = [];
  let editingDocId = null;
  let pendingDeleteId = null;

  const STATUS_LABELS = {
    active: "Active",
    inactive: "Inactive",
    leave: "On Leave",
  };

  /* =========================================================
     RBAC STATE
     ----------------------------------------------------------
     Resolved once in init() from the existing permissions.js
     and reused everywhere below — no permission logic is
     duplicated here, only consumed.
  ========================================================= */
  let userCanCreate = false;
  let userCanEdit = false;
  let userCanDelete = false;

  function debugLog(action, allowed) {
    console.log(`[RBAC][Employees] action="${action}" allowed=${allowed}`);
  }

  function guardCreate() {
    const allowed = canCreate(MODULES.EMPLOYEES);
    debugLog("create", allowed);
    if (!allowed) {
      showToast("error", "Access Denied — you don't have permission.");
      return false;
    }
    return true;
  }

  function guardEditPerm() {
    const allowed = canEdit(MODULES.EMPLOYEES);
    debugLog("edit", allowed);
    if (!allowed) {
      showToast("error", "Access Denied — you don't have permission.");
      return false;
    }
    return true;
  }

  function guardDeletePerm() {
    const allowed = canDelete(MODULES.EMPLOYEES);
    debugLog("delete", allowed);
    if (!allowed) {
      showToast("error", "Access Denied — you don't have permission.");
      return false;
    }
    return true;
  }

  /* =========================================================
     FIRESTORE: EMPLOYEES CRUD
  ========================================================= */
  async function fetchEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          docId: d.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
      });
    } catch (error) {
      console.error("Failed to load employees:", error);
      showToast("error", "Could not load employees.");
      return [];
    }
  }

  async function saveEmployee(formData, docId) {
    const isEdit = Boolean(docId);

    // Defense in depth: never trust the UI alone — verify again
    // right before the Firestore write, regardless of how this
    // function was reached.
    if (isEdit ? !guardEditPerm() : !guardCreate()) {
      throw new Error("RBAC_DENIED");
    }

    const employeeId = docId || `EMP${Date.now().toString().slice(-6)}`;

    const payload = {
      employeeId,
      fullName: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      department: formData.department,
      designation: formData.designation,
      joiningDate: formData.joiningDate,
      salary: formData.salary,
      status: formData.status,
      profileImage: formData.profileImage,
    };

    if (!isEdit) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(doc(db, "employees", employeeId), payload, { merge: true });
    return employeeId;
  }

  async function removeEmployee(docId) {
    // Defense in depth: verify again right before the delete,
    // regardless of how this function was reached.
    if (!guardDeletePerm()) {
      throw new Error("RBAC_DENIED");
    }
    await deleteDoc(doc(db, "employees", docId));
  }

  /* =========================================================
     RENDER: EMPLOYEES TABLE
  ========================================================= */
  function renderTable(employees) {
    const tbody = $("#employeesTableBody");
    if (!tbody) return;

    if (!employees.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">
            No employees found. Click "Add Employee" to create the first record.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = employees
      .map((emp) => {
        const avatar =
          emp.profileImage ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (emp.fullName || "E").slice(0, 2),
          )}&background=6c5ce7&color=fff`;

        const editBtn = userCanEdit
          ? `<button class="row-actions__btn edit" data-action="edit" data-doc-id="${emp.docId}">
               <i class="ri-pencil-line"></i>
             </button>`
          : "";
        const deleteBtn = userCanDelete
          ? `<button class="row-actions__btn delete" data-action="delete" data-doc-id="${emp.docId}">
               <i class="ri-delete-bin-line"></i>
             </button>`
          : "";

        return `
        <tr data-doc-id="${emp.docId}">
          <td>
            <div class="employee-cell">
              <img src="${avatar}" alt="${emp.fullName}" />
              <div>
                <p class="employee-cell__name">${emp.fullName || "—"}</p>
                <p class="employee-cell__id">${emp.employeeId || ""}</p>
              </div>
            </div>
          </td>
          <td>${emp.email || "—"}</td>
          <td>${emp.phone || "—"}</td>
          <td>${emp.department || "—"}</td>
          <td>${emp.designation || "—"}</td>
          <td>${emp.joiningDate || "—"}</td>
          <td>${emp.salary ? "₹" + Number(emp.salary).toLocaleString("en-IN") : "—"}</td>
          <td>
            <span class="status-badge ${emp.status || "active"}">
              ${STATUS_LABELS[emp.status] || "Active"}
            </span>
          </td>
          <td>
            <div class="row-actions">
              ${editBtn}${deleteBtn}
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  function applySearchFilter(query) {
    const q = query.trim().toLowerCase();
    if (!q) return renderTable(allEmployees);

    const filtered = allEmployees.filter((emp) =>
      [emp.fullName, emp.email, emp.department, emp.designation]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q)),
    );
    renderTable(filtered);
  }

  /* =========================================================
     MODAL: ADD / EDIT
  ========================================================= */
  function openEmployeeModal(employee) {
    // Defense in depth: verify again right before opening,
    // regardless of how this function was reached.
    const allowed = employee ? guardEditPerm() : guardCreate();
    if (!allowed) return;

    const overlay = $("#employeeModalOverlay");
    const title = $("#employeeModalTitle");
    const saveBtnText = $("#saveEmployeeBtnText");
    if (!overlay) return;

    editingDocId = employee ? employee.docId : null;

    $("#employeeDocId").value = editingDocId || "";
    $("#empFullName").value = employee?.fullName || "";
    $("#empEmail").value = employee?.email || "";
    $("#empPhone").value = employee?.phone || "";
    $("#empDepartment").value = employee?.department || "";
    $("#empDesignation").value = employee?.designation || "";
    $("#empJoiningDate").value = employee?.joiningDate || "";
    $("#empSalary").value = employee?.salary || "";
    $("#empStatus").value = employee?.status || "active";
    $("#empProfileImage").value = employee?.profileImage || "";

    title.textContent = employee ? "Edit Employee" : "Add Employee";
    saveBtnText.textContent = employee ? "Update Employee" : "Save Employee";

    overlay.classList.add("show");
  }

  function closeEmployeeModal() {
    $("#employeeModalOverlay")?.classList.remove("show");
    $("#employeeForm")?.reset();
    editingDocId = null;
  }

  function setupEmployeeModal() {
    $("#openAddEmployeeBtn")?.addEventListener("click", () => {
      if (!guardCreate()) return;
      openEmployeeModal(null);
    });
    $("#closeEmployeeModalBtn")?.addEventListener("click", closeEmployeeModal);
    $("#cancelEmployeeFormBtn")?.addEventListener("click", closeEmployeeModal);

    $("#employeeModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "employeeModalOverlay") closeEmployeeModal();
    });

    $("#employeeForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (editingDocId ? !guardEditPerm() : !guardCreate()) return;

      const formData = {
        fullName: $("#empFullName").value.trim(),
        email: $("#empEmail").value.trim(),
        phone: $("#empPhone").value.trim(),
        department: $("#empDepartment").value,
        designation: $("#empDesignation").value.trim(),
        joiningDate: $("#empJoiningDate").value,
        salary: $("#empSalary").value ? Number($("#empSalary").value) : "",
        status: $("#empStatus").value,
        profileImage: $("#empProfileImage").value.trim(),
      };

      if (
        !formData.fullName ||
        !formData.email ||
        !formData.department ||
        !formData.designation ||
        !formData.joiningDate
      ) {
        showToast("error", "Please fill all required fields.");
        return;
      }

      const saveBtn = $("#saveEmployeeBtn");
      saveBtn.disabled = true;

      try {
        await saveEmployee(formData, editingDocId);
        showToast(
          "success",
          editingDocId
            ? "Employee updated successfully."
            : "Employee added successfully.",
        );
        closeEmployeeModal();
        allEmployees = await fetchEmployees();
        renderTable(allEmployees);
      } catch (error) {
        if (error.message !== "RBAC_DENIED") {
          console.error("Failed to save employee:", error);
          showToast("error", "Could not save employee. Please try again.");
        }
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  /* =========================================================
     MODAL: DELETE CONFIRM
  ========================================================= */
  function openDeleteModal(docId, name) {
    // Defense in depth: verify again right before opening,
    // regardless of how this function was reached.
    if (!guardDeletePerm()) return;

    pendingDeleteId = docId;
    $("#deleteEmployeeName").textContent = name || "this employee";
    $("#deleteModalOverlay")?.classList.add("show");
  }

  function closeDeleteModal() {
    $("#deleteModalOverlay")?.classList.remove("show");
    pendingDeleteId = null;
  }

  function setupDeleteModal() {
    $("#closeDeleteModalBtn")?.addEventListener("click", closeDeleteModal);
    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);

    $("#deleteModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "deleteModalOverlay") closeDeleteModal();
    });

    $("#confirmDeleteBtn")?.addEventListener("click", async () => {
      if (!pendingDeleteId) return;
      if (!guardDeletePerm()) return;

      try {
        await removeEmployee(pendingDeleteId);
        showToast("success", "Employee removed successfully.");
        closeDeleteModal();
        allEmployees = await fetchEmployees();
        applySearchFilter($("#employeeSearchInput")?.value || "");
      } catch (error) {
        if (error.message !== "RBAC_DENIED") {
          console.error("Failed to delete employee:", error);
          showToast("error", "Could not remove employee. Please try again.");
        }
      }
    });
  }

  /* =========================================================
     TABLE ROW ACTIONS (edit / delete) — event delegation
  ========================================================= */
  function setupTableActions() {
    const tbody = $("#employeesTableBody");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".row-actions__btn");
      if (!btn) return;

      const docId = btn.dataset.docId;
      const employee = allEmployees.find((emp) => emp.docId === docId);
      if (!employee) return;

      if (btn.dataset.action === "edit") {
        if (!guardEditPerm()) return;
        openEmployeeModal(employee);
      } else if (btn.dataset.action === "delete") {
        if (!guardDeletePerm()) return;
        openDeleteModal(docId, employee.fullName);
      }
    });
  }

  /* =========================================================
     SEARCH
  ========================================================= */
  function setupSearch() {
    const input = $("#employeeSearchInput");
    if (!input) return;
    input.addEventListener("input", () => applySearchFilter(input.value));
  }

  /* =========================================================
     QUERY PARAM: ?action=add
  ========================================================= */
  function handleQueryParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add") {
      if (!guardCreate()) return;
      openEmployeeModal(null);
    }
  }

  /* =========================================================
     RBAC UI ENFORCEMENT
     ----------------------------------------------------------
     Hides (not disables) the Add Employee trigger when the
     current role cannot create. Row-level Edit/Delete buttons
     are already omitted at render time in renderTable().
  ========================================================= */
  function applyAccessControlToUI() {
    const addBtn = $("#openAddEmployeeBtn");
    if (addBtn) addBtn.hidden = !userCanCreate;
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    const currentUser = await guardAndLoadUser();

    const allowedToView = canView(MODULES.EMPLOYEES);
    debugLog("view", allowedToView);
    console.log(
      `[RBAC][Employees] currentRole="${currentUser?.role || "unknown"}"`,
    );

    if (!allowedToView) {
      // Route Guard is expected to have already redirected an
      // Employee-role user before this page ever loads. This is
      // a defensive second check: stop here, load nothing, render
      // nothing, and bounce to a safe page.
      showToast("error", "Access Denied — you don't have permission.");
      window.location.href = "./dashboard.html";
      return;
    }

    userCanCreate = canCreate(MODULES.EMPLOYEES);
    userCanEdit = canEdit(MODULES.EMPLOYEES);
    userCanDelete = canDelete(MODULES.EMPLOYEES);

    showSkeleton("empSkeleton", "empContent");

    renderNav();
    setupUserMenu();
    setupSidebarToggle();
    setupEmployeeModal();
    setupDeleteModal();
    setupTableActions();
    setupSearch();
    applyAccessControlToUI();

    allEmployees = await fetchEmployees();
    renderTable(allEmployees);

    hideSkeleton("empSkeleton", "empContent");

    handleQueryParams();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
