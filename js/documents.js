/* ==========================================================
   FIREBASE IMPORTS
   ----------------------------------------------------------
   No Firebase Storage bucket was provided for this project, so
   uploads store metadata in Firestore ("documents" collection)
   plus a short-lived local object URL for the current session.
   Swap `simulateUpload()` for a real Storage `uploadBytesResumable`
   call once a bucket is wired up — everything else (CRUD, search,
   filters, pagination, bulk actions) does not need to change.
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
  const TRASH = "__trash__";

  const TYPE_ICON = {
    PDF: "ri-file-pdf-2-fill",
    DOCX: "ri-file-word-2-fill",
    XLSX: "ri-file-excel-2-fill",
    PPT: "ri-file-ppt-2-fill",
    PNG: "ri-image-2-fill",
    JPG: "ri-image-2-fill",
    ZIP: "ri-file-zip-fill",
  };

  /* =========================================================
     STATE
  ========================================================= */
  let allDocuments = [];
  let allFolders = [];
  let employees = [];
  let departments = [];
  let filteredDocs = [];
  let activeFolder = "";
  let selectedIds = new Set();
  let editingRenameId = null;
  let pendingDeleteIds = [];
  let pendingDeletePermanent = false;
  let currentPage = 1;
  const pageSize = 10;
  let unsubDocs = null;
  let unsubFolders = null;

  /* =========================================================
     HELPERS
  ========================================================= */
  const escapeHtml = (str) =>
    String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const toMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return new Date(ts).getTime() || 0;
  };

  const formatDate = (ts) => (ts ? new Date(toMillis(ts)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  const formatSize = (bytes) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const initials = (name) => {
    if (!name) return "—";
    return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
  };

  /* =========================================================
     DROPDOWNS (More Filters)
  ========================================================= */
  function setupDropdowns() {
    const pairs = [{ trigger: "moreFiltersBtn", menu: "moreFiltersMenu" }];
    pairs.forEach(({ trigger, menu }) => {
      const t = $(`#${trigger}`);
      const m = $(`#${menu}`);
      if (!t || !m) return;
      t.addEventListener("click", (e) => {
        e.stopPropagation();
        m.hidden = !m.hidden;
      });
      m.addEventListener("click", (e) => e.stopPropagation());
    });
    document.addEventListener("click", () => {
      pairs.forEach(({ menu }) => { const m = $(`#${menu}`); if (m) m.hidden = true; });
    });
  }

  /* =========================================================
     FIRESTORE: FOLDERS (realtime)
  ========================================================= */
  function loadFolders() {
    const q = query(collection(db, "folders"), orderBy("createdAt", "desc"));
    unsubFolders = onSnapshot(
      q,
      (snap) => {
        allFolders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        populateFolderSelects();
        renderFolderList();
        renderStatistics();
      },
      (error) => {
        console.error("Failed to load folders:", error);
        showToast("error", "Could not load folders.");
      }
    );
  }

  function populateFolderSelects() {
    const opts = '<option value="">Uncategorized</option>' + allFolders
      .map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
    ["docFolderSelect", "moveFolderSelect"].forEach((id) => { const el = $(`#${id}`); if (el) el.innerHTML = opts; });

    const parentOpts = '<option value="">None (Top Level)</option>' + allFolders
      .map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
    const parentSel = $("#folderParentSelect");
    if (parentSel) parentSel.innerHTML = parentOpts;
  }

  function renderFolderList() {
    const wrap = $("#folderListDynamic");
    if (!wrap) return;

    const counts = {};
    allDocuments.filter((d) => !d.trashed).forEach((d) => {
      const key = d.folderId || "";
      counts[key] = (counts[key] || 0) + 1;
    });

    wrap.innerHTML = allFolders.map((f) => `
      <li>
        <button class="folder-item ${activeFolder === f.id ? "active" : ""}" data-folder="${f.id}">
          <i class="ri-folder-3-fill" style="color:${f.color || "var(--color-primary)"}"></i>
          <span>${escapeHtml(f.name)}</span>
          <strong>${counts[f.id] || 0}</strong>
        </button>
      </li>`).join("");

    $$("[data-folder]", wrap).forEach((btn) =>
      btn.addEventListener("click", () => setActiveFolder(btn.dataset.folder))
    );

    const allCount = allDocuments.filter((d) => !d.trashed).length;
    const trashCount = allDocuments.filter((d) => d.trashed).length;
    if ($("#folderCountAll")) $("#folderCountAll").textContent = allCount;
    if ($("#folderCountTrash")) $("#folderCountTrash").textContent = trashCount;

    $$(".folder-item[data-folder='']").forEach((btn) => btn.classList.toggle("active", activeFolder === ""));
    $$(".folder-item[data-folder='__trash__']").forEach((btn) => btn.classList.toggle("active", activeFolder === TRASH));
  }

  function setActiveFolder(folderId) {
    activeFolder = folderId;
    currentPage = 1;
    selectedIds.clear();
    renderFolderList();
    filterDocuments();
  }

  /* =========================================================
     FIRESTORE: DOCUMENTS (realtime)
  ========================================================= */
  function loadDocuments() {
    const q = query(collection(db, "documents"), orderBy("createdAt", "desc"));
    unsubDocs = onSnapshot(
      q,
      (snap) => {
        allDocuments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderFolderList();
        renderStatistics();
        filterDocuments();
        hideSkeleton("documentsSkeleton", "documentsTableContent");
      },
      (error) => {
        console.error("Failed to load documents:", error);
        showToast("error", "Could not load documents.");
        hideSkeleton("documentsSkeleton", "documentsTableContent");
      }
    );
  }

  function refreshDocuments() {
    if (unsubDocs) unsubDocs();
    loadDocuments();
  }

  /* =========================================================
     FIRESTORE: EMPLOYEES + DEPARTMENTS (pickers)
  ========================================================= */
  async function loadEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const opts = '<option value="">None</option>' + employees
        .map((e) => `<option value="${e.id}">${escapeHtml(e.fullName || e.name || "Unnamed")}</option>`).join("");
      if ($("#docEmployeeSelect")) $("#docEmployeeSelect").innerHTML = opts;
    } catch (error) {
      console.error("Failed to load employees:", error);
    }
  }

  async function loadDepartments() {
    try {
      const snap = await getDocs(collection(db, "departments"));
      departments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const opts = '<option value="">All Departments</option>' + departments
        .map((d) => `<option value="${escapeHtml(d.name || d.id)}">${escapeHtml(d.name || d.id)}</option>`).join("");
      if ($("#filterDepartment")) $("#filterDepartment").innerHTML = opts;
      const docOpts = '<option value="">All Departments</option>' + departments
        .map((d) => `<option value="${escapeHtml(d.name || d.id)}">${escapeHtml(d.name || d.id)}</option>`).join("");
      if ($("#docDepartmentSelect")) $("#docDepartmentSelect").innerHTML = docOpts;

      const uploaderOpts = '<option value="">All Uploaders</option>' + employees
        .map((e) => `<option value="${escapeHtml(e.fullName || e.name || "Unnamed")}">${escapeHtml(e.fullName || e.name || "Unnamed")}</option>`).join("");
      if ($("#filterUploader")) $("#filterUploader").innerHTML = uploaderOpts;
    } catch (error) {
      console.error("Failed to load departments:", error);
    }
  }

  /* =========================================================
     STATISTICS
  ========================================================= */
  function renderStatistics() {
    const activeDocs = allDocuments.filter((d) => !d.trashed);
    const totalSize = activeDocs.reduce((sum, d) => sum + (Number(d.size) || 0), 0);
    const totalDownloads = activeDocs.reduce((sum, d) => sum + (Number(d.downloads) || 0), 0);

    setStat("statTotalDocuments", String(activeDocs.length));
    setStat("statFolders", String(allFolders.length));
    setStat("statStorageUsed", formatSize(totalSize));
    setStat("statDownloads", String(totalDownloads));
  }

  function setStat(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value;
  }

  /* =========================================================
     SEARCH / FILTER / SORT
  ========================================================= */
  function searchDocuments() {
    currentPage = 1;
    filterDocuments();
  }

  function filterDocuments() {
    const search = ($("#documentSearchInput")?.value || "").trim().toLowerCase();
    const type = $("#filterType")?.value || "";
    const department = $("#filterDepartment")?.value || "";
    const uploader = $("#filterUploader")?.value || "";
    const dateRange = $("#filterDateRange")?.value || "";
    const status = $("#filterStatus")?.value || "";
    const sort = $("#sortDocuments")?.value || "date-desc";

    let rows = [...allDocuments];

    if (activeFolder === TRASH) {
      rows = rows.filter((d) => d.trashed);
    } else {
      rows = rows.filter((d) => !d.trashed);
      if (activeFolder) rows = rows.filter((d) => d.folderId === activeFolder);
    }

    if (search) {
      rows = rows.filter(
        (d) =>
          (d.name || "").toLowerCase().includes(search) ||
          (d.type || "").toLowerCase().includes(search) ||
          (d.description || "").toLowerCase().includes(search) ||
          (d.tags || []).join(" ").toLowerCase().includes(search)
      );
    }
    if (type) rows = rows.filter((d) => d.type === type);
    if (department) rows = rows.filter((d) => d.department === department);
    if (uploader) rows = rows.filter((d) => d.uploadedBy === uploader);
    if (status) rows = rows.filter((d) => d.status === status);

    if (dateRange) {
      const now = Date.now();
      const ranges = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 };
      const span = ranges[dateRange];
      if (span) rows = rows.filter((d) => now - toMillis(d.createdAt) <= span);
    }

    rows.sort((a, b) => {
      switch (sort) {
        case "date-asc": return toMillis(a.createdAt) - toMillis(b.createdAt);
        case "name-asc": return (a.name || "").localeCompare(b.name || "");
        case "size-desc": return (b.size || 0) - (a.size || 0);
        case "downloads-desc": return (b.downloads || 0) - (a.downloads || 0);
        default: return toMillis(b.createdAt) - toMillis(a.createdAt);
      }
    });

    filteredDocs = rows;
    renderDocuments();
  }

  function resetFilters() {
    $("#documentSearchInput").value = "";
    $("#filterType").value = "";
    $("#filterDepartment").value = "";
    $("#filterUploader").value = "";
    $("#filterDateRange").value = "";
    $("#filterStatus").value = "";
    $("#sortDocuments").value = "date-desc";
    currentPage = 1;
    filterDocuments();
  }

  /* =========================================================
     RENDER: TABLE + PAGINATION
  ========================================================= */
  function renderDocuments() {
    const tbody = $("#documentsTableBody");
    const emptyState = $("#documentsEmptyState");
    const tableWrap = $("#documentsTableWrap");
    const pagination = $("#documentsPagination");
    if (!tbody) return;

    if (!filteredDocs.length) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      tableWrap.style.display = "none";
      pagination.style.display = "none";
      updateBulkBar();
      return;
    }

    emptyState.hidden = true;
    tableWrap.style.display = "block";
    pagination.style.display = "flex";

    const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageRows = filteredDocs.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.map(rowTemplate).join("");
    renderPagination(totalPages);
    wireRowEvents(tbody);
    updateBulkBar();
    syncSelectAllCheckbox();
  }

  function rowTemplate(d) {
    const typeClass = `file-type-${(d.type || "pdf").toLowerCase()}`;
    const icon = TYPE_ICON[d.type] || "ri-file-3-fill";
    const statusClass = d.status === "Archived" ? "status-badge--archived" : "status-badge--active";
    const checked = selectedIds.has(d.id) ? "checked" : "";

    return `
      <tr class="${selectedIds.has(d.id) ? "selected" : ""}" data-row-id="${d.id}">
        <td><input type="checkbox" class="row-checkbox" data-id="${d.id}" ${checked} /></td>
        <td>
          <div class="doc-cell">
            <div class="doc-cell-icon ${typeClass}" style="background:transparent;"><i class="${icon}" style="font-size:22px;"></i></div>
            <div class="doc-cell-info">
              <span class="doc-cell-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
              <span class="doc-cell-sub">${escapeHtml(folderName(d.folderId))}</span>
            </div>
          </div>
        </td>
        <td><span class="file-type-badge ${typeClass}">${escapeHtml(d.type || "—")}</span></td>
        <td>${escapeHtml(d.department || "—")}</td>
        <td>
          <div class="uploader-cell">
            <div class="uploader-avatar">${initials(d.uploadedBy)}</div>
            <span>${escapeHtml(d.uploadedBy || "—")}</span>
          </div>
        </td>
        <td>${formatDate(d.createdAt)}</td>
        <td>${formatSize(d.size)}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(d.status || "Active")}</span></td>
        <td class="col-actions">
          <div class="row-actions">
            ${activeFolder === TRASH ? `
              <button class="row-action-btn" data-action="restore" data-id="${d.id}" title="Restore"><i class="ri-arrow-go-back-line"></i></button>
              <button class="row-action-btn danger" data-action="delete-forever" data-id="${d.id}" title="Delete permanently"><i class="ri-delete-bin-line"></i></button>
            ` : `
              <button class="row-action-btn" data-action="download" data-id="${d.id}" title="Download"><i class="ri-download-2-line"></i></button>
              <button class="row-action-btn" data-action="share" data-id="${d.id}" title="Share"><i class="ri-share-line"></i></button>
              <button class="row-action-btn" data-action="rename" data-id="${d.id}" title="Rename"><i class="ri-edit-line"></i></button>
              <button class="row-action-btn" data-action="move" data-id="${d.id}" title="Move"><i class="ri-folder-transfer-line"></i></button>
              <button class="row-action-btn danger" data-action="delete" data-id="${d.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
            `}
          </div>
        </td>
      </tr>`;
  }

  function folderName(folderId) {
    if (!folderId) return "Uncategorized";
    const f = allFolders.find((x) => x.id === folderId);
    return f ? f.name : "Uncategorized";
  }

  function wireRowEvents(tbody) {
    $$(".row-checkbox", tbody).forEach((cb) =>
      cb.addEventListener("change", () => {
        if (cb.checked) selectedIds.add(cb.dataset.id);
        else selectedIds.delete(cb.dataset.id);
        updateBulkBar();
        syncSelectAllCheckbox();
        cb.closest("tr").classList.toggle("selected", cb.checked);
      })
    );

    $$("[data-action='download']", tbody).forEach((btn) => btn.addEventListener("click", () => downloadDocument(btn.dataset.id)));
    $$("[data-action='share']", tbody).forEach((btn) => btn.addEventListener("click", () => openShareModal(btn.dataset.id)));
    $$("[data-action='rename']", tbody).forEach((btn) => btn.addEventListener("click", () => openRenameModal(btn.dataset.id)));
    $$("[data-action='move']", tbody).forEach((btn) => btn.addEventListener("click", () => openMoveModal([btn.dataset.id])));
    $$("[data-action='delete']", tbody).forEach((btn) => btn.addEventListener("click", () => openDeleteModal([btn.dataset.id], false)));
    $$("[data-action='restore']", tbody).forEach((btn) => btn.addEventListener("click", () => restoreDocument(btn.dataset.id)));
    $$("[data-action='delete-forever']", tbody).forEach((btn) => btn.addEventListener("click", () => openDeleteModal([btn.dataset.id], true)));
  }

  function renderPagination(totalPages) {
    const info = $("#paginationInfo");
    const controls = $("#paginationControls");
    if (!info || !controls) return;

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, filteredDocs.length);
    info.textContent = `Showing ${start}–${end} of ${filteredDocs.length}`;

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
        else if (val === "next") currentPage = Math.min(totalPages, currentPage + 1);
        else currentPage = Number(val);
        renderDocuments();
      });
    });
  }

  /* =========================================================
     BULK SELECTION
  ========================================================= */
  function updateBulkBar() {
    const bar = $("#bulkBar");
    const count = $("#bulkCount");
    if (!bar || !count) return;
    bar.hidden = selectedIds.size === 0;
    count.textContent = `${selectedIds.size} selected`;
  }

  function syncSelectAllCheckbox() {
    const selectAll = $("#selectAllCheckbox");
    if (!selectAll) return;
    const visibleIds = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((d) => d.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    selectAll.checked = allSelected;
  }

  function toggleSelectAll(checked) {
    const visibleIds = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((d) => d.id);
    visibleIds.forEach((id) => (checked ? selectedIds.add(id) : selectedIds.delete(id)));
    renderDocuments();
  }

  /* =========================================================
     UPLOAD MODAL
  ========================================================= */
  let selectedFile = null;

  function openUploadModal() {
    $("#uploadForm").reset();
    $("#fileDropLabel").textContent = "Click to browse or drag a file here";
    $("#uploadProgressWrap").hidden = true;
    $("#uploadProgressBar").style.width = "0%";
    selectedFile = null;
    if (activeFolder && activeFolder !== TRASH) $("#docFolderSelect").value = activeFolder;
    $("#uploadModalOverlay").hidden = false;
  }

  function closeUploadModal() {
    $("#uploadModalOverlay").hidden = true;
  }

  function setupFileDrop() {
    const zone = $("#fileDropZone");
    const input = $("#docFileInput");
    if (!zone || !input) return;

    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => handleFileSelect(input.files[0]));

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("drag-over"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("drag-over"); })
    );
    zone.addEventListener("drop", (e) => handleFileSelect(e.dataTransfer.files[0]));
  }

  function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;
    $("#fileDropLabel").textContent = file.name;
    if (!$("#docNameInput").value) $("#docNameInput").value = file.name.replace(/\.[^/.]+$/, "");
    const ext = (file.name.split(".").pop() || "").toUpperCase();
    if (TYPE_ICON[ext]) $("#docTypeSelect").value = ext;
  }

  function simulateUpload() {
    return new Promise((resolve) => {
      const bar = $("#uploadProgressBar");
      const text = $("#uploadProgressText");
      $("#uploadProgressWrap").hidden = false;
      let pct = 0;
      const interval = setInterval(() => {
        pct = Math.min(100, pct + 20);
        bar.style.width = `${pct}%`;
        text.textContent = `${pct}%`;
        if (pct >= 100) { clearInterval(interval); resolve(); }
      }, 120);
    });
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    const name = $("#docNameInput").value.trim();
    if (!name) { showToast("error", "Please enter a document name."); return; }

    await simulateUpload();

    const tagsRaw = $("#docTagsInput").value.trim();
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const employeeSel = $("#docEmployeeSelect");
    const employeeOption = employeeSel.selectedOptions[0];

    try {
      await addDoc(collection(db, "documents"), {
        name,
        type: $("#docTypeSelect").value,
        folderId: $("#docFolderSelect").value || "",
        department: $("#docDepartmentSelect").value || "",
        employeeId: employeeSel.value || "",
        employeeName: employeeSel.value ? employeeOption.textContent : "",
        description: $("#docDescriptionInput").value || "",
        tags,
        visibility: $("#docVisibilitySelect").value,
        size: selectedFile ? selectedFile.size : Math.floor(Math.random() * 2_000_000) + 50_000,
        downloads: 0,
        status: "Active",
        trashed: false,
        uploadedBy: "You",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Document uploaded successfully.");
      closeUploadModal();
    } catch (error) {
      console.error("Upload failed:", error);
      showToast("error", "Upload failed. Please try again.");
    }
  }

  /* =========================================================
     FOLDER MODAL
  ========================================================= */
  function openFolderModal() {
    $("#folderForm").reset();
    $("#folderModalOverlay").hidden = false;
  }
  function closeFolderModal() {
    $("#folderModalOverlay").hidden = true;
  }

  async function handleFolderSubmit(e) {
    e.preventDefault();
    const name = $("#folderNameInput").value.trim();
    if (!name) return;
    const color = $("input[name='folderColor']:checked")?.value || "#6c5ce7";

    try {
      await addDoc(collection(db, "folders"), {
        name,
        description: $("#folderDescriptionInput").value || "",
        parentId: $("#folderParentSelect").value || "",
        color,
        createdAt: serverTimestamp(),
      });
      showToast("success", "Folder created successfully.");
      closeFolderModal();
    } catch (error) {
      console.error("Folder create failed:", error);
      showToast("error", "Could not create folder.");
    }
  }

  /* =========================================================
     RENAME MODAL
  ========================================================= */
  function openRenameModal(id) {
    const d = allDocuments.find((x) => x.id === id);
    if (!d) return;
    editingRenameId = id;
    $("#renameInput").value = d.name;
    $("#renameModalOverlay").hidden = false;
  }
  function closeRenameModal() {
    editingRenameId = null;
    $("#renameModalOverlay").hidden = true;
  }

  async function handleRenameSubmit(e) {
    e.preventDefault();
    const newName = $("#renameInput").value.trim();
    if (!newName || !editingRenameId) return;
    try {
      await updateDoc(doc(db, "documents", editingRenameId), { name: newName, updatedAt: serverTimestamp() });
      showToast("success", "Document renamed.");
      closeRenameModal();
    } catch (error) {
      console.error("Rename failed:", error);
      showToast("error", "Could not rename document.");
    }
  }

  /* =========================================================
     MOVE MODAL
  ========================================================= */
  let moveTargetIds = [];

  function openMoveModal(ids) {
    moveTargetIds = ids;
    $("#moveFolderSelect").value = "";
    $("#moveModalOverlay").hidden = false;
  }
  function closeMoveModal() {
    moveTargetIds = [];
    $("#moveModalOverlay").hidden = true;
  }

  async function handleMoveSubmit(e) {
    e.preventDefault();
    const folderId = $("#moveFolderSelect").value || "";
    try {
      await Promise.all(moveTargetIds.map((id) => updateDoc(doc(db, "documents", id), { folderId, updatedAt: serverTimestamp() })));
      showToast("success", `Moved ${moveTargetIds.length} item(s).`);
      selectedIds.clear();
      closeMoveModal();
    } catch (error) {
      console.error("Move failed:", error);
      showToast("error", "Could not move document(s).");
    }
  }

  /* =========================================================
     SHARE MODAL
  ========================================================= */
  function openShareModal(id) {
    const link = `${window.location.origin}${window.location.pathname}?doc=${id}`;
    $("#shareLinkInput").value = link;
    $("#shareModalOverlay").hidden = false;
  }
  function closeShareModal() {
    $("#shareModalOverlay").hidden = true;
  }

  function copyShareLink() {
    const input = $("#shareLinkInput");
    input.select();
    navigator.clipboard?.writeText(input.value).then(
      () => showToast("success", "Link copied to clipboard."),
      () => showToast("error", "Could not copy link.")
    );
  }

  /* =========================================================
     DELETE (soft to trash / permanent) + RESTORE
  ========================================================= */
  function openDeleteModal(ids, permanent) {
    pendingDeleteIds = ids;
    pendingDeletePermanent = permanent;
    const label = ids.length > 1 ? `${ids.length} items` : (allDocuments.find((d) => d.id === ids[0])?.name || "this item");
    $("#deleteTargetName").textContent = label;
    $("#deletePermanentNote").textContent = permanent ? "This cannot be undone." : "";
    $("#deleteModalTitle").textContent = permanent ? "Delete Permanently?" : "Delete Document?";
    $("#deleteModalOverlay").hidden = false;
  }
  function closeDeleteModal() {
    pendingDeleteIds = [];
    $("#deleteModalOverlay").hidden = true;
  }

  async function confirmDelete() {
    try {
      if (pendingDeletePermanent) {
        await Promise.all(pendingDeleteIds.map((id) => deleteDoc(doc(db, "documents", id))));
        showToast("success", "Deleted permanently.");
      } else {
        await Promise.all(pendingDeleteIds.map((id) => updateDoc(doc(db, "documents", id), { trashed: true, updatedAt: serverTimestamp() })));
        showToast("success", "Moved to Trash.");
      }
      selectedIds.clear();
      closeDeleteModal();
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("error", "Could not delete document(s).");
    }
  }

  async function restoreDocument(id) {
    try {
      await updateDoc(doc(db, "documents", id), { trashed: false, updatedAt: serverTimestamp() });
      showToast("success", "Document restored.");
    } catch (error) {
      console.error("Restore failed:", error);
      showToast("error", "Could not restore document.");
    }
  }

  /* =========================================================
     DOWNLOAD (increments counter)
  ========================================================= */
  async function downloadDocument(id) {
    const d = allDocuments.find((x) => x.id === id);
    if (!d) return;
    try {
      await updateDoc(doc(db, "documents", id), { downloads: (Number(d.downloads) || 0) + 1 });
      showToast("success", `Preparing "${d.name}" for download.`);
      window.print();
    } catch (error) {
      console.error("Download tracking failed:", error);
    }
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    setupDropdowns();
    setupFileDrop();

    $("#uploadDocumentBtn")?.addEventListener("click", openUploadModal);
    $("#emptyStateUploadBtn")?.addEventListener("click", openUploadModal);
    $("#newFolderBtn")?.addEventListener("click", openFolderModal);
    $("#addFolderBtn")?.addEventListener("click", openFolderModal);

    $("#documentSearchInput")?.addEventListener("input", searchDocuments);
    ["filterType", "filterDepartment", "filterUploader", "filterDateRange", "filterStatus", "sortDocuments"].forEach((id) =>
      $(`#${id}`)?.addEventListener("change", () => { currentPage = 1; filterDocuments(); })
    );
    $("#resetFiltersBtn")?.addEventListener("click", resetFilters);

    $("#selectAllCheckbox")?.addEventListener("change", (e) => toggleSelectAll(e.target.checked));
    $("#bulkDownloadBtn")?.addEventListener("click", () => { [...selectedIds].forEach(downloadDocument); });
    $("#bulkMoveBtn")?.addEventListener("click", () => openMoveModal([...selectedIds]));
    $("#bulkDeleteBtn")?.addEventListener("click", () => openDeleteModal([...selectedIds], activeFolder === TRASH));

    $("#closeUploadModalBtn")?.addEventListener("click", closeUploadModal);
    $("#cancelUploadModalBtn")?.addEventListener("click", closeUploadModal);
    $("#uploadForm")?.addEventListener("submit", handleUploadSubmit);

    $("#closeFolderModalBtn")?.addEventListener("click", closeFolderModal);
    $("#cancelFolderModalBtn")?.addEventListener("click", closeFolderModal);
    $("#folderForm")?.addEventListener("submit", handleFolderSubmit);

    $("#closeRenameModalBtn")?.addEventListener("click", closeRenameModal);
    $("#cancelRenameBtn")?.addEventListener("click", closeRenameModal);
    $("#renameForm")?.addEventListener("submit", handleRenameSubmit);

    $("#closeMoveModalBtn")?.addEventListener("click", closeMoveModal);
    $("#cancelMoveBtn")?.addEventListener("click", closeMoveModal);
    $("#moveForm")?.addEventListener("submit", handleMoveSubmit);

    $("#closeShareModalBtn")?.addEventListener("click", closeShareModal);
    $("#copyShareLinkBtn")?.addEventListener("click", copyShareLink);

    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
    $("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);

    $$(".modal-overlay").forEach((overlay) =>
      overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.hidden = true; })
    );

    $$(".folder-item[data-folder='']").forEach((btn) => btn.addEventListener("click", () => setActiveFolder("")));
    $$(".folder-item[data-folder='__trash__']").forEach((btn) => btn.addEventListener("click", () => setActiveFolder(TRASH)));
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    showSkeleton("documentsSkeleton", "documentsTableContent");

    await guardAndLoadUser();
    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    wireUI();
    await loadEmployees();
    await loadDepartments();
    loadFolders();
    loadDocuments();
  }

  document.addEventListener("DOMContentLoaded", init);
})();