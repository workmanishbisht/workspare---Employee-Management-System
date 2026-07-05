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
} from "../js/layout.js";

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
              <button class="row-actions__btn edit" data-action="edit" data-doc-id="${emp.docId}">
                <i class="ri-pencil-line"></i>
              </button>
              <button class="row-actions__btn delete" data-action="delete" data-doc-id="${emp.docId}">
                <i class="ri-delete-bin-line"></i>
              </button>
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
    $("#openAddEmployeeBtn")?.addEventListener("click", () => openEmployeeModal(null));
    $("#closeEmployeeModalBtn")?.addEventListener("click", closeEmployeeModal);
    $("#cancelEmployeeFormBtn")?.addEventListener("click", closeEmployeeModal);

    $("#employeeModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "employeeModalOverlay") closeEmployeeModal();
    });

    $("#employeeForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();

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

      if (!formData.fullName || !formData.email || !formData.department || !formData.designation || !formData.joiningDate) {
        showToast("error", "Please fill all required fields.");
        return;
      }

      const saveBtn = $("#saveEmployeeBtn");
      saveBtn.disabled = true;

      try {
        await saveEmployee(formData, editingDocId);
        showToast(
          "success",
          editingDocId ? "Employee updated successfully." : "Employee added successfully.",
        );
        closeEmployeeModal();
        allEmployees = await fetchEmployees();
        renderTable(allEmployees);
      } catch (error) {
        console.error("Failed to save employee:", error);
        showToast("error", "Could not save employee. Please try again.");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  /* =========================================================
     MODAL: DELETE CONFIRM
  ========================================================= */
  function openDeleteModal(docId, name) {
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

      try {
        await removeEmployee(pendingDeleteId);
        showToast("success", "Employee removed successfully.");
        closeDeleteModal();
        allEmployees = await fetchEmployees();
        applySearchFilter($("#employeeSearchInput")?.value || "");
      } catch (error) {
        console.error("Failed to delete employee:", error);
        showToast("error", "Could not remove employee. Please try again.");
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
        openEmployeeModal(employee);
      } else if (btn.dataset.action === "delete") {
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
      openEmployeeModal(null);
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
    setupEmployeeModal();
    setupDeleteModal();
    setupTableActions();
    setupSearch();

    allEmployees = await fetchEmployees();
    renderTable(allEmployees);

    handleQueryParams();
  }

  document.addEventListener("DOMContentLoaded", init);
})();