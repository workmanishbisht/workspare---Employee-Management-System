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
  const MONTHS_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DONUT_COLORS = {
    National: "#6c5ce7",
    Festival: "#0984e3",
    Optional: "#fdcb6e",
  };

  /* =========================================================
     STATE
  ========================================================= */
  let allHolidays = [];
  let filteredHolidays = [];
  let departments = [];
  let editingId = null;
  let pendingDeleteId = null;
  let unsubscribeHolidays = null;

  let selectedYear = new Date().getFullYear();
  let selectedLocation = "";
  let calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  let sortField = "date";
  let sortDir = "asc";
  let currentPage = 1;
  const PAGE_SIZE = 8;

  /* =========================================================
     HELPERS
  ========================================================= */
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const parseDate = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

  const formatDate = (str) => {
    const d = parseDate(str);
    if (!d) return "—";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const dayName = (str) => {
    const d = parseDate(str);
    return d ? DOW_SHORT[d.getDay()] : "—";
  };

  const holidayStatus = (str) => (str >= todayStr() ? "Upcoming" : "Completed");

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

  const num = (id) => Number($(id)?.value) || 0;

  /* =========================================================
     DROPDOWN UTILITY
  ========================================================= */
  function bindDropdown(triggerId, menuId) {
    const trigger = $(`#${triggerId}`);
    const menu = $(`#${menuId}`);
    if (!trigger || !menu) return;
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(menu);
      menu.hidden = !menu.hidden;
    });
  }

  function closeAllDropdowns(except) {
    $$(".dropdown-menu").forEach((m) => {
      if (m !== except) m.hidden = true;
    });
  }

  document.addEventListener("click", () => closeAllDropdowns());

  /* =========================================================
     FIRESTORE: LOAD HOLIDAYS (realtime)
  ========================================================= */
  function loadHolidays() {
    const q = query(collection(db, "holidays"), orderBy("date", "asc"));

    unsubscribeHolidays = onSnapshot(
      q,
      (snap) => {
        allHolidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        populateLocationOptions();
        currentPage = 1;
        filterHolidays();
        renderOverview();
        hideSkeleton("holidaySkeleton", "holidayTableContent");
      },
      (error) => {
        console.error("Failed to load holidays:", error);
        showToast("error", "Could not load holidays.");
        hideSkeleton("holidaySkeleton", "holidayTableContent");
      },
    );
  }

  /* =========================================================
     FIRESTORE: LOAD DEPARTMENTS
  ========================================================= */
  async function loadDepartments() {
    try {
      const snap = await getDocs(collection(db, "departments"));
      departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateDepartmentCheckboxes();
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  }

  function populateDepartmentCheckboxes() {
    const container = $("#departmentCheckboxes");
    if (!container) return;
    const extra = departments
      .map(
        (dep) => `
      <label class="checkbox-item">
        <input type="checkbox" value="${escapeHtml(dep.name || dep.id)}" />
        ${escapeHtml(dep.name || dep.id)}
      </label>`,
      )
      .join("");
    container.insertAdjacentHTML("beforeend", extra);

    const allBox = container.querySelector('input[value="All Departments"]');
    const deptBoxes = $$("input[type='checkbox']", container).filter(
      (b) => b !== allBox,
    );

    allBox.addEventListener("change", () => {
      if (allBox.checked) deptBoxes.forEach((b) => (b.checked = false));
    });
    deptBoxes.forEach((box) =>
      box.addEventListener("change", () => {
        if (box.checked) allBox.checked = false;
      }),
    );
  }

  /* =========================================================
     HEADER SELECTS
  ========================================================= */
  function populateStaticSelects() {
    const yearSelect = $("#yearSelect");
    const current = new Date().getFullYear();
    for (let y = current - 2; y <= current + 3; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = String(selectedYear);
  }

  function populateLocationOptions() {
    const locations = new Set(
      allHolidays
        .map((h) => h.location)
        .filter((l) => l && l !== "All Locations"),
    );
    [
      $("#locationSelect"),
      $("#filterLocation"),
      $("#holidayLocationSelect"),
    ].forEach((select) => {
      if (!select) return;
      const existing = new Set($$("option", select).map((o) => o.value));
      locations.forEach((loc) => {
        if (existing.has(loc)) return;
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc;
        select.appendChild(opt);
      });
    });
  }

  function onHeaderFiltersChange() {
    selectedYear = Number($("#yearSelect").value);
    selectedLocation = $("#locationSelect").value;
    calCursor = new Date(selectedYear, calCursor.getMonth(), 1);
    currentPage = 1;
    renderOverview();
    filterHolidays();
  }

  /* =========================================================
     OVERVIEW: STAT CARDS + CALENDAR + DONUT + TIMELINE
  ========================================================= */
  function renderOverview() {
    renderStatCards();
    renderCalendar();
    renderDonutChart();
    renderTimelineChart();
    renderUpcomingList();
  }

  function holidaysInScope() {
    return allHolidays.filter(
      (h) =>
        !selectedLocation ||
        h.location === selectedLocation ||
        h.location === "All Locations",
    );
  }

  function holidaysForYear(year) {
    return holidaysInScope().filter(
      (h) => h.date && h.date.startsWith(String(year)),
    );
  }

  function monthlyCounts(year) {
    const counts = new Array(12).fill(0);
    holidaysForYear(year).forEach((h) => {
      const d = parseDate(h.date);
      if (d) counts[d.getMonth()] += 1;
    });
    return counts;
  }

  function sparkPoints(values) {
    const max = Math.max(...values, 1);
    const step = 100 / Math.max(values.length - 1, 1);
    return values
      .map(
        (v, i) =>
          `${(i * step).toFixed(1)},${(30 - (v / max) * 28).toFixed(1)}`,
      )
      .join(" ");
  }

  function drawSparkline(svgId, values, color) {
    const svg = $(`#${svgId}`);
    if (!svg) return;
    if (!values.some((v) => v > 0)) {
      svg.innerHTML = "";
      return;
    }
    svg.innerHTML = `<polyline points="${sparkPoints(values)}" stroke="${color}" />`;
  }

  function renderStatCards() {
    const yearHolidays = holidaysForYear(selectedYear);
    const totalHolidays = yearHolidays.length;

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const upcoming = holidaysInScope().filter((h) => {
      const d = parseDate(h.date);
      return d && d >= new Date() && d <= in30;
    }).length;

    const isLeap =
      (selectedYear % 4 === 0 && selectedYear % 100 !== 0) ||
      selectedYear % 400 === 0;
    const totalDays = isLeap ? 366 : 365;

    let weekendDays = 0;
    const cursor = new Date(selectedYear, 0, 1);
    while (cursor.getFullYear() === selectedYear) {
      if (isWeekend(cursor)) weekendDays += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    const holidaysOnWeekdays = yearHolidays.filter((h) => {
      const d = parseDate(h.date);
      return d && !isWeekend(d);
    }).length;
    const workingDays = totalDays - weekendDays - holidaysOnWeekdays;

    $("#statTotalHolidays").textContent = String(totalHolidays);
    $("#statUpcoming").textContent = String(upcoming);
    $("#statWorkingDays").textContent = String(Math.max(workingDays, 0));
    $("#statWeekends").textContent = String(weekendDays);

    const trend = monthlyCounts(selectedYear);
    drawSparkline("sparkTotal", trend, "#6c5ce7");
    drawSparkline("sparkUpcoming", trend, "#00b894");
    drawSparkline("sparkWorking", trend, "#0984e3");
    drawSparkline("sparkWeekend", trend, "#fdcb6e");
  }

  /* =========================================================
     CALENDAR PREVIEW
  ========================================================= */
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#calMonthLabel");
    if (!grid || !label) return;

    label.textContent = calCursor.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayIso = todayStr();

    const holidaysThisMonth = holidaysInScope().filter(
      (h) =>
        h.date &&
        h.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
    );
    const holidayByDay = {};
    holidaysThisMonth.forEach((h) => {
      const d = parseDate(h.date);
      if (d) holidayByDay[d.getDate()] = h;
    });

    let cells = DOW_SHORT.map(
      (d) => `<div class="calendar-dow">${d}</div>`,
    ).join("");
    for (let i = 0; i < firstDow; i++)
      cells += `<div class="calendar-cell empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const holiday = holidayByDay[day];
      const classes = ["calendar-cell"];
      if (iso === todayIso) classes.push("today");
      if (holiday) classes.push(holiday.category.toLowerCase());
      else if (isWeekend(date)) classes.push("weekend");
      cells += `<div class="${classes.join(" ")}" title="${holiday ? escapeHtml(holiday.name) : ""}">
        <span>${day}</span>${holiday ? '<span class="dot"></span>' : ""}
      </div>`;
    }

    grid.innerHTML = cells;
  }

  /* =========================================================
     DONUT + TIMELINE CHARTS
  ========================================================= */
  function renderDonutChart() {
    const yearHolidays = holidaysForYear(selectedYear);
    const categories = ["National", "Festival", "Optional"];
    const segments = categories.map((cat) => ({
      label: cat,
      value: yearHolidays.filter((h) => h.category === cat).length,
      color: DONUT_COLORS[cat],
    }));
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    $("#categoryDonutTotal").textContent = String(total);

    const donut = $("#categoryDonut");
    const legend = $("#categoryLegend");
    if (!donut || !legend) return;

    if (!total) {
      donut.style.background = "var(--panel-light-input-bg)";
      legend.innerHTML =
        '<li class="recent-list-empty">No holidays recorded for this year</li>';
      return;
    }

    let cursor = 0;
    const stops = segments
      .map((seg) => {
        const pct = (seg.value / total) * 100;
        const from = cursor;
        const to = cursor + pct;
        cursor = to;
        return `${seg.color} ${from}% ${to}%`;
      })
      .join(", ");
    donut.style.background = `conic-gradient(${stops})`;

    legend.innerHTML = segments
      .map(
        (seg) => `
      <li>
        <span class="dot" style="background:${seg.color}"></span>
        <div class="legend-body">
          <span>${seg.label}</span>
          <strong>${seg.value} (${total ? ((seg.value / total) * 100).toFixed(1) : 0}%)</strong>
        </div>
      </li>`,
      )
      .join("");
  }

  function renderTimelineChart() {
    const container = $("#timelineChart");
    if (!container) return;
    const counts = monthlyCounts(selectedYear);
    const max = Math.max(...counts, 1);
    const currentMonth = new Date().getMonth();
    const isCurrentYear = selectedYear === new Date().getFullYear();

    container.innerHTML = counts
      .map((val, i) => {
        const isActive = isCurrentYear && i === currentMonth;
        const height = Math.max((val / max) * 100, val > 0 ? 8 : 2);
        return `
        <div class="bar-chart-col">
          <div class="bar-chart-bar${isActive ? " active" : ""}" style="height:${height}%" title="${val} holiday(s)"></div>
          <span class="bar-chart-label">${MONTHS_SHORT[i]}</span>
        </div>`;
      })
      .join("");
  }

  /* =========================================================
     UPCOMING HOLIDAYS (SIDEBAR)
  ========================================================= */
  function renderUpcomingList() {
    const container = $("#upcomingList");
    if (!container) return;

    const today = new Date();
    const upcoming = holidaysInScope()
      .filter((h) => parseDate(h.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);

    if (!upcoming.length) {
      container.innerHTML =
        '<p class="recent-list-empty">No upcoming holidays</p>';
      return;
    }

    container.innerHTML = upcoming
      .map((h) => {
        const d = parseDate(h.date);
        const days = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
        return `
        <div class="upcoming-item">
          <div class="upcoming-date">
            <strong>${d.getDate()}</strong>
            <span>${MONTHS_SHORT[d.getMonth()]}</span>
          </div>
          <div class="upcoming-info">
            <p class="upcoming-name">${escapeHtml(h.name)}</p>
            <p class="upcoming-meta">${escapeHtml(h.category)} · ${escapeHtml(h.location || "All Locations")}</p>
          </div>
          <span class="upcoming-countdown">${days === 0 ? "Today" : `in ${days}d`}</span>
        </div>`;
      })
      .join("");
  }

  /* =========================================================
     SEARCH / FILTER / SORT
  ========================================================= */
  function searchHolidays() {
    currentPage = 1;
    filterHolidays();
  }

  function filterHolidays() {
    const search = ($("#holidaySearchInput")?.value || "").trim().toLowerCase();
    const category = $("#filterCategory")?.value || "";
    const location = $("#filterLocation")?.value || selectedLocation;
    const status = $("#filterStatus")?.value || "";

    let rows = [...allHolidays];

    if (search)
      rows = rows.filter((h) => (h.name || "").toLowerCase().includes(search));
    if (category) rows = rows.filter((h) => h.category === category);
    if (location)
      rows = rows.filter(
        (h) => h.location === location || h.location === "All Locations",
      );
    if (status) rows = rows.filter((h) => holidayStatus(h.date) === status);

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date")
        cmp = (a.date || "").localeCompare(b.date || "");
      if (sortField === "name")
        cmp = (a.name || "").localeCompare(b.name || "");
      if (sortField === "category")
        cmp = (a.category || "").localeCompare(b.category || "");
      return sortDir === "asc" ? cmp : -cmp;
    });

    filteredHolidays = rows;
    renderHolidayTable();
  }

  function resetFilters() {
    $("#holidaySearchInput").value = "";
    $("#filterCategory").value = "";
    $("#filterLocation").value = "";
    $("#filterStatus").value = "";
    currentPage = 1;
    filterHolidays();
  }

  function handleSortClick(field) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = "asc";
    }
    filterHolidays();
  }

  /* =========================================================
     RENDER: TABLE + PAGINATION
  ========================================================= */
  function renderHolidayTable() {
    const tbody = $("#holidayTableBody");
    const emptyState = $("#holidayEmptyState");
    const tableWrap = $("#holidayTableWrap");
    const paginationEl = $("#holidayPagination");
    if (!tbody) return;

    if (!filteredHolidays.length) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      tableWrap.hidden = true;
      paginationEl.hidden = true;
      return;
    }

    emptyState.hidden = true;
    tableWrap.hidden = false;
    paginationEl.hidden = false;

    const totalPages = Math.max(
      Math.ceil(filteredHolidays.length / PAGE_SIZE),
      1,
    );
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredHolidays.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageRows.map(rowTemplate).join("");

    $$("[data-action='edit']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => editHoliday(btn.dataset.id)),
    );
    $$("[data-action='delete']", tbody).forEach((btn) =>
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id)),
    );

    renderPagination(totalPages, start);
  }

  function rowTemplate(h) {
    const status = holidayStatus(h.date);
    const statusClass =
      status === "Upcoming"
        ? "status-badge--upcoming"
        : "status-badge--completed";
    const categoryClass = `status-badge--${(h.category || "").toLowerCase()}`;
    const depts = (
      h.departments && h.departments.length
        ? h.departments
        : ["All Departments"]
    )
      .map((d) => `<span class="dept-chip">${escapeHtml(d)}</span>`)
      .join("");

    return `
      <tr>
        <td><div class="date-cell"><i class="ri-calendar-line"></i>${formatDate(h.date)}</div></td>
        <td><span class="holiday-name">${escapeHtml(h.name)}</span></td>
        <td>${dayName(h.date)}</td>
        <td><span class="status-badge ${categoryClass}">${escapeHtml(h.category)}</span></td>
        <td>${escapeHtml(h.location || "All Locations")}</td>
        <td>${depts}</td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" data-action="edit" data-id="${h.id}" title="Edit"><i class="ri-pencil-line"></i></button>
            <button class="row-action-btn danger" data-action="delete" data-id="${h.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
          </div>
        </td>
      </tr>`;
  }

  function renderPagination(totalPages, start) {
    const info = $("#paginationInfo");
    const controls = $("#paginationControls");
    const end = Math.min(start + PAGE_SIZE, filteredHolidays.length);
    info.textContent = `Showing ${start + 1} to ${end} of ${filteredHolidays.length} holidays`;

    let buttons = `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}><i class="ri-arrow-left-s-line"></i></button>`;
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
        buttons += `<button class="pagination-btn${p === currentPage ? " active" : ""}" data-page="${p}">${p}</button>`;
      } else if (Math.abs(p - currentPage) === 2) {
        buttons += `<span class="pagination-btn" style="border:none;background:none;">…</span>`;
      }
    }
    buttons += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}><i class="ri-arrow-right-s-line"></i></button>`;
    controls.innerHTML = buttons;

    $$("[data-page]", controls).forEach((btn) =>
      btn.addEventListener("click", () => {
        currentPage = Number(btn.dataset.page);
        renderHolidayTable();
      }),
    );
  }

  /* =========================================================
     ADD / EDIT HOLIDAY MODAL
  ========================================================= */
  function addHoliday() {
    openHolidayModal(null);
  }

  function editHoliday(id) {
    openHolidayModal(id);
  }

  function openHolidayModal(holidayId) {
    editingId = holidayId;
    const form = $("#holidayForm");
    form.reset();
    $("#holidayDocId").value = holidayId || "";
    $$("#departmentCheckboxes input").forEach(
      (b) => (b.checked = b.value === "All Departments"),
    );

    if (holidayId) {
      const record = allHolidays.find((h) => h.id === holidayId);
      if (!record) return;
      $("#holidayModalTitle").textContent = "Edit Holiday";
      $("#saveHolidayBtn").innerHTML =
        '<i class="ri-save-line"></i> Update Holiday';
      fillForm(record);
    } else {
      $("#holidayModalTitle").textContent = "Add Holiday";
      $("#saveHolidayBtn").innerHTML =
        '<i class="ri-save-line"></i> Add Holiday';
      $("#holidayDateInput").value = todayStr();
    }

    $("#holidayModalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeHolidayModal() {
    $("#holidayModalOverlay").hidden = true;
    document.body.style.overflow = "";
    editingId = null;
  }

  function fillForm(h) {
    $("#holidayNameInput").value = h.name || "";
    $("#holidayDateInput").value = h.date || "";
    $("#holidayCategorySelect").value = h.category || "National";
    $("#holidayLocationSelect").value = h.location || "All Locations";
    $("#holidayNotesInput").value = h.notes || "";

    const depts =
      h.departments && h.departments.length
        ? h.departments
        : ["All Departments"];
    $$("#departmentCheckboxes input").forEach(
      (b) => (b.checked = depts.includes(b.value)),
    );
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    const name = $("#holidayNameInput").value.trim();
    const date = $("#holidayDateInput").value;
    if (!name || !date) {
      showToast("error", "Please fill in the holiday name and date.");
      return;
    }

    const checkedDepts = $$("#departmentCheckboxes input:checked").map(
      (b) => b.value,
    );

    const payload = {
      name,
      date,
      category: $("#holidayCategorySelect").value,
      location: $("#holidayLocationSelect").value,
      departments: checkedDepts.length ? checkedDepts : ["All Departments"],
      notes: $("#holidayNotesInput").value || "",
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "holidays", editingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Holiday updated successfully.");
      } else {
        await addDoc(collection(db, "holidays"), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Holiday added successfully.");
      }
      closeHolidayModal();
    } catch (error) {
      console.error("Holiday save failed:", error);
      showToast("error", "Something went wrong. Please try again.");
    }
  }

  /* =========================================================
     DELETE HOLIDAY
  ========================================================= */
  function openDeleteModal(id) {
    pendingDeleteId = id;
    const record = allHolidays.find((h) => h.id === id);
    $("#deleteTargetName").textContent = record ? record.name : "this holiday";
    $("#deleteModalOverlay").hidden = false;
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    $("#deleteModalOverlay").hidden = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await deleteDoc(doc(db, "holidays", pendingDeleteId));
      showToast("success", "Holiday deleted.");
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("error", "Failed to delete holiday.");
    }
    closeDeleteModal();
  }

  /* =========================================================
     EXPORT: CSV / ICS / PDF
  ========================================================= */
  const EXPORT_COLUMNS = ["date", "name", "category", "location", "notes"];
  const EXPORT_HEADERS = [
    "Date",
    "Holiday Name",
    "Category",
    "Location",
    "Notes",
  ];

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (!filteredHolidays.length) {
      showToast("error", "No holidays to export.");
      return;
    }
    const rows = filteredHolidays.map((h) =>
      EXPORT_COLUMNS.map(
        (c) => `"${String(h[c] ?? "").replace(/"/g, '""')}"`,
      ).join(","),
    );
    const csv = [EXPORT_HEADERS.join(","), ...rows].join("\n");
    downloadBlob(csv, `holidays-${Date.now()}.csv`, "text/csv;charset=utf-8;");
    showToast("success", "CSV exported successfully.");
  }

  function buildICS(rows) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WorkSpare//Holidays//EN",
    ];
    rows.forEach((h) => {
      const dateCompact = (h.date || "").replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${h.id}@workspare`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `SUMMARY:${(h.name || "").replace(/\n/g, " ")}`,
        `DESCRIPTION:${h.category || ""} holiday - ${h.location || "All Locations"}`,
        "END:VEVENT",
      );
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function exportCalendar() {
    if (!allHolidays.length) {
      showToast("error", "No holidays to export.");
      return;
    }
    downloadBlob(
      buildICS(allHolidays),
      "holidays.ics",
      "text/calendar;charset=utf-8;",
    );
    showToast("success", "Calendar file (.ics) downloaded.");
  }

  function syncGoogleCalendar() {
    exportCalendar();
    showToast(
      "success",
      "Open Google Calendar → Settings → Import to add these holidays.",
    );
  }

  function downloadPdf() {
    if (!filteredHolidays.length) {
      showToast("error", "No holidays to export.");
      return;
    }
    const headerRow = EXPORT_HEADERS.map((h) => `<th>${h}</th>`).join("");
    const bodyRows = filteredHolidays
      .map(
        (h) =>
          `<tr>${EXPORT_COLUMNS.map((c) => `<td>${escapeHtml(h[c])}</td>`).join("")}</tr>`,
      )
      .join("");
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Holiday List</title>
      <link rel="stylesheet" href="../css/dashboard.css" /></head>
      <body onload="window.print()">
        <table class="data-table"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
      </body></html>`);
    win.document.close();
  }

  function importHolidays() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).slice(1);
      const records = lines
        .map((line) => line.split(","))
        .filter((cols) => cols.length >= 2 && cols[0] && cols[1])
        .map((cols) => ({
          name: cols[0].trim(),
          date: cols[1].trim(),
          category: cols[2]?.trim() || "National",
          location: cols[3]?.trim() || "All Locations",
          departments: ["All Departments"],
          notes: "",
        }));

      if (!records.length) {
        showToast("error", "No valid rows found in the CSV.");
        return;
      }

      try {
        await Promise.all(
          records.map((r) =>
            addDoc(collection(db, "holidays"), {
              ...r,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          ),
        );
        showToast("success", `Imported ${records.length} holiday(s).`);
      } catch (error) {
        console.error("Import failed:", error);
        showToast("error", "Failed to import holidays.");
      }
    });
    input.click();
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    $("#yearSelect")?.addEventListener("change", onHeaderFiltersChange);
    $("#locationSelect")?.addEventListener("change", onHeaderFiltersChange);
    $("#addHolidayBtn")?.addEventListener("click", addHoliday);
    $("#emptyStateAddBtn")?.addEventListener("click", addHoliday);

    $("#calPrevBtn")?.addEventListener("click", () => {
      calCursor = new Date(
        calCursor.getFullYear(),
        calCursor.getMonth() - 1,
        1,
      );
      renderCalendar();
    });
    $("#calNextBtn")?.addEventListener("click", () => {
      calCursor = new Date(
        calCursor.getFullYear(),
        calCursor.getMonth() + 1,
        1,
      );
      renderCalendar();
    });

    $("#holidaySearchInput")?.addEventListener("input", searchHolidays);
    ["filterCategory", "filterLocation", "filterStatus"].forEach((id) =>
      $(`#${id}`)?.addEventListener("change", () => {
        currentPage = 1;
        filterHolidays();
      }),
    );
    $("#resetFiltersBtn")?.addEventListener("click", resetFilters);
    bindDropdown("filtersBtn", "filtersMenu");

    $$("[data-sort]").forEach((th) =>
      th.addEventListener("click", () => handleSortClick(th.dataset.sort)),
    );

    $("#exportBtn")?.addEventListener("click", exportCSV);

    $("#closeHolidayModalBtn")?.addEventListener("click", closeHolidayModal);
    $("#cancelHolidayModalBtn")?.addEventListener("click", closeHolidayModal);
    $("#holidayModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "holidayModalOverlay") closeHolidayModal();
    });
    $("#holidayForm")?.addEventListener("submit", handleFormSubmit);

    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
    $("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);
    $("#deleteModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "deleteModalOverlay") closeDeleteModal();
    });

    $("#qaAddHoliday")?.addEventListener("click", addHoliday);
    $("#qaImport")?.addEventListener("click", importHolidays);
    $("#qaExportCal")?.addEventListener("click", exportCalendar);
    $("#qaSyncGoogle")?.addEventListener("click", syncGoogleCalendar);
    $("#qaDownloadPdf")?.addEventListener("click", downloadPdf);
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    showSkeleton("holidaySkeleton", "holidayTableContent");

    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    populateStaticSelects();
    wireUI();
    await loadDepartments();
    loadHolidays();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
