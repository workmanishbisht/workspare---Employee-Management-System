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
  increment,
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
     STATIC CONTENT
     ----------------------------------------------------------
     FAQs and video tutorials aren't in the Firestore schema
     given for this module (only helpArticles, supportTickets,
     bugReports, featureRequests, releaseNotes are), so they're
     seeded here. Swap CATEGORY_META/FAQS/VIDEOS for a Firestore
     read the same way loadArticles() does if they move server-side.
  ========================================================= */
  const CATEGORY_META = [
    { key: "Getting Started", icon: "ri-flag-2-fill" },
    { key: "Employees", icon: "ri-user-3-fill" },
    { key: "Departments", icon: "ri-building-4-fill" },
    { key: "Attendance", icon: "ri-calendar-check-fill" },
    { key: "Leave Management", icon: "ri-logout-box-r-fill" },
    { key: "Payroll", icon: "ri-bank-card-fill" },
    { key: "Holidays", icon: "ri-sun-fill" },
    { key: "Documents", icon: "ri-file-text-fill" },
    { key: "Notifications", icon: "ri-notification-3-fill" },
    { key: "Reports", icon: "ri-bar-chart-box-fill" },
    { key: "Settings", icon: "ri-settings-3-fill" },
    { key: "Security", icon: "ri-shield-check-fill" },
  ];

  const FAQS = [
    {
      q: "How do I add an employee?",
      a: 'Go to Employees → click "Add Employee", fill in their personal, job, and contact details, then save. The new employee appears in the table immediately.',
    },
    {
      q: "How do I approve leave requests?",
      a: "Open Leave Management or the Leave Calendar, click on a pending request, review the details, and click Approve or Reject.",
    },
    {
      q: "How do I process payroll?",
      a: "Go to Payroll → Generate Payroll, select the employee and month, enter salary components, and the system auto-calculates gross, deductions, and net salary.",
    },
    {
      q: "How do I generate reports?",
      a: "Open the Reports module, choose a report type and date range, then export as PDF or CSV.",
    },
    {
      q: "How do I reset my password?",
      a: 'Click your profile avatar → Change Password, or use "Forgot Password" on the login screen to receive a reset link by email.',
    },
    {
      q: "How do I manage holidays?",
      a: "Go to Holidays → Add Holiday, set the date, category (National, Festival, Optional), and applicable locations or departments.",
    },
    {
      q: "How do I upload employee documents?",
      a: "Open Documents → Upload Document, choose the file, tag it to a folder, department, or specific employee, then upload.",
    },
  ];

  const VIDEOS = [
    {
      title: "Getting Started with WorkSpare",
      duration: "4:12",
      category: "Getting Started",
    },
    {
      title: "Adding & Managing Employees",
      duration: "6:45",
      category: "Employees",
    },
    {
      title: "Approving Leave Requests",
      duration: "3:58",
      category: "Leave Management",
    },
    {
      title: "Running Payroll End-to-End",
      duration: "8:21",
      category: "Payroll",
    },
    {
      title: "Setting Up Holiday Calendars",
      duration: "3:10",
      category: "Holidays",
    },
    {
      title: "Generating Custom Reports",
      duration: "5:33",
      category: "Reports",
    },
  ];

  /* =========================================================
     STATE
  ========================================================= */
  let articles = [];
  let tickets = [];
  let releaseNotes = [];
  let bookmarks = new Set(
    JSON.parse(localStorage.getItem("hrms:helpBookmarks") || "[]"),
  );
  let currentUser = null;

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

  const formatDate = (ts) =>
    ts
      ? new Date(toMillis(ts)).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  function genTicketId() {
    return "TKT-" + Math.random().toString(36).slice(2, 7).toUpperCase();
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
    renderCategories();
    renderFaqs(FAQS);
    renderVideos(VIDEOS);
    loadArticles();
    loadTickets();
    loadReleaseNotes();
  }

  document.addEventListener("DOMContentLoaded", init);

  /* =========================================================
     FIRESTORE: ARTICLES (realtime)
  ========================================================= */
  function loadArticles() {
    const q = query(
      collection(db, "helpArticles"),
      orderBy("createdAt", "desc"),
    );
    onSnapshot(
      q,
      (snap) => {
        articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStatistics();
        renderCategories();
        renderArticles();
        $("#articlesSkeleton").hidden = true;
        $("#articleList").hidden = false;
      },
      (error) => {
        console.error("Failed to load help articles:", error);
        $("#articlesSkeleton").hidden = true;
        $("#articleList").hidden = false;
        renderArticles();
      },
    );
  }

  /* =========================================================
     FIRESTORE: SUPPORT TICKETS (realtime)
  ========================================================= */
  function loadTickets() {
    const q = query(
      collection(db, "supportTickets"),
      orderBy("createdAt", "desc"),
    );
    onSnapshot(
      q,
      (snap) => {
        tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderStatistics();
        renderTickets();
        $("#ticketsSkeleton").hidden = true;
        $("#ticketsContent").hidden = false;
      },
      (error) => {
        console.error("Failed to load support tickets:", error);
        $("#ticketsSkeleton").hidden = true;
        $("#ticketsContent").hidden = false;
        renderTickets();
      },
    );
  }

  /* =========================================================
     FIRESTORE: RELEASE NOTES
  ========================================================= */
  async function loadReleaseNotes() {
    try {
      const snap = await getDocs(
        query(collection(db, "releaseNotes"), orderBy("releaseDate", "desc")),
      );
      releaseNotes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error("Failed to load release notes:", error);
      releaseNotes = [];
    }
    renderStatistics();
    renderReleaseNotes();
    renderLatestUpdateWidget();
  }

  /* =========================================================
     STATISTICS
  ========================================================= */
  function renderStatistics() {
    const openTickets = tickets.filter(
      (t) => t.status === "Open" || t.status === "Pending",
    ).length;
    const resolvedTickets = tickets.filter(
      (t) => t.status === "Resolved" || t.status === "Closed",
    );
    const avgResponseHrs = resolvedTickets.length
      ? Math.round(
          resolvedTickets.reduce(
            (sum, t) => sum + (toMillis(t.updatedAt) - toMillis(t.createdAt)),
            0,
          ) /
            resolvedTickets.length /
            36e5,
        )
      : null;

    setText("statArticles", articles.length);
    setText("statFaqs", FAQS.length);
    setText("statOpenTickets", openTickets);
    setText(
      "statResponseTime",
      avgResponseHrs !== null ? `${avgResponseHrs}h` : "—",
    );
    setText("statVideos", VIDEOS.length);
    setText("statUpdates", releaseNotes.length);
  }

  function setText(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value;
  }

  /* =========================================================
     QUICK HELP CATEGORIES
  ========================================================= */
  function renderCategories() {
    const grid = $("#categoryGrid");
    if (!grid) return;

    grid.innerHTML = CATEGORY_META.map((cat) => {
      const count = articles.filter((a) => a.category === cat.key).length;
      return `
        <div class="category-card" data-category="${escapeHtml(cat.key)}">
          <div class="category-icon"><i class="${cat.icon}"></i></div>
          <h4>${escapeHtml(cat.key)}</h4>
          <p>Guides and answers related to ${escapeHtml(cat.key)}.</p>
          <div class="category-card-foot">
            <span class="category-count">${count} article${count === 1 ? "" : "s"}</span>
            <button class="category-view-btn" data-view-category="${escapeHtml(cat.key)}">View <i class="ri-arrow-right-s-line"></i></button>
          </div>
        </div>`;
    }).join("");

    $$("[data-view-category]", grid).forEach((btn) =>
      btn.addEventListener("click", () => {
        $("#globalSearchInput").value = "";
        document
          .querySelectorAll(".article-row")
          .forEach((r) => (r.style.display = ""));
        filterArticlesByCategory(btn.dataset.viewCategory);
        $("#articleList")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }),
    );
  }

  function filterArticlesByCategory(category) {
    const filtered = articles.filter((a) => a.category === category);
    renderArticleList(filtered, `No articles yet in "${category}".`);
  }

  /* =========================================================
     POPULAR ARTICLES
  ========================================================= */
  function renderArticles() {
    const sort = $("#articleSortSelect")?.value || "views-desc";
    let rows = [...articles];
    rows.sort((a, b) =>
      sort === "date-desc"
        ? toMillis(b.createdAt) - toMillis(a.createdAt)
        : (b.views || 0) - (a.views || 0),
    );
    renderArticleList(rows, "No articles have been published yet.");
  }

  function renderArticleList(rows, emptyText) {
    const list = $("#articleList");
    const empty = $("#articlesEmptyState");
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.querySelector("p").textContent = emptyText;
      return;
    }
    empty.hidden = true;

    list.innerHTML = rows
      .map(
        (a) => `
      <div class="article-row" data-id="${a.id}">
        <div class="article-icon"><i class="ri-file-text-line"></i></div>
        <div class="article-info">
          <div class="article-title">${escapeHtml(a.title)}</div>
          <div class="article-meta">
            <span><i class="ri-price-tag-3-line"></i> ${escapeHtml(a.category || "General")}</span>
            <span><i class="ri-time-line"></i> ${escapeHtml(a.readingTime || "3 min")}</span>
            <span><i class="ri-eye-line"></i> ${a.views || 0} views</span>
            <span><i class="ri-history-line"></i> ${formatDate(a.updatedAt || a.createdAt)}</span>
          </div>
        </div>
        <button class="bookmark-btn ${bookmarks.has(a.id) ? "active" : ""}" data-id="${a.id}" title="Bookmark">
          <i class="${bookmarks.has(a.id) ? "ri-bookmark-fill" : "ri-bookmark-line"}"></i>
        </button>
      </div>`,
      )
      .join("");

    $$(".article-row", list).forEach((row) =>
      row.addEventListener("click", (e) => {
        if (e.target.closest(".bookmark-btn")) return;
        incrementArticleViews(row.dataset.id);
      }),
    );
    $$(".bookmark-btn", list).forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark(btn.dataset.id, btn);
      }),
    );
  }

  async function incrementArticleViews(id) {
    try {
      await updateDoc(doc(db, "helpArticles", id), { views: increment(1) });
    } catch (error) {
      console.error("View tracking failed:", error);
    }
  }

  function toggleBookmark(id, btn) {
    if (bookmarks.has(id)) {
      bookmarks.delete(id);
      btn.classList.remove("active");
      btn.querySelector("i").className = "ri-bookmark-line";
    } else {
      bookmarks.add(id);
      btn.classList.add("active");
      btn.querySelector("i").className = "ri-bookmark-fill";
      showToast("success", "Article bookmarked.");
    }
    localStorage.setItem("hrms:helpBookmarks", JSON.stringify([...bookmarks]));
  }

  /* =========================================================
     FAQ ACCORDION
  ========================================================= */
  function renderFaqs(list) {
    const wrap = $("#faqList");
    const empty = $("#faqEmptyState");
    if (!wrap) return;

    if (!list.length) {
      wrap.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    wrap.innerHTML = list
      .map(
        (faq, i) => `
      <div class="faq-item" data-index="${i}">
        <button class="faq-question" type="button">
          <span>${escapeHtml(faq.q)}</span>
          <i class="ri-arrow-down-s-line"></i>
        </button>
        <div class="faq-answer"><div class="faq-answer-inner">${escapeHtml(faq.a)}</div></div>
      </div>`,
      )
      .join("");

    $$(".faq-question", wrap).forEach((btn) =>
      btn.addEventListener("click", () =>
        btn.closest(".faq-item").classList.toggle("open"),
      ),
    );
  }

  /* =========================================================
     VIDEO TUTORIALS
  ========================================================= */
  function renderVideos(list) {
    const grid = $("#videoGrid");
    if (!grid) return;
    grid.innerHTML = list
      .map(
        (v) => `
      <div class="video-card">
        <div class="video-thumb"><i class="ri-play-circle-fill"></i><span class="video-duration">${escapeHtml(v.duration)}</span></div>
        <div class="video-body">
          <div class="video-title">${escapeHtml(v.title)}</div>
          <div class="video-meta"><span class="video-category">${escapeHtml(v.category)}</span></div>
          <button class="btn btn-outline btn-sm btn-block" data-watch="${escapeHtml(v.title)}"><i class="ri-play-fill"></i> Watch Tutorial</button>
        </div>
      </div>`,
      )
      .join("");

    $$("[data-watch]", grid).forEach((btn) =>
      btn.addEventListener("click", () =>
        showToast("success", `Playing "${btn.dataset.watch}"...`),
      ),
    );
  }

  /* =========================================================
     RELEASE NOTES TIMELINE
  ========================================================= */
  function renderReleaseNotes() {
    const wrap = $("#releaseTimeline");
    if (!wrap) return;

    if (!releaseNotes.length) {
      wrap.innerHTML = `<div class="empty-state"><i class="ri-rocket-2-line"></i><h3>No Release Notes Yet</h3><p>Check back soon for product updates.</p></div>`;
      return;
    }

    wrap.innerHTML = releaseNotes
      .map(
        (r) => `
      <div class="timeline-item">
        <div class="timeline-dot"><i class="ri-rocket-2-fill"></i></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <span class="timeline-version">${escapeHtml(r.version || "")}</span>
            <span class="timeline-date">${r.releaseDate ? new Date(r.releaseDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : ""}</span>
          </div>
          ${renderReleaseSection("New Features", r.newFeatures)}
          ${renderReleaseSection("Improvements", r.improvements)}
          ${renderReleaseSection("Bug Fixes", r.bugFixes)}
        </div>
      </div>`,
      )
      .join("");
  }

  function renderReleaseSection(label, items) {
    if (!items || !items.length) return "";
    return `
      <div class="timeline-section">
        <div class="timeline-section-label">${label}</div>
        <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>`;
  }

  function renderLatestUpdateWidget() {
    const wrap = $("#latestUpdateWidget");
    if (!wrap) return;
    const latest = releaseNotes[0];
    wrap.innerHTML = latest
      ? `<div class="mini-title" style="font-size:14px;font-weight:800;">${escapeHtml(latest.version)}</div>
         <div class="mini-meta" style="margin-top:4px;font-size:12px;color:var(--panel-light-text-muted);">${latest.releaseDate ? new Date(latest.releaseDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>`
      : `<p style="font-size:12.5px;color:var(--panel-light-text-muted);">No updates yet.</p>`;
  }

  /* =========================================================
     SUPPORT TICKETS TABLE
  ========================================================= */
  function renderTickets() {
    const search = ($("#ticketSearchInput")?.value || "").trim().toLowerCase();
    const status = $("#filterTicketStatus")?.value || "";
    const priority = $("#filterTicketPriority")?.value || "";

    let rows = [...tickets];
    if (search)
      rows = rows.filter(
        (t) =>
          (t.subject || "").toLowerCase().includes(search) ||
          (t.ticketId || "").toLowerCase().includes(search),
      );
    if (status) rows = rows.filter((t) => t.status === status);
    if (priority) rows = rows.filter((t) => t.priority === priority);

    const tbody = $("#ticketsTableBody");
    const tableWrap = $("#ticketsTableWrap");
    const empty = $("#ticketsEmptyState");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = "";
      tableWrap.style.display = "none";
      empty.hidden = false;
      return;
    }
    tableWrap.style.display = "block";
    empty.hidden = true;

    tbody.innerHTML = rows
      .map(
        (t) => `
      <tr>
        <td class="ticket-id">${escapeHtml(t.ticketId || t.id)}</td>
        <td>${escapeHtml(t.subject || "—")}</td>
        <td>${escapeHtml(t.category || "—")}</td>
        <td><span class="priority-badge priority-badge--${(t.priority || "low").toLowerCase()}">${escapeHtml(t.priority || "Low")}</span></td>
        <td><span class="status-badge status-badge--${(t.status || "open").toLowerCase()}">${escapeHtml(t.status || "Open")}</span></td>
        <td>${formatDate(t.createdAt)}</td>
        <td>${formatDate(t.updatedAt || t.createdAt)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="row-action-btn" data-view-ticket="${t.id}" title="View"><i class="ri-eye-line"></i></button>
          </div>
        </td>
      </tr>`,
      )
      .join("");

    $$("[data-view-ticket]", tbody).forEach((btn) =>
      btn.addEventListener("click", () => {
        const t = tickets.find((x) => x.id === btn.dataset.viewTicket);
        if (t)
          showToast("success", `${t.ticketId || t.id}: ${t.status || "Open"}`);
      }),
    );
  }

  /* =========================================================
     GLOBAL SEARCH (articles + FAQs + videos + release notes)
  ========================================================= */
  function runGlobalSearch() {
    const term = ($("#globalSearchInput")?.value || "").trim().toLowerCase();
    const resultsWrap = $("#globalSearchResults");
    if (!term) {
      resultsWrap.hidden = true;
      resultsWrap.innerHTML = "";
      return;
    }

    const results = [];
    articles.forEach((a) => {
      if ((a.title || "").toLowerCase().includes(term))
        results.push({
          icon: "ri-file-text-line",
          label: a.title,
          tag: "Article",
        });
    });
    FAQS.forEach((f) => {
      if (f.q.toLowerCase().includes(term))
        results.push({ icon: "ri-question-line", label: f.q, tag: "FAQ" });
    });
    VIDEOS.forEach((v) => {
      if (v.title.toLowerCase().includes(term))
        results.push({
          icon: "ri-play-circle-line",
          label: v.title,
          tag: "Video",
        });
    });
    releaseNotes.forEach((r) => {
      if ((r.version || "").toLowerCase().includes(term))
        results.push({
          icon: "ri-rocket-2-line",
          label: r.version,
          tag: "Release",
        });
    });

    if (!results.length) {
      resultsWrap.hidden = false;
      resultsWrap.innerHTML = `<div class="help-search-result-item"><i class="ri-search-line"></i> No results for "${escapeHtml(term)}"</div>`;
      return;
    }

    resultsWrap.hidden = false;
    resultsWrap.innerHTML = results
      .slice(0, 8)
      .map(
        (r) => `
      <div class="help-search-result-item">
        <i class="${r.icon}"></i> ${escapeHtml(r.label)}
        <span class="help-search-result-tag">${r.tag}</span>
      </div>`,
      )
      .join("");
  }

  /* =========================================================
     MODAL: CONTACT SUPPORT → creates a supportTickets doc
  ========================================================= */
  async function handleContactSubmit(e) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "supportTickets"), {
        ticketId: genTicketId(),
        name: $("#contactNameInput").value.trim(),
        email: $("#contactEmailInput").value.trim(),
        subject: $("#contactSubjectInput").value.trim(),
        category: $("#contactCategorySelect").value,
        priority: $("#contactPrioritySelect").value,
        message: $("#contactMessageInput").value.trim(),
        status: "Open",
        createdBy: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Support ticket submitted.");
      closeModal("contactModalOverlay");
      $("#contactForm").reset();
    } catch (error) {
      console.error("Contact submit failed:", error);
      showToast("error", "Could not submit your message.");
    }
  }

  /* =========================================================
     MODAL: REPORT BUG → creates a bugReports doc
  ========================================================= */
  async function handleBugSubmit(e) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "bugReports"), {
        title: $("#bugTitleInput").value.trim(),
        module: $("#bugModuleSelect").value,
        priority: $("#bugPrioritySelect").value,
        browser: $("#bugBrowserSelect").value,
        description: $("#bugDescriptionInput").value.trim(),
        status: "Open",
        reportedBy: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Bug report submitted. Thank you!");
      closeModal("bugModalOverlay");
      $("#bugForm").reset();
    } catch (error) {
      console.error("Bug submit failed:", error);
      showToast("error", "Could not submit the bug report.");
    }
  }

  /* =========================================================
     MODAL: FEATURE REQUEST → creates a featureRequests doc
  ========================================================= */
  async function handleFeatureSubmit(e) {
    e.preventDefault();
    try {
      await addDoc(collection(db, "featureRequests"), {
        title: $("#featureTitleInput").value.trim(),
        module: $("#featureModuleSelect").value,
        businessReason: $("#featureReasonInput").value.trim(),
        description: $("#featureDescriptionInput").value.trim(),
        status: "Submitted",
        requestedBy: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Feature request submitted.");
      closeModal("featureModalOverlay");
      $("#featureForm").reset();
    } catch (error) {
      console.error("Feature submit failed:", error);
      showToast("error", "Could not submit your request.");
    }
  }

  /* =========================================================
     MODAL HELPERS
  ========================================================= */
  function openModal(id) {
    $(`#${id}`).hidden = false;
  }
  function closeModal(id) {
    $(`#${id}`).hidden = true;
  }

  function setupFileDrop(zoneId, inputId, labelId) {
    const zone = $(`#${zoneId}`);
    const input = $(`#${inputId}`);
    const label = $(`#${labelId}`);
    if (!zone || !input) return;
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files[0]) label.textContent = input.files[0].name;
    });
    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      }),
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
      }),
    );
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) {
        input.files = e.dataTransfer.files;
        label.textContent = f.name;
      }
    });
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    setupFileDrop(
      "contactFileDropZone",
      "contactFileInput",
      "contactFileLabel",
    );
    setupFileDrop("bugFileDropZone", "bugFileInput", "bugFileLabel");

    $("#contactSupportBtn")?.addEventListener("click", () =>
      openModal("contactModalOverlay"),
    );
    $("#emptyStateContactBtn")?.addEventListener("click", () =>
      openModal("contactModalOverlay"),
    );
    $("#reportBugBtn")?.addEventListener("click", () =>
      openModal("bugModalOverlay"),
    );
    $("#requestFeatureBtn")?.addEventListener("click", () =>
      openModal("featureModalOverlay"),
    );

    $("#closeContactModalBtn")?.addEventListener("click", () =>
      closeModal("contactModalOverlay"),
    );
    $("#cancelContactModalBtn")?.addEventListener("click", () =>
      closeModal("contactModalOverlay"),
    );
    $("#contactForm")?.addEventListener("submit", handleContactSubmit);

    $("#closeBugModalBtn")?.addEventListener("click", () =>
      closeModal("bugModalOverlay"),
    );
    $("#cancelBugModalBtn")?.addEventListener("click", () =>
      closeModal("bugModalOverlay"),
    );
    $("#bugForm")?.addEventListener("submit", handleBugSubmit);

    $("#closeFeatureModalBtn")?.addEventListener("click", () =>
      closeModal("featureModalOverlay"),
    );
    $("#cancelFeatureModalBtn")?.addEventListener("click", () =>
      closeModal("featureModalOverlay"),
    );
    $("#featureForm")?.addEventListener("submit", handleFeatureSubmit);

    $$(".modal-overlay").forEach((overlay) =>
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.hidden = true;
      }),
    );

    $("#globalSearchInput")?.addEventListener("input", runGlobalSearch);
    $("#articleSortSelect")?.addEventListener("change", renderArticles);

    $("#ticketSearchInput")?.addEventListener("input", renderTickets);
    $("#filterTicketStatus")?.addEventListener("change", renderTickets);
    $("#filterTicketPriority")?.addEventListener("change", renderTickets);

    $("#shortcutsLinkBtn")?.addEventListener("click", () =>
      showToast(
        "success",
        "⌘K search · G+D Dashboard · G+E Employees · G+P Payroll",
      ),
    );
  }
})();
