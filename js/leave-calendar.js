/* ==========================================================
   FIREBASE IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
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
} from "../js/layout.js";

(function () {
  "use strict";

  /* =========================================================
     STATIC DATA
  ========================================================= */
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

  /* =========================================================
     STATE
  ========================================================= */
  let leaveRequests = [];
  let employees = [];
  let holidays = [];
  let departments = [];
  let currentView = "month";
  let cursorDate = new Date();
  let selectedDay = new Date();
  let currentUser = null;
  let unsubLeaves = null;
  let editingLeaveId = null;
  let recentActivity = [];

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

  const toDateOnly = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const sameDay = (a, b) => toDateOnly(a).getTime() === toDateOnly(b).getTime();
  const fmtISO = (d) => {
    const x = toDateOnly(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const initials = (name) =>
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "—";

  const statusClass = (s) =>
    ({ Approved: "approved", Pending: "pending", Rejected: "rejected" })[s] ||
    "pending";

  function parseLeaveDates(leave) {
    const start = leave.startDate ? new Date(leave.startDate) : null;
    const end = leave.endDate ? new Date(leave.endDate) : start;
    return { start, end };
  }

  function leaveCoversDay(leave, day) {
    const { start, end } = parseLeaveDates(leave);
    if (!start) return false;
    return (
      toDateOnly(day) >= toDateOnly(start) &&
      toDateOnly(day) <= toDateOnly(end || start)
    );
  }

  /* =========================================================
     init()
  ========================================================= */
  async function init() {
    currentUser = await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    wireUI();
    await Promise.all([loadEmployees(), loadDepartments(), loadHolidays()]);
    loadLeaveRequests();
  }

  document.addEventListener("DOMContentLoaded", init);

  /* =========================================================
     FIRESTORE LOADERS
  ========================================================= */
  function loadLeaveRequests() {
    const q = query(
      collection(db, "leaveRequests"),
      orderBy("createdAt", "desc"),
    );
    unsubLeaves = onSnapshot(
      q,
      (snap) => {
        leaveRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAll();
      },
      (error) => {
        console.error("Failed to load leave requests:", error);
        showToast("error", "Could not load leave requests.");
        renderAll();
      },
    );
  }

  async function loadEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateEmployeeSelects();
    } catch (error) {
      console.error("Failed to load employees:", error);
    }
  }

  async function loadDepartments() {
    try {
      const snap = await getDocs(collection(db, "departments"));
      departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const opts =
        '<option value="">All Departments</option>' +
        departments
          .map(
            (d) =>
              `<option value="${escapeHtml(d.name || d.id)}">${escapeHtml(d.name || d.id)}</option>`,
          )
          .join("");
      if ($("#filterDepartment")) $("#filterDepartment").innerHTML = opts;
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  }

  async function loadHolidays() {
    try {
      const snap = await getDocs(collection(db, "holidays"));
      holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Failed to load holidays:", error);
    }
  }

  function populateEmployeeSelects() {
    const opts = employees
      .map(
        (e) =>
          `<option value="${e.id}" data-name="${escapeHtml(e.fullName || e.name || "Unnamed")}" data-department="${escapeHtml(e.department || "")}" data-designation="${escapeHtml(e.designation || "")}">${escapeHtml(e.fullName || e.name || "Unnamed")}</option>`,
      )
      .join("");
    if ($("#leaveEmployeeSelect"))
      $("#leaveEmployeeSelect").innerHTML =
        '<option value="">Select employee</option>' + opts;
    if ($("#filterEmployee"))
      $("#filterEmployee").innerHTML =
        '<option value="">All Employees</option>' + opts;
  }

  function refreshCalendar() {
    if (unsubLeaves) unsubLeaves();
    loadLeaveRequests();
  }

  /* =========================================================
     FILTERED DATA
  ========================================================= */
  function getFilteredLeaves() {
    const search = ($("#calSearchInput")?.value || "").trim().toLowerCase();
    const department = $("#filterDepartment")?.value || "";
    const type = $("#filterLeaveType")?.value || "";
    const status = $("#filterStatus")?.value || "";
    const employeeId = $("#filterEmployee")?.value || "";

    return leaveRequests.filter((l) => {
      if (search && !(l.employeeName || "").toLowerCase().includes(search))
        return false;
      if (department && l.department !== department) return false;
      if (type && l.leaveType !== type) return false;
      if (status && l.status !== status) return false;
      if (employeeId && l.employeeId !== employeeId) return false;
      return true;
    });
  }

  /* =========================================================
     RENDER: everything
  ========================================================= */
  function renderAll() {
    renderStatistics();
    renderCalendarNavLabel();
    renderCurrentView();
    renderSidebarWidgets();
    $("#calSkeleton").hidden = true;
    $("#calContent").hidden = false;
  }

  /* =========================================================
     STATISTICS
  ========================================================= */
  function renderStatistics() {
    const total = leaveRequests.length;
    const approved = leaveRequests.filter(
      (l) => l.status === "Approved",
    ).length;
    const pending = leaveRequests.filter((l) => l.status === "Pending").length;
    const today = new Date();
    const onLeaveToday = leaveRequests.filter(
      (l) => l.status === "Approved" && leaveCoversDay(l, today),
    ).length;

    const upcomingHolidays = holidays.filter(
      (h) => h.date && new Date(h.date) >= toDateOnly(today),
    ).length;

    const thisMonth = today.getMonth();
    const birthdaysThisMonth = employees.filter((e) => {
      if (!e.dob) return false;
      const dob = new Date(e.dob);
      return dob.getMonth() === thisMonth;
    }).length;

    setText("statTotalLeaves", total);
    setText("statApproved", approved);
    setText("statPending", pending);
    setText("statOnLeaveToday", onLeaveToday);
    setText("statUpcomingHolidays", upcomingHolidays);
    setText("statBirthdays", birthdaysThisMonth);
  }

  function setText(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value;
  }

  /* =========================================================
     CALENDAR NAV
  ========================================================= */
  function renderCalendarNavLabel() {
    const label = $("#calNavLabel");
    if (!label) return;
    if (currentView === "month") {
      label.textContent = `${MONTHS[cursorDate.getMonth()]} ${cursorDate.getFullYear()}`;
    } else if (currentView === "week") {
      const { start, end } = getWeekRange(cursorDate);
      label.textContent = `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    } else {
      label.textContent = `${MONTHS[cursorDate.getMonth()]} ${cursorDate.getDate()}, ${cursorDate.getFullYear()}`;
    }
  }

  function getWeekRange(date) {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  function renderCurrentView() {
    $("#monthView").hidden = currentView !== "month";
    $("#weekView").hidden = currentView !== "week";
    $("#dayView").hidden = currentView !== "day";

    if (currentView === "month") renderMonthView();
    else if (currentView === "week") renderWeekView();
    else renderDayView();
  }

  /* =========================================================
     EVENTS FOR A GIVEN DAY (leaves + holidays + birthdays)
  ========================================================= */
  function getEventsForDay(day) {
    const events = [];
    const filteredLeaves = getFilteredLeaves();

    filteredLeaves.forEach((l) => {
      if (leaveCoversDay(l, day)) {
        events.push({
          kind: statusClass(l.status),
          label: l.employeeName || "Employee",
          sub: `${l.leaveType || "Leave"} · ${l.duration || "Full Day"}`,
          leaveId: l.id,
          type: "leave",
        });
      }
    });

    holidays.forEach((h) => {
      if (h.date && sameDay(new Date(h.date), day)) {
        events.push({
          kind: "holiday",
          label: h.name || "Holiday",
          sub: h.category || "Holiday",
          type: "holiday",
        });
      }
    });

    employees.forEach((e) => {
      if (e.dob) {
        const dob = new Date(e.dob);
        if (
          dob.getDate() === day.getDate() &&
          dob.getMonth() === day.getMonth()
        ) {
          events.push({
            kind: "birthday",
            label: e.fullName || e.name || "Employee",
            sub: "Birthday",
            type: "birthday",
          });
        }
      }
      if (e.joiningDate) {
        const jd = new Date(e.joiningDate);
        if (
          jd.getDate() === day.getDate() &&
          jd.getMonth() === day.getMonth() &&
          jd.getFullYear() < day.getFullYear()
        ) {
          events.push({
            kind: "anniversary",
            label: e.fullName || e.name || "Employee",
            sub: "Work Anniversary",
            type: "anniversary",
          });
        }
      }
    });

    return events;
  }

  /* =========================================================
     MONTH VIEW
  ========================================================= */
  function renderMonthView() {
    const dowRow = $("#monthDowRow");
    const grid = $("#monthGrid");
    if (!dowRow || !grid) return;

    dowRow.innerHTML = DOW.map(
      (d) => `<div class="calendar-dow">${d}</div>`,
    ).join("");

    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = "";
    for (let i = 0; i < startOffset; i++)
      html += `<div class="calendar-cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const isToday = sameDay(day, today);
      const events = getEventsForDay(day);
      const visible = events.slice(0, 3);
      const overflow = events.length - visible.length;

      html += `
        <div class="calendar-cell ${isWeekend ? "weekend" : ""} ${isToday ? "today" : ""}" data-date="${fmtISO(day)}">
          <span class="calendar-cell-date">${d}</span>
          ${visible.map((ev) => eventPillTemplate(ev)).join("")}
          ${overflow > 0 ? `<span class="event-more" data-date="${fmtISO(day)}">+${overflow} more</span>` : ""}
        </div>`;
    }

    const totalCells = startOffset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++)
      html += `<div class="calendar-cell empty"></div>`;

    grid.innerHTML = html;
    wireCalendarCellEvents(grid);
  }

  function eventPillTemplate(ev) {
    return `<div class="event-pill ${ev.kind}" data-leave-id="${ev.leaveId || ""}" data-type="${ev.type}" title="${escapeHtml(ev.label)} — ${escapeHtml(ev.sub)}">
      <span class="avatar-dot">${initials(ev.label).slice(0, 1)}</span>${escapeHtml(ev.label)}
    </div>`;
  }

  function wireCalendarCellEvents(container) {
    $$(".event-pill[data-leave-id]", container).forEach((pill) => {
      if (!pill.dataset.leaveId) return;
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        openLeaveDetailsModal(pill.dataset.leaveId);
      });
    });
    $$(".event-more", container).forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cursorDate = new Date(btn.dataset.date);
        selectedDay = new Date(btn.dataset.date);
        setView("day");
      }),
    );
    $$(".calendar-cell[data-date]", container).forEach((cell) =>
      cell.addEventListener("click", () => {
        selectedDay = new Date(cell.dataset.date);
        cursorDate = new Date(cell.dataset.date);
        setView("day");
      }),
    );
  }

  /* =========================================================
     WEEK VIEW
  ========================================================= */
  function renderWeekView() {
    const grid = $("#weekGrid");
    if (!grid) return;
    const { start } = getWeekRange(cursorDate);
    const today = new Date();

    let html = "";
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const events = getEventsForDay(day);
      const isToday = sameDay(day, today);

      html += `
        <div class="week-col ${isToday ? "today" : ""}" data-date="${fmtISO(day)}">
          <div class="week-col-head">
            <div class="week-col-dow">${DOW[day.getDay()]}</div>
            <div class="week-col-date">${day.getDate()}</div>
          </div>
          ${events.map((ev) => eventPillTemplate(ev)).join("") || `<span style="font-size:11px;color:var(--panel-light-text-muted);text-align:center;padding-top:8px;">No events</span>`}
        </div>`;
    }
    grid.innerHTML = html;
    wireCalendarCellEvents(grid);
  }

  /* =========================================================
     DAY VIEW
  ========================================================= */
  function renderDayView() {
    const label = $("#dayViewLabel");
    const agenda = $("#dayAgenda");
    if (!label || !agenda) return;

    const day = selectedDay;
    label.textContent = day.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const events = getEventsForDay(day);
    if (!events.length) {
      agenda.innerHTML = `<div class="day-agenda-empty">No leaves, holidays, or events on this day.</div>`;
      return;
    }

    agenda.innerHTML = events
      .map(
        (ev) => `
      <div class="day-event-card" data-leave-id="${ev.leaveId || ""}">
        <div class="day-event-stripe ${ev.kind}"></div>
        <div class="day-event-avatar">${initials(ev.label)}</div>
        <div class="day-event-info">
          <div class="day-event-name">${escapeHtml(ev.label)}</div>
          <div class="day-event-meta">${escapeHtml(ev.sub)}</div>
        </div>
      </div>`,
      )
      .join("");

    $$(".day-event-card[data-leave-id]", agenda).forEach((card) => {
      if (!card.dataset.leaveId) return;
      card.addEventListener("click", () =>
        openLeaveDetailsModal(card.dataset.leaveId),
      );
    });
  }

  /* =========================================================
     VIEW SWITCHING + NAVIGATION
  ========================================================= */
  function setView(view) {
    currentView = view;
    $$(".view-switch button").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.view === view),
    );
    renderCalendarNavLabel();
    renderCurrentView();
  }

  function navigatePrev() {
    if (currentView === "month")
      cursorDate = new Date(
        cursorDate.getFullYear(),
        cursorDate.getMonth() - 1,
        1,
      );
    else if (currentView === "week") {
      cursorDate = new Date(cursorDate);
      cursorDate.setDate(cursorDate.getDate() - 7);
    } else {
      selectedDay = new Date(selectedDay);
      selectedDay.setDate(selectedDay.getDate() - 1);
      cursorDate = new Date(selectedDay);
    }
    renderCalendarNavLabel();
    renderCurrentView();
  }

  function navigateNext() {
    if (currentView === "month")
      cursorDate = new Date(
        cursorDate.getFullYear(),
        cursorDate.getMonth() + 1,
        1,
      );
    else if (currentView === "week") {
      cursorDate = new Date(cursorDate);
      cursorDate.setDate(cursorDate.getDate() + 7);
    } else {
      selectedDay = new Date(selectedDay);
      selectedDay.setDate(selectedDay.getDate() + 1);
      cursorDate = new Date(selectedDay);
    }
    renderCalendarNavLabel();
    renderCurrentView();
  }

  function goToday() {
    cursorDate = new Date();
    selectedDay = new Date();
    renderCalendarNavLabel();
    renderCurrentView();
  }

  /* =========================================================
     RIGHT SIDEBAR WIDGETS
  ========================================================= */
  function renderSidebarWidgets() {
    const today = new Date();

    const todays = leaveRequests.filter(
      (l) => l.status === "Approved" && leaveCoversDay(l, today),
    );
    renderMiniList(
      "todaysLeavesList",
      todays,
      (l) => ({
        title: l.employeeName,
        meta: `${l.leaveType || "Leave"} · ${l.duration || "Full Day"}`,
        color: "var(--color-success)",
      }),
      "No one is on leave today.",
    );

    const upcoming = leaveRequests
      .filter(
        (l) =>
          l.status === "Approved" &&
          parseLeaveDates(l).start &&
          toDateOnly(parseLeaveDates(l).start) > toDateOnly(today),
      )
      .sort(
        (a, b) =>
          toMillis(new Date(a.startDate)) - toMillis(new Date(b.startDate)),
      )
      .slice(0, 5);
    renderMiniList(
      "upcomingLeavesList",
      upcoming,
      (l) => ({
        title: l.employeeName,
        meta: `${l.leaveType || "Leave"} · ${new Date(l.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
        color: "var(--stat-blue)",
      }),
      "No upcoming leaves.",
    );

    const upcomingBdays = employees
      .filter((e) => e.dob)
      .map((e) => {
        const dob = new Date(e.dob);
        const next = new Date(
          today.getFullYear(),
          dob.getMonth(),
          dob.getDate(),
        );
        if (next < toDateOnly(today)) next.setFullYear(today.getFullYear() + 1);
        return { ...e, next };
      })
      .sort((a, b) => a.next - b.next)
      .slice(0, 5);
    renderMiniList(
      "upcomingBirthdaysList",
      upcomingBdays,
      (e) => ({
        title: e.fullName || e.name,
        meta: e.next.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        }),
        color: "#ec4899",
      }),
      "No upcoming birthdays.",
    );

    const upcomingHolidays = holidays
      .filter((h) => h.date && new Date(h.date) >= toDateOnly(today))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);
    renderMiniList(
      "upcomingHolidaysList",
      upcomingHolidays,
      (h) => ({
        title: h.name,
        meta: new Date(h.date).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        }),
        color: "var(--stat-blue)",
      }),
      "No upcoming holidays.",
    );

    const recent = [...leaveRequests]
      .sort(
        (a, b) =>
          toMillis(b.updatedAt || b.createdAt) -
          toMillis(a.updatedAt || a.createdAt),
      )
      .slice(0, 5);
    const activityWrap = $("#recentActivityList");
    if (activityWrap) {
      activityWrap.innerHTML = recent.length
        ? recent
            .map(
              (l) => `
            <div class="activity-item">
              <div class="activity-icon"><i class="ri-calendar-event-line"></i></div>
              <div class="activity-body">
                <strong>${escapeHtml(l.employeeName)}</strong>'s ${escapeHtml(l.leaveType || "leave")} is ${escapeHtml((l.status || "pending").toLowerCase())}
                <span class="activity-time">${new Date(toMillis(l.updatedAt || l.createdAt)).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              </div>
            </div>`,
            )
            .join("")
        : `<p class="mini-empty">No recent activity.</p>`;
    }
  }

  function renderMiniList(containerId, items, mapFn, emptyText) {
    const wrap = $(`#${containerId}`);
    if (!wrap) return;
    if (!items.length) {
      wrap.innerHTML = `<p class="mini-empty">${emptyText}</p>`;
      return;
    }
    wrap.innerHTML = items
      .map((item) => {
        const { title, meta, color } = mapFn(item);
        return `
        <div class="mini-item">
          <span class="mini-dot" style="background:${color}"></span>
          <div class="mini-body">
            <div class="mini-title">${escapeHtml(title || "—")}</div>
            <div class="mini-meta">${escapeHtml(meta || "")}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  /* =========================================================
     LEAVE DETAILS MODAL
  ========================================================= */
  function openLeaveDetailsModal(id) {
    const leave = leaveRequests.find((l) => l.id === id);
    if (!leave) return;

    $("#leaveDetailsTitle").textContent = "Leave Details";
    $("#leaveDetailsBody").innerHTML = `
      <div class="detail-hero">
        <div class="detail-avatar">${initials(leave.employeeName)}</div>
        <div>
          <div class="detail-name">${escapeHtml(leave.employeeName || "—")}</div>
          <div class="detail-role">${escapeHtml(leave.department || "—")} · ${escapeHtml(leave.designation || "—")}</div>
        </div>
      </div>
      <div class="detail-info-grid">
        <div class="detail-info-item"><span class="detail-info-label">Leave Type</span><span class="detail-info-value">${escapeHtml(leave.leaveType || "—")}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Duration</span><span class="detail-info-value">${escapeHtml(leave.duration || "Full Day")}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Start Date</span><span class="detail-info-value">${leave.startDate ? new Date(leave.startDate).toLocaleDateString("en-GB") : "—"}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">End Date</span><span class="detail-info-value">${leave.endDate ? new Date(leave.endDate).toLocaleDateString("en-GB") : "—"}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Status</span><span class="status-badge status-badge--${statusClass(leave.status)}">${escapeHtml(leave.status || "Pending")}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Approved By</span><span class="detail-info-value">${escapeHtml(leave.approvedBy || "—")}</span></div>
        <div class="detail-info-item"><span class="detail-info-label">Applied Date</span><span class="detail-info-value">${leave.createdAt ? new Date(toMillis(leave.createdAt)).toLocaleDateString("en-GB") : "—"}</span></div>
      </div>
      <div class="detail-info-label" style="margin-bottom:6px;">Reason</div>
      <div class="detail-reason">${escapeHtml(leave.reason || "No reason provided.")}</div>
      ${leave.notes ? `<div class="detail-info-label" style="margin:14px 0 6px;">Notes</div><div class="detail-reason">${escapeHtml(leave.notes)}</div>` : ""}
    `;

    const footer = $("#leaveDetailsFooter");
    const canModerate = leave.status === "Pending";
    footer.innerHTML = `
      ${canModerate ? `<button class="btn btn-success" id="approveLeaveBtn"><i class="ri-check-line"></i> Approve</button>` : ""}
      ${canModerate ? `<button class="btn btn-danger" id="rejectLeaveBtn"><i class="ri-close-line"></i> Reject</button>` : ""}
      <button class="btn btn-outline" id="editLeaveBtn"><i class="ri-pencil-line"></i> Edit</button>
      <button class="btn btn-ghost" id="closeLeaveDetailsFooterBtn">Close</button>
    `;

    $("#approveLeaveBtn")?.addEventListener("click", () =>
      updateLeaveStatus(id, "Approved"),
    );
    $("#rejectLeaveBtn")?.addEventListener("click", () =>
      updateLeaveStatus(id, "Rejected"),
    );
    $("#editLeaveBtn")?.addEventListener("click", () => {
      closeLeaveDetailsModal();
      openLeaveFormModal(id);
    });
    $("#closeLeaveDetailsFooterBtn")?.addEventListener(
      "click",
      closeLeaveDetailsModal,
    );

    $("#leaveDetailsModalOverlay").hidden = false;
  }

  function closeLeaveDetailsModal() {
    $("#leaveDetailsModalOverlay").hidden = true;
  }

  async function updateLeaveStatus(id, status) {
    try {
      await updateDoc(doc(db, "leaveRequests", id), {
        status,
        approvedBy:
          status === "Approved" ? currentUser?.fullName || "Admin" : "",
        updatedAt: serverTimestamp(),
      });
      showToast("success", `Leave ${status.toLowerCase()}.`);
      closeLeaveDetailsModal();
    } catch (error) {
      console.error("Update status failed:", error);
      showToast("error", "Could not update leave status.");
    }
  }

  /* =========================================================
     ADD / EDIT LEAVE MODAL
  ========================================================= */
  function openLeaveFormModal(id = null) {
    editingLeaveId = id;
    const form = $("#leaveForm");
    form.reset();
    $("#leaveDocId").value = "";

    if (id) {
      const leave = leaveRequests.find((l) => l.id === id);
      if (!leave) return;
      $("#leaveFormTitle").textContent = "Edit Leave";
      $("#leaveDocId").value = id;
      $("#leaveEmployeeSelect").value = leave.employeeId || "";
      $("#leaveTypeSelect").value = leave.leaveType || "Sick Leave";
      $("#leaveDurationSelect").value = leave.duration || "Full Day";
      $("#leaveStartDate").value = leave.startDate || "";
      $("#leaveEndDate").value = leave.endDate || "";
      $("#leaveReasonInput").value = leave.reason || "";
      $("#leaveStatusSelect").value = leave.status || "Pending";
    } else {
      $("#leaveFormTitle").textContent = "Add Leave";
      $("#leaveStartDate").value = fmtISO(selectedDay);
      $("#leaveEndDate").value = fmtISO(selectedDay);
    }

    $("#leaveFormModalOverlay").hidden = false;
  }

  function closeLeaveFormModal() {
    $("#leaveFormModalOverlay").hidden = true;
    editingLeaveId = null;
  }

  async function handleLeaveFormSubmit(e) {
    e.preventDefault();
    const empSelect = $("#leaveEmployeeSelect");
    const empOption = empSelect.selectedOptions[0];
    if (!empOption || !empOption.value) {
      showToast("error", "Please select an employee.");
      return;
    }

    const payload = {
      employeeId: empOption.value,
      employeeName: empOption.dataset.name || "",
      department: empOption.dataset.department || "",
      designation: empOption.dataset.designation || "",
      leaveType: $("#leaveTypeSelect").value,
      duration: $("#leaveDurationSelect").value,
      startDate: $("#leaveStartDate").value,
      endDate: $("#leaveEndDate").value,
      reason: $("#leaveReasonInput").value || "",
      status: $("#leaveStatusSelect").value,
    };

    try {
      if (editingLeaveId) {
        await updateDoc(doc(db, "leaveRequests", editingLeaveId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Leave updated.");
      } else {
        await addDoc(collection(db, "leaveRequests"), {
          ...payload,
          approvedBy: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Leave added to calendar.");
      }
      closeLeaveFormModal();
    } catch (error) {
      console.error("Save leave failed:", error);
      showToast("error", "Could not save leave.");
    }
  }

  /* =========================================================
     EXPORT CALENDAR (simple print-based export)
  ========================================================= */
  function exportCalendar() {
    window.print();
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    $$(".view-switch button").forEach((btn) =>
      btn.addEventListener("click", () => setView(btn.dataset.view)),
    );
    $("#todayBtn")?.addEventListener("click", goToday);
    $("#prevBtn")?.addEventListener("click", navigatePrev);
    $("#nextBtn")?.addEventListener("click", navigateNext);
    $("#exportCalendarBtn")?.addEventListener("click", exportCalendar);
    $("#addLeaveBtn")?.addEventListener("click", () => openLeaveFormModal());

    $("#calSearchInput")?.addEventListener("input", renderAll);
    [
      "filterDepartment",
      "filterLeaveType",
      "filterStatus",
      "filterEmployee",
    ].forEach((id) => $(`#${id}`)?.addEventListener("change", renderAll));
    $("#resetFiltersBtn")?.addEventListener("click", () => {
      $("#calSearchInput").value = "";
      $("#filterDepartment").value = "";
      $("#filterLeaveType").value = "";
      $("#filterStatus").value = "";
      $("#filterEmployee").value = "";
      renderAll();
    });

    $("#closeLeaveDetailsBtn")?.addEventListener(
      "click",
      closeLeaveDetailsModal,
    );
    $("#closeLeaveFormBtn")?.addEventListener("click", closeLeaveFormModal);
    $("#cancelLeaveFormBtn")?.addEventListener("click", closeLeaveFormModal);
    $("#leaveForm")?.addEventListener("submit", handleLeaveFormSubmit);

    $$(".modal-overlay").forEach((overlay) =>
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.hidden = true;
      }),
    );
  }
})();
