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
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const EARNING_LEGEND = [
    {
      key: "basicSalary",
      label: "Basic Salary",
      color: "var(--color-primary)",
    },
    { key: "bonus", label: "Bonus", color: "var(--stat-blue)" },
    { key: "allowances", label: "Allowances", color: "var(--color-success)" },
    { key: "overtime", label: "Overtime", color: "var(--stat-orange)" },
  ];

  /* =========================================================
     STATE
  ========================================================= */
  let allPayroll = [];
  let filteredPayroll = [];
  let employees = [];
  let departments = [];
  let editingId = null;
  let pendingDeleteId = null;
  let unsubscribePayroll = null;
  let currentPage = 1;
  let pageSize = 10;
  const now = new Date();
  let periodMonth = MONTHS[now.getMonth()];
  let periodYear = now.getFullYear();
  let chartYear = now.getFullYear();

  /* =========================================================
     HELPERS
  ========================================================= */
  const money = (n) =>
    "₹" +
    (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const toMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return new Date(ts).getTime() || 0;
  };

  const initials = (name) => {
    if (!name) return "—";
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("");
  };

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

  /* =========================================================
     DROPDOWN MENUS (Run Payroll / Filters / Export)
     ----------------------------------------------------------
     Only one dropdown open at a time, closes on outside click
     or Escape — this is what was missing and caused all three
     panels to render stacked on top of each other.
  ========================================================= */
  const dropdowns = [
    {
      trigger: "runPayrollCaretBtn",
      altTrigger: "runPayrollBtn",
      menu: "runPayrollMenu",
      altOpensMenu: false,
    },
    { trigger: "filtersBtn", menu: "filtersMenu" },
    { trigger: "exportBtn", menu: "exportMenu" },
  ];

  function closeAllDropdowns(except) {
    dropdowns.forEach((d) => {
      if (d.menu === except) return;
      const menu = $(`#${d.menu}`);
      if (menu) menu.hidden = true;
    });
  }

  function setupDropdowns() {
    dropdowns.forEach((d) => {
      const trigger = $(`#${d.trigger}`);
      const menu = $(`#${d.menu}`);
      if (!trigger || !menu) return;

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = menu.hidden;
        closeAllDropdowns();
        menu.hidden = !willOpen;
      });
    });

    document.addEventListener("click", () => closeAllDropdowns());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllDropdowns();
    });

    // Clicking anything inside a dropdown shouldn't bubble up and re-close it.
    dropdowns.forEach((d) => {
      $(`#${d.menu}`)?.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  /* =========================================================
     FIRESTORE: LOAD PAYROLL (realtime)
  ========================================================= */
  function loadPayroll() {
    const q = query(collection(db, "payroll"), orderBy("createdAt", "desc"));

    unsubscribePayroll = onSnapshot(
      q,
      (snap) => {
        allPayroll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        currentPage = 1;
        filterPayroll();
        renderStatistics();
        renderBarChart();
        renderDonut();
        hideSkeleton("payrollSkeleton", "payrollContent");
      },
      (error) => {
        console.error("Failed to load payroll:", error);
        showToast("error", "Could not load payroll records.");
        hideSkeleton("payrollSkeleton", "payrollContent");
      },
    );
  }

  function refreshPayroll() {
    if (unsubscribePayroll) unsubscribePayroll();
    loadPayroll();
  }

  /* =========================================================
     FIRESTORE: LOAD EMPLOYEES + DEPARTMENTS (for pickers)
  ========================================================= */
  async function loadEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateEmployeeSelect();
      renderStatistics();
    } catch (error) {
      console.error("Failed to load employees:", error);
    }
  }

  async function loadDepartments() {
    try {
      const snap = await getDocs(collection(db, "departments"));
      departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateDepartmentFilter();
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  }

  function populateEmployeeSelect() {
    const select = $("#employeeSelect");
    if (!select) return;
    select.innerHTML =
      '<option value="">Select Employee</option>' +
      employees
        .map(
          (emp) => `<option value="${emp.id}"
          data-employee-id="${escapeHtml(emp.employeeId || emp.id)}"
          data-name="${escapeHtml(emp.fullName || emp.name || "Unnamed")}"
          data-department="${escapeHtml(emp.department || "")}"
          data-designation="${escapeHtml(emp.designation || "")}">
          ${escapeHtml(emp.fullName || emp.name || "Unnamed")} — ${escapeHtml(emp.employeeId || emp.id)}
        </option>`,
        )
        .join("");
  }

  function populateDepartmentFilter() {
    const select = $("#filterDepartment");
    if (!select) return;
    select.innerHTML =
      '<option value="">All Departments</option>' +
      departments
        .map(
          (dep) =>
            `<option value="${escapeHtml(dep.name || dep.id)}">${escapeHtml(dep.name || dep.id)}</option>`,
        )
        .join("");
  }

  /* =========================================================
     STATIC SELECTS (period / month / year)
  ========================================================= */
  function populateStaticSelects() {
    const currentYear = now.getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= currentYear - 4; y--) years.push(y);

    const periodMonthSel = $("#periodMonthSelect");
    if (periodMonthSel) {
      periodMonthSel.innerHTML = MONTHS.map(
        (m) => `<option value="${m}">${m}</option>`,
      ).join("");
      periodMonthSel.value = periodMonth;
      periodMonthSel.addEventListener("change", () => {
        periodMonth = periodMonthSel.value;
        renderStatistics();
      });
    }

    const periodYearSel = $("#periodYearSelect");
    if (periodYearSel) {
      periodYearSel.innerHTML = years
        .map((y) => `<option value="${y}">${y}</option>`)
        .join("");
      periodYearSel.value = String(periodYear);
      periodYearSel.addEventListener("change", () => {
        periodYear = Number(periodYearSel.value);
        renderStatistics();
      });
    }

    const chartYearSel = $("#chartYearSelect");
    if (chartYearSel) {
      chartYearSel.innerHTML = years
        .map((y) => `<option value="${y}">${y}</option>`)
        .join("");
      chartYearSel.value = String(chartYear);
      chartYearSel.addEventListener("change", () => {
        chartYear = Number(chartYearSel.value);
        renderBarChart();
      });
    }
  }

  /* =========================================================
     STATISTICS
  ========================================================= */
  function renderStatistics() {
    const periodRows = allPayroll.filter(
      (r) => r.month === periodMonth && String(r.year) === String(periodYear),
    );

    const totalPayroll = periodRows.reduce(
      (sum, r) => sum + (Number(r.netSalary) || 0),
      0,
    );
    const totalDeductions = periodRows.reduce(
      (sum, r) => sum + (Number(r.totalDeductions) || 0),
      0,
    );
    const averageSalary = periodRows.length
      ? totalPayroll / periodRows.length
      : 0;
    const netPayroll =
      periodRows.reduce((sum, r) => sum + (Number(r.grossSalary) || 0), 0) -
      totalDeductions;

    setStat(
      "statTotalPayroll",
      money(totalPayroll),
      `statTotalPayrollSub`,
      `For ${periodMonth} ${periodYear}`,
    );
    setStat(
      "statTotalEmployees",
      String(employees.length),
      `statTotalEmployeesSub`,
      `${periodRows.length} on this period's payroll`,
    );
    setStat(
      "statAverageSalary",
      money(averageSalary),
      `statAverageSalarySub`,
      "Per employee this period",
    );
    setStat(
      "statDeductions",
      money(totalDeductions),
      `statDeductionsSub`,
      periodRows.length ? `${periodRows.length} records` : "—",
    );
    setStat(
      "statNetPayroll",
      money(netPayroll),
      `statNetPayrollSub`,
      periodRows.length ? "Gross minus deductions" : "—",
    );
  }

  function setStat(valueId, value, subId, subText) {
    const valueEl = $(`#${valueId}`);
    const subEl = $(`#${subId}`);
    if (valueEl) valueEl.textContent = value;
    if (subEl) subEl.textContent = subText;
  }

  /* =========================================================
     BAR CHART (Payroll Overview) — plain divs, no library
  ========================================================= */
  function renderBarChart() {
    const wrap = $("#payrollBarChart");
    if (!wrap) return;

    const yearRows = allPayroll.filter(
      (r) => String(r.year) === String(chartYear),
    );
    if (!yearRows.length) {
      wrap.innerHTML = `<div class="bar-chart-empty">No payroll data for ${chartYear}</div>`;
      return;
    }

    const totals = MONTHS.map((m) =>
      yearRows
        .filter((r) => r.month === m)
        .reduce((sum, r) => sum + (Number(r.netSalary) || 0), 0),
    );
    const max = Math.max(...totals, 1);
    const currentMonthIndex =
      periodYear === chartYear ? MONTHS.indexOf(periodMonth) : -1;

    wrap.innerHTML = MONTHS.map((m, i) => {
      const heightPct = Math.max((totals[i] / max) * 100, 2);
      const active = i === currentMonthIndex ? "active" : "";
      return `
        <div class="bar-chart-col" title="${m}: ${money(totals[i])}">
          <div class="bar-chart-bar ${active}" style="height:${heightPct}%"></div>
          <span class="bar-chart-label">${m.slice(0, 3)}</span>
        </div>`;
    }).join("");
  }

  /* =========================================================
     DONUT (Earnings Breakdown) — CSS conic-gradient
  ========================================================= */
  function renderDonut() {
    const donut = $("#earningsDonut");
    const totalEl = $("#earningsDonutTotal");
    const legend = $("#earningsLegend");
    if (!donut || !legend) return;

    const periodRows = allPayroll.filter(
      (r) => r.month === periodMonth && String(r.year) === String(periodYear),
    );
    const sums = EARNING_LEGEND.map((item) =>
      periodRows.reduce((sum, r) => sum + (Number(r[item.key]) || 0), 0),
    );
    const total = sums.reduce((a, b) => a + b, 0);

    if (totalEl) totalEl.textContent = money(total);

    if (!total) {
      donut.style.background = "var(--panel-light-border)";
      legend.innerHTML = `<li>No earnings recorded for this period</li>`;
      return;
    }

    let cursor = 0;
    const stops = EARNING_LEGEND.map((item, i) => {
      const pct = (sums[i] / total) * 100;
      const start = cursor;
      cursor += pct;
      return `${item.color} ${start}% ${cursor}%`;
    }).join(", ");
    donut.style.background = `conic-gradient(${stops})`;

    legend.innerHTML = EARNING_LEGEND.map((item, i) => {
      const pct = total ? Math.round((sums[i] / total) * 100) : 0;
      return `
        <li>
          <span class="dot" style="background:${item.color}"></span>
          <span class="legend-body">
            <span>${item.label}</span>
            <strong>${money(sums[i])} (${pct}%)</strong>
          </span>
        </li>`;
    }).join("");
  }

  /* =========================================================
     SEARCH / FILTER / SORT
  ========================================================= */
  function searchPayroll() {
    currentPage = 1;
    filterPayroll();
  }

  function filterPayroll() {
    const search = ($("#payrollSearchInput")?.value || "").trim().toLowerCase();
    const department = $("#filterDepartment")?.value || "";
    const status = $("#filterStatus")?.value || "";
    const sort = $("#sortPayroll")?.value || "date-desc";

    let rows = [...allPayroll];

    if (search) {
      rows = rows.filter(
        (r) =>
          (r.employeeName || "").toLowerCase().includes(search) ||
          (r.employeeId || "").toLowerCase().includes(search) ||
          (r.department || "").toLowerCase().includes(search),
      );
    }
    if (department) rows = rows.filter((r) => r.department === department);
    if (status) rows = rows.filter((r) => r.paymentStatus === status);

    rows.sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return toMillis(a.createdAt) - toMillis(b.createdAt);
        case "salary-desc":
          return (b.netSalary || 0) - (a.netSalary || 0);
        case "salary-asc":
          return (a.netSalary || 0) - (b.netSalary || 0);
        case "name-asc":
          return (a.employeeName || "").localeCompare(b.employeeName || "");
        default:
          return toMillis(b.createdAt) - toMillis(a.createdAt);
      }
    });

    filteredPayroll = rows;
    renderPayroll();
  }

  function resetFilters() {
    $("#payrollSearchInput").value = "";
    $("#filterDepartment").value = "";
    $("#filterStatus").value = "";
    $("#sortPayroll").value = "date-desc";
    currentPage = 1;
    filterPayroll();
  }

  /* =========================================================
     RENDER: TABLE + PAGINATION
  ========================================================= */
  function renderPayroll() {
    const tbody = $("#payrollTableBody");
    const emptyState = $("#payrollEmptyState");
    const tableWrap = $("#payrollTableWrap");
    const pagination = $("#payrollPagination");
    if (!tbody) return;

    if (!filteredPayroll.length) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      tableWrap.style.display = "none";
      pagination.style.display = "none";
      return;
    }

    emptyState.hidden = true;
    tableWrap.style.display = "block";
    pagination.style.display = "flex";

    const totalPages = Math.max(
      1,
      Math.ceil(filteredPayroll.length / pageSize),
    );
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageRows = filteredPayroll.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.map(rowTemplate).join("");
    renderPagination(totalPages);

    $$("[data-action='view']", tbody).forEach((btn) =>
      btn.addEventListener(
        "click",
        () =>
          (window.location.href = `payroll-details.html?id=${btn.dataset.id}`),
      ),
    );
    $$("[data-action='edit']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => openPayrollModal(btn.dataset.id)),
    );
    $$("[data-action='download']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => downloadPayslipPDF(btn.dataset.id)),
    );
    $$("[data-action='delete']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id)),
    );
  }

  function rowTemplate(r) {
    const statusClass =
      {
        Paid: "status-badge--paid",
        Pending: "status-badge--pending",
        Processing: "status-badge--processing",
        Failed: "status-badge--failed",
      }[r.paymentStatus] || "status-badge--pending";

    return `
      <tr>
        <td>
          <div class="emp-cell">
            <div class="emp-avatar">${initials(r.employeeName)}</div>
            <div class="emp-info">
              <span class="emp-name">${escapeHtml(r.employeeName || "—")}</span>
              <span class="emp-sub">${escapeHtml(r.department || "")}</span>
            </div>
          </div>
        </td>
        <td>${escapeHtml(r.employeeId || "—")}</td>
        <td>${escapeHtml(r.designation || "—")}</td>
        <td>${money(r.grossSalary)}</td>
        <td>${money(r.totalDeductions)}</td>
        <td><strong>${money(r.netSalary)}</strong></td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(r.paymentStatus || "Pending")}</span></td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="row-action-btn" data-action="view" data-id="${r.id}" title="View"><i class="ri-eye-line"></i></button>
            <button class="row-action-btn" data-action="edit" data-id="${r.id}" title="Edit"><i class="ri-pencil-line"></i></button>
            <button class="row-action-btn" data-action="download" data-id="${r.id}" title="Download payslip"><i class="ri-download-2-line"></i></button>
            <button class="row-action-btn danger" data-action="delete" data-id="${r.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
          </div>
        </td>
      </tr>`;
  }

  function renderPagination(totalPages) {
    const info = $("#paginationInfo");
    const controls = $("#paginationControls");
    if (!info || !controls) return;

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, filteredPayroll.length);
    info.textContent = `Showing ${start}–${end} of ${filteredPayroll.length}`;

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
        renderPayroll();
      });
    });
  }

  /* =========================================================
     MODAL: GENERATE / EDIT PAYROLL
  ========================================================= */
  function openPayrollModal(payrollId = null) {
    editingId = payrollId;
    const form = $("#payrollForm");
    form.reset();
    $("#payrollDocId").value = "";

    if (payrollId) {
      const record = allPayroll.find((r) => r.id === payrollId);
      if (!record) return;
      $("#payrollModalTitle").textContent = "Edit Payroll";
      $("#savePayrollBtn").innerHTML =
        '<i class="ri-save-line"></i> Update Payroll';
      $("#payrollDocId").value = payrollId;
      fillForm(record);
    } else {
      $("#payrollModalTitle").textContent = "Generate Payroll";
      $("#savePayrollBtn").innerHTML =
        '<i class="ri-save-line"></i> Generate Payroll';
      $("#payrollMonthSelect").value = periodMonth;
      $("#payrollYearInput").value = periodYear;
    }

    recalculate();
    $("#payrollModalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePayrollModal() {
    $("#payrollModalOverlay").hidden = true;
    document.body.style.overflow = "";
    editingId = null;
  }

  function fillForm(r) {
    $("#employeeSelect").value = r.employeeDocId || "";
    $("#payrollMonthSelect").value = r.month || "";
    $("#payrollYearInput").value = r.year || "";
    $("#basicSalaryInput").value = r.basicSalary || 0;
    $("#bonusInput").value = r.bonus || 0;
    $("#allowanceInput").value = r.allowances || 0;
    $("#overtimeInput").value = r.overtime || 0;
    $("#taxInput").value = r.tax || 0;
    $("#pfInput").value = r.pf || 0;
    $("#insuranceInput").value = r.insurance || 0;
    $("#otherDeductionInput").value = r.otherDeductions || 0;
    $("#notesInput").value = r.notes || "";
  }

  function recalculate() {
    const num = (id) => Number($(id)?.value) || 0;
    const gross =
      num("#basicSalaryInput") +
      num("#bonusInput") +
      num("#allowanceInput") +
      num("#overtimeInput");
    const deductions =
      num("#taxInput") +
      num("#pfInput") +
      num("#insuranceInput") +
      num("#otherDeductionInput");
    const net = gross - deductions;

    $("#calcGrossSalary").textContent = money(gross);
    $("#calcTotalDeduction").textContent = money(deductions);
    $("#calcNetSalary").textContent = money(net);
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const empSelect = $("#employeeSelect");
    const empOption = empSelect.selectedOptions[0];

    if (!empOption || !empOption.value) {
      showToast("error", "Please select an employee.");
      return;
    }

    const num = (id) => Number($(id)?.value) || 0;
    const gross =
      num("#basicSalaryInput") +
      num("#bonusInput") +
      num("#allowanceInput") +
      num("#overtimeInput");
    const totalDeductions =
      num("#taxInput") +
      num("#pfInput") +
      num("#insuranceInput") +
      num("#otherDeductionInput");
    const netSalary = gross - totalDeductions;

    const payload = {
      employeeDocId: empOption.value,
      employeeId: empOption.dataset.employeeId || "",
      employeeName: empOption.dataset.name || "",
      department: empOption.dataset.department || "",
      designation: empOption.dataset.designation || "",
      month: $("#payrollMonthSelect").value,
      year: Number($("#payrollYearInput").value),
      basicSalary: num("#basicSalaryInput"),
      bonus: num("#bonusInput"),
      allowances: num("#allowanceInput"),
      overtime: num("#overtimeInput"),
      grossSalary: gross,
      tax: num("#taxInput"),
      pf: num("#pfInput"),
      insurance: num("#insuranceInput"),
      otherDeductions: num("#otherDeductionInput"),
      totalDeductions,
      netSalary,
      paymentStatus: "Pending",
      notes: $("#notesInput").value || "",
    };

    try {
      if (editingId) {
        await updatePayroll(editingId, payload);
      } else {
        await savePayroll(payload);
      }
      closePayrollModal();
    } catch (error) {
      console.error("Payroll save failed:", error);
      showToast("error", "Something went wrong. Please try again.");
    }
  }

  async function savePayroll(payload) {
    await addDoc(collection(db, "payroll"), {
      ...payload,
      paymentDate: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    showToast("success", "Payroll generated successfully.");
  }

  async function updatePayroll(id, payload) {
    await updateDoc(doc(db, "payroll", id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    showToast("success", "Payroll updated successfully.");
  }

  /* =========================================================
     DELETE PAYROLL
  ========================================================= */
  function openDeleteModal(id) {
    const record = allPayroll.find((r) => r.id === id);
    pendingDeleteId = id;
    $("#deleteTargetName").textContent = record
      ? record.employeeName
      : "this payroll record";
    $("#deleteModalOverlay").hidden = false;
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    $("#deleteModalOverlay").hidden = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    await deletePayroll(pendingDeleteId);
    closeDeleteModal();
  }

  async function deletePayroll(id) {
    try {
      await deleteDoc(doc(db, "payroll", id));
      showToast("success", "Payroll record deleted.");
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("error", "Failed to delete payroll record.");
    }
  }

  /* =========================================================
     PAYSLIP
  ========================================================= */
  function generatePayslip(record) {
    return `
      <div class="payslip">
        <div class="payslip__head">
          <div class="payslip__brand">
            <div class="payslip__logo"><i class="ri-team-fill"></i></div>
            <div>
              <p class="payslip__company">Workspare Pvt. Ltd.</p>
              <p class="payslip__period">Payslip for ${escapeHtml(record.month)} ${escapeHtml(String(record.year))}</p>
            </div>
          </div>
          <span class="status-badge status-badge--paid">${escapeHtml(record.paymentStatus)}</span>
        </div>
        <div class="payslip__grid">
          <div><span>Employee</span><strong>${escapeHtml(record.employeeName)}</strong></div>
          <div><span>Employee ID</span><strong>${escapeHtml(record.employeeId)}</strong></div>
          <div><span>Department</span><strong>${escapeHtml(record.department)}</strong></div>
          <div><span>Designation</span><strong>${escapeHtml(record.designation)}</strong></div>
        </div>
        <div class="payslip__columns">
          <div>
            <h4>Earnings</h4>
            <div class="payslip__line"><span>Basic Salary</span><span>${money(record.basicSalary)}</span></div>
            <div class="payslip__line"><span>Bonus</span><span>${money(record.bonus)}</span></div>
            <div class="payslip__line"><span>Allowances</span><span>${money(record.allowances)}</span></div>
            <div class="payslip__line"><span>Overtime</span><span>${money(record.overtime)}</span></div>
            <div class="payslip__line payslip__line--total"><span>Gross Salary</span><span>${money(record.grossSalary)}</span></div>
          </div>
          <div>
            <h4>Deductions</h4>
            <div class="payslip__line"><span>Tax</span><span>${money(record.tax)}</span></div>
            <div class="payslip__line"><span>PF</span><span>${money(record.pf)}</span></div>
            <div class="payslip__line"><span>Insurance</span><span>${money(record.insurance)}</span></div>
            <div class="payslip__line"><span>Other</span><span>${money(record.otherDeductions)}</span></div>
            <div class="payslip__line payslip__line--total"><span>Total Deductions</span><span>${money(record.totalDeductions)}</span></div>
          </div>
        </div>
        <div class="payslip__net">
          <span>Net Salary</span>
          <strong>${money(record.netSalary)}</strong>
        </div>
      </div>`;
  }

  function downloadPayslipPDF(id) {
    const record = allPayroll.find((r) => r.id === id);
    if (!record) return;
    const win = window.open("", "_blank");
    win.document
      .write(`<html><head><title>Payslip - ${escapeHtml(record.employeeName)}</title>
      <link rel="stylesheet" href="../css/dashboard.css" />
      <link rel="stylesheet" href="../css/payroll-details.css" /></head>
      <body onload="window.print()">${generatePayslip(record)}</body></html>`);
    win.document.close();
  }

  function printPayslip(id) {
    downloadPayslipPDF(id);
  }

  /* =========================================================
     EXPORT (CSV / Excel / PDF)
  ========================================================= */
  function exportRows(format) {
    if (!filteredPayroll.length) {
      showToast("error", "No payroll records to export.");
      return;
    }

    if (format === "pdf") {
      window.print();
      return;
    }

    const headers = [
      "Employee",
      "Employee ID",
      "Department",
      "Designation",
      "Month",
      "Year",
      "Gross Salary",
      "Deductions",
      "Net Salary",
      "Status",
    ];
    const lines = filteredPayroll.map((r) =>
      [
        r.employeeName,
        r.employeeId,
        r.department,
        r.designation,
        r.month,
        r.year,
        r.grossSalary,
        r.totalDeductions,
        r.netSalary,
        r.paymentStatus,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${periodMonth}-${periodYear}.${format === "excel" ? "csv" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Export ready — check your downloads.");
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    setupDropdowns();

    $("#runPayrollBtn")?.addEventListener("click", () => refreshPayroll());
    $("#generatePayrollBtn")?.addEventListener("click", () => {
      closeAllDropdowns();
      openPayrollModal();
    });
    $("#emptyStateGenerateBtn")?.addEventListener("click", () =>
      openPayrollModal(),
    );

    $("#payrollSearchInput")?.addEventListener("input", searchPayroll);
    ["filterDepartment", "filterStatus", "sortPayroll"].forEach((id) =>
      $(`#${id}`)?.addEventListener("change", () => {
        currentPage = 1;
        filterPayroll();
      }),
    );
    $("#resetFiltersBtn")?.addEventListener("click", resetFilters);

    $("#pageSizeSelect")?.addEventListener("change", (e) => {
      pageSize = Number(e.target.value);
      currentPage = 1;
      renderPayroll();
    });

    $("#exportCsvBtn")?.addEventListener("click", () => {
      closeAllDropdowns();
      exportRows("csv");
    });
    $("#exportExcelBtn")?.addEventListener("click", () => {
      closeAllDropdowns();
      exportRows("excel");
    });
    $("#exportPdfBtn")?.addEventListener("click", () => {
      closeAllDropdowns();
      exportRows("pdf");
    });

    $("#closePayrollModalBtn")?.addEventListener("click", closePayrollModal);
    $("#cancelPayrollModalBtn")?.addEventListener("click", closePayrollModal);
    $("#payrollModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "payrollModalOverlay") closePayrollModal();
    });
    $("#payrollForm")?.addEventListener("submit", handleFormSubmit);

    [
      "basicSalaryInput",
      "bonusInput",
      "allowanceInput",
      "overtimeInput",
      "taxInput",
      "pfInput",
      "insuranceInput",
      "otherDeductionInput",
    ].forEach((id) => $(`#${id}`)?.addEventListener("input", recalculate));

    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
    $("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);
    $("#deleteModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "deleteModalOverlay") closeDeleteModal();
    });

    $$("[data-quick-action]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.quickAction === "payslip") {
          openPayrollModal();
        } else {
          showToast("success", "Coming soon.");
        }
      }),
    );
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    showSkeleton("payrollSkeleton", "payrollContent");

    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    populateStaticSelects();
    wireUI();
    await loadEmployees();
    loadDepartments();
    loadPayroll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
