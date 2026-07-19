/* ==========================================================
   FIREBASE IMPORTS
========================================================== */
import { db } from "../firebase/firebase.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
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

/* ==========================================================
   RBAC IMPORTS — consume existing permission system only
========================================================== */
import { canView, canEdit, MODULES } from "../js/permissions.js";

(function () {
  "use strict";

  /* =========================================================
     GENERIC FORM ↔ FIRESTORE DOC CONFIG
     ----------------------------------------------------------
     Every simple settings tab (General, Organization, Notifications,
     Security, Attendance, Leave, Payroll, Holiday, Documents) is
     driven by one config entry + two generic functions
     (loadFormConfig / saveFormConfig) instead of ten near-identical
     load/save pairs.
  ========================================================= */
  const FORM_CONFIGS = {
    general: {
      collection: "settings",
      docId: "general",
      fields: {
        companyNameInput: "companyName",
        companyEmailInput: "companyEmail",
        companyPhoneInput: "companyPhone",
        companyWebsiteInput: "website",
        timezoneSelect: "timezone",
        dateFormatSelect: "dateFormat",
        timeFormatSelect: "timeFormat",
        languageSelect: "language",
        currencySelect: "currency",
      },
    },
    organization: {
      collection: "organization",
      docId: "main",
      fields: {
        orgNameInput: "name",
        orgIndustrySelect: "industry",
        orgRegNumberInput: "registrationNumber",
        orgTaxNumberInput: "taxNumber",
        orgWorkingDaysSelect: "workingDays",
        orgOfficeHoursInput: "officeHours",
        orgAddressInput: "address",
      },
    },
    notifications: {
      collection: "settings",
      docId: "notifications",
      fields: {
        notifEmail: "email",
        notifPush: "push",
        notifBirthday: "birthday",
        notifHoliday: "holiday",
        notifLeave: "leave",
        notifPayroll: "payroll",
        notifSystem: "system",
        reminderTimeInput: "reminderTime",
      },
    },
    security: {
      collection: "settings",
      docId: "security",
      fields: {
        security2fa: "twoFactorAuth",
        securityLoginAlerts: "loginAlerts",
        securityAutoLogout: "autoLogout",
        passwordPolicySelect: "passwordPolicy",
        sessionTimeoutSelect: "sessionTimeout",
        allowedDevicesSelect: "allowedDevices",
      },
    },
    attendance: {
      collection: "attendanceSettings",
      docId: "main",
      fields: {
        officeStartInput: "officeStart",
        officeEndInput: "officeEnd",
        gracePeriodInput: "gracePeriod",
        halfDayRuleSelect: "halfDayRule",
        overtimeRuleSelect: "overtimeRule",
        weekendSettingSelect: "weekendSetting",
      },
    },
    leave: {
      collection: "leaveSettings",
      docId: "main",
      fields: {
        annualLeaveInput: "annualLeave",
        sickLeaveInput: "sickLeave",
        casualLeaveInput: "casualLeave",
        carryForwardSelect: "carryForward",
        approvalWorkflowSelect: "approvalWorkflow",
        balanceResetSelect: "balanceReset",
      },
    },
    payroll: {
      collection: "payrollSettings",
      docId: "main",
      fields: {
        salaryCycleSelect: "salaryCycle",
        payDateInput: "payDate",
        payrollCurrencySelect: "currency",
        taxRuleInput: "taxRule",
        pfPercentInput: "pfPercent",
        esiPercentInput: "esiPercent",
        bonusRulesInput: "bonusRules",
      },
    },
    holiday: {
      collection: "holidaySettings",
      docId: "main",
      fields: {
        regionalHolidays: "regionalHolidays",
        optionalHolidays: "optionalHolidays",
        workingSaturdays: "workingSaturdays",
        holidayCalendarSelect: "calendar",
      },
    },
    documents: {
      collection: "settings",
      docId: "documents",
      fields: {
        allowedFileTypesInput: "allowedFileTypes",
        maxUploadSizeInput: "maxUploadSizeMb",
        storageProviderSelect: "storageProvider",
        autoDeleteSelect: "autoDeletePolicy",
      },
    },
  };

  const INTEGRATIONS_META = [
    {
      key: "firebase",
      name: "Firebase",
      desc: "Core database & authentication provider.",
      icon: "ri-fire-fill",
      color: "#f59e0b",
    },
    {
      key: "google",
      name: "Google Workspace",
      desc: "Sync calendar, email and single sign-on.",
      icon: "ri-google-fill",
      color: "#4285f4",
    },
    {
      key: "microsoft",
      name: "Microsoft 365",
      desc: "Sync Outlook calendar and Teams.",
      icon: "ri-microsoft-fill",
      color: "#0078d4",
    },
    {
      key: "slack",
      name: "Slack",
      desc: "Send notifications to a Slack channel.",
      icon: "ri-slack-fill",
      color: "#611f69",
    },
    {
      key: "zoom",
      name: "Zoom",
      desc: "Schedule and join meetings from WorkSpare.",
      icon: "ri-vidicon-fill",
      color: "#2d8cff",
    },
    {
      key: "webhook",
      name: "Webhook",
      desc: "Send events to a custom HTTPS endpoint.",
      icon: "ri-links-fill",
      color: "#6c5ce7",
    },
  ];

  const DEFAULT_TEMPLATES = [
    {
      name: "Welcome Email",
      subject: "Welcome to WorkSpare, {{name}}!",
      body: "Hi {{name}},\n\nWelcome aboard! Your account has been created.",
      status: "Active",
    },
    {
      name: "Leave Approval",
      subject: "Your leave request has been approved",
      body: "Hi {{name}},\n\nYour leave from {{startDate}} to {{endDate}} has been approved.",
      status: "Active",
    },
    {
      name: "Leave Rejection",
      subject: "Update on your leave request",
      subject2: "",
      body: "Hi {{name}},\n\nUnfortunately your leave request could not be approved at this time.",
      status: "Active",
    },
    {
      name: "Payroll",
      subject: "Your payslip for {{month}} is ready",
      body: "Hi {{name}},\n\nYour payslip for {{month}} {{year}} has been generated.",
      status: "Active",
    },
    {
      name: "Password Reset",
      subject: "Reset your WorkSpare password",
      body: "Hi {{name}},\n\nClick the link below to reset your password.",
      status: "Active",
    },
    {
      name: "Birthday Wish",
      subject: "🎉 Happy Birthday, {{name}}!",
      body: "Hi {{name}},\n\nWishing you a fantastic birthday from the whole team!",
      status: "Active",
    },
    {
      name: "Holiday Reminder",
      subject: "Upcoming holiday: {{holidayName}}",
      body: "Hi {{name}},\n\nJust a reminder that {{holidayName}} is coming up on {{date}}.",
      status: "Active",
    },
  ];

  /* =========================================================
     STATE
  ========================================================= */
  let currentTab = "general";
  let currentUser = null;
  let roles = [];
  let apiKeys = [];
  let templates = [];
  let integrations = [];
  let auditLogs = [];
  let auditPage = 1;
  const auditPageSize = 10;
  let editingRoleId = null;
  let editingTemplateId = null;
  let pendingDelete = null; // { type, id, label }
  let generatedKeyValue = null;

  /* =========================================================
     RBAC STATE
     ----------------------------------------------------------
     hasEditAccess is resolved once in init() from the existing
     permissions.js (canEdit(MODULES.SETTINGS)) and reused by
     every render/action function below — no permission logic
     is duplicated here, only consumed.
  ========================================================= */
  let hasEditAccess = false;

  function guardEdit() {
    if (hasEditAccess) return true;
    showToast("error", "Access Denied");
    return false;
  }

  function denyAccessRedirect() {
    window.location.href = "./dashboard.html";
  }

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
  const formatDateTime = (ts) =>
    ts
      ? new Date(toMillis(ts)).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  function genKey() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "sk_live_";
    for (let i = 0; i < 32; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function maskKey(key) {
    return key ? `${key.slice(0, 12)}${"•".repeat(16)}${key.slice(-4)}` : "";
  }

  async function logAudit(action, module) {
    try {
      await addDoc(collection(db, "auditLogs"), {
        user: currentUser?.fullName || "Admin",
        action,
        module,
        ipAddress: "—",
        browser: navigator.userAgent.split(") ")[0]?.split("(")[1] || "Unknown",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Audit log write failed:", error);
    }
  }

  /* =========================================================
     init()
  ========================================================= */
  async function init() {
    currentUser = await guardAndLoadUser();

    if (!canView(MODULES.SETTINGS)) {
      denyAccessRedirect();
      return;
    }
    hasEditAccess = canEdit(MODULES.SETTINGS);

    renderNav();
    setupUserMenu();
    setupSidebarToggle();

    wireUI();
    applyReadOnlyMode();
    loadFormConfig("general");
    loadRoles();
    loadApiKeys();
    loadTemplates();
    loadIntegrations();
    loadAuditLogs();
    renderAboutSystem();
  }

  document.addEventListener("DOMContentLoaded", init);

  /* =========================================================
     RBAC UI ENFORCEMENT
     ----------------------------------------------------------
     Runs once after wireUI(). View-only users get every write
     trigger HIDDEN (not just disabled) and every input/select/
     textarea/switch in the settings panels DISABLED.
  ========================================================= */
  function applyReadOnlyMode() {
    if (hasEditAccess) return;

    [
      "saveChangesBtn",
      "resetChangesBtn",
      "exportSettingsBtn",
      "addRoleBtn",
      "emptyRoleAddBtn",
      "generateKeyBtn",
      "backupNowBtn",
      "restoreBackupBtn",
      "uploadLogoBtn",
    ].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.hidden = true;
    });

    $$(
      ".settings-panel input, .settings-panel select, .settings-panel textarea",
    ).forEach((el) => {
      el.disabled = true;
    });
  }

  /* =========================================================
     TAB SWITCHING
  ========================================================= */
  function switchTab(tab) {
    currentTab = tab;
    $$(".settings-nav-item").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.tab === tab),
    );
    $$(".settings-panel").forEach((panel) =>
      panel.classList.toggle("active", panel.id === `panel-${tab}`),
    );
    if (FORM_CONFIGS[tab]) loadFormConfig(tab);
  }

  /* =========================================================
     GENERIC FORM LOAD / SAVE
  ========================================================= */
  async function loadFormConfig(tab) {
    const config = FORM_CONFIGS[tab];
    if (!config) return;
    try {
      const snap = await getDoc(doc(db, config.collection, config.docId));
      const data = snap.exists() ? snap.data() : {};
      Object.entries(config.fields).forEach(([fieldId, dataKey]) => {
        const el = $(`#${fieldId}`);
        if (!el) return;
        if (el.type === "checkbox") el.checked = !!data[dataKey];
        else el.value = data[dataKey] ?? "";
        el.disabled = !hasEditAccess;
      });
    } catch (error) {
      console.error(`Failed to load ${tab} settings:`, error);
    }
  }

  async function saveFormConfig(tab) {
    if (!guardEdit()) return;
    const config = FORM_CONFIGS[tab];
    if (!config) return;
    const payload = {};
    Object.entries(config.fields).forEach(([fieldId, dataKey]) => {
      const el = $(`#${fieldId}`);
      if (!el) return;
      payload[dataKey] = el.type === "checkbox" ? el.checked : el.value;
    });
    try {
      await setDoc(
        doc(db, config.collection, config.docId),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      );
      showToast("success", "Settings saved.");
      logAudit(`Updated ${tab} settings`, capitalize(tab));
    } catch (error) {
      console.error(`Failed to save ${tab} settings:`, error);
      showToast("error", "Could not save settings.");
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function handleSaveChanges() {
    if (!guardEdit()) return;
    if (FORM_CONFIGS[currentTab]) {
      await saveFormConfig(currentTab);
      return;
    }
    if (currentTab === "appearance") {
      await saveAppearance();
      return;
    }
    showToast("success", "Nothing to save on this tab.");
  }

  function handleResetChanges() {
    if (!guardEdit()) return;
    if (FORM_CONFIGS[currentTab]) {
      loadFormConfig(currentTab);
      showToast("success", "Changes reset.");
      return;
    }
    if (currentTab === "appearance") {
      loadAppearance();
      showToast("success", "Changes reset.");
      return;
    }
  }

  /* =========================================================
     APPEARANCE (custom — radios, not plain fields)
  ========================================================= */
  async function loadAppearance() {
    try {
      const snap = await getDoc(doc(db, "settings", "appearance"));
      const data = snap.exists() ? snap.data() : {};
      if (data.theme) {
        const r = $(`input[name="themeOption"][value="${data.theme}"]`);
        if (r) r.checked = true;
      }
      if (data.primaryColor) {
        const r = $(`input[name="primaryColor"][value="${data.primaryColor}"]`);
        if (r) r.checked = true;
      }
      $("#compactMode").checked = !!data.compactMode;
      $("#animationsEnabled").checked = data.animationsEnabled !== false;

      $$(
        'input[name="themeOption"], input[name="primaryColor"], #compactMode, #animationsEnabled',
      ).forEach((el) => (el.disabled = !hasEditAccess));
    } catch (error) {
      console.error("Failed to load appearance:", error);
    }
  }

  async function saveAppearance() {
    if (!guardEdit()) return;
    const payload = {
      theme: $("input[name='themeOption']:checked")?.value || "light",
      primaryColor: $("input[name='primaryColor']:checked")?.value || "#6c5ce7",
      compactMode: $("#compactMode").checked,
      animationsEnabled: $("#animationsEnabled").checked,
    };
    try {
      await setDoc(
        doc(db, "settings", "appearance"),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      );
      showToast("success", "Appearance saved.");
      logAudit("Updated appearance settings", "Appearance");
    } catch (error) {
      console.error("Failed to save appearance:", error);
      showToast("error", "Could not save appearance.");
    }
  }

  /* =========================================================
     ROLES — full CRUD
  ========================================================= */
  function loadRoles() {
    const q = query(collection(db, "roles"), orderBy("createdAt", "desc"));
    onSnapshot(
      q,
      (snap) => {
        roles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderRoles();
        $("#rolesSkeleton").hidden = true;
        $("#rolesContent").hidden = false;
      },
      (error) => {
        console.error("Failed to load roles:", error);
        $("#rolesSkeleton").hidden = true;
        $("#rolesContent").hidden = false;
      },
    );
  }

  function renderRoles() {
    const search = ($("#roleSearchInput")?.value || "").trim().toLowerCase();
    const status = $("#filterRoleStatus")?.value || "";
    let rows = [...roles];
    if (search)
      rows = rows.filter((r) => (r.name || "").toLowerCase().includes(search));
    if (status) rows = rows.filter((r) => r.status === status);

    const tbody = $("#rolesTableBody");
    const empty = $("#rolesEmptyState");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${(r.permissions || [])
          .slice(0, 3)
          .map((p) => `<span class="permission-chip">${escapeHtml(p)}</span>`)
          .join(
            "",
          )}${(r.permissions || []).length > 3 ? `<span class="permission-chip">+${r.permissions.length - 3}</span>` : ""}</td>
        <td>${r.usersCount || 0}</td>
        <td><span class="status-badge status-badge--${(r.status || "active").toLowerCase()}">${escapeHtml(r.status || "Active")}</span></td>
        <td class="col-actions">
          ${
            hasEditAccess
              ? `<div class="row-actions">
            <button class="row-action-btn" data-edit-role="${r.id}" title="Edit"><i class="ri-pencil-line"></i></button>
            <button class="row-action-btn danger" data-delete-role="${r.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
          </div>`
              : ""
          }
        </td>
      </tr>`,
      )
      .join("");

    $$("[data-edit-role]", tbody).forEach((btn) =>
      btn.addEventListener("click", () => openRoleModal(btn.dataset.editRole)),
    );
    $$("[data-delete-role]", tbody).forEach((btn) =>
      btn.addEventListener("click", () =>
        openDeleteModal(
          "role",
          btn.dataset.deleteRole,
          roles.find((r) => r.id === btn.dataset.deleteRole)?.name,
        ),
      ),
    );
  }

  function openRoleModal(id = null) {
    if (!guardEdit()) return;
    editingRoleId = id;
    $("#roleForm").reset();
    $$("#rolePermissionsGrid input[type=checkbox]").forEach(
      (cb) => (cb.checked = false),
    );

    if (id) {
      const role = roles.find((r) => r.id === id);
      if (!role) return;
      $("#roleModalTitle").textContent = "Edit Role";
      $("#roleNameInput").value = role.name || "";
      $("#roleStatusSelect").value = role.status || "Active";
      (role.permissions || []).forEach((p) => {
        const cb = $(`#rolePermissionsGrid input[value="${p}"]`);
        if (cb) cb.checked = true;
      });
    } else {
      $("#roleModalTitle").textContent = "Add Role";
    }
    $("#roleModalOverlay").hidden = false;
  }
  function closeRoleModal() {
    $("#roleModalOverlay").hidden = true;
    editingRoleId = null;
  }

  async function handleRoleSubmit(e) {
    e.preventDefault();
    if (!guardEdit()) return;
    const name = $("#roleNameInput").value.trim();
    if (!name) return;

    const duplicate = roles.some(
      (r) =>
        r.name.toLowerCase() === name.toLowerCase() && r.id !== editingRoleId,
    );
    if (duplicate) {
      showToast("error", "A role with this name already exists.");
      return;
    }

    const permissions = $$("#rolePermissionsGrid input:checked").map(
      (cb) => cb.value,
    );
    const payload = { name, status: $("#roleStatusSelect").value, permissions };

    try {
      if (editingRoleId) {
        await updateDoc(doc(db, "roles", editingRoleId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Role updated.");
        logAudit(`Updated role "${name}"`, "Users & Roles");
      } else {
        await addDoc(collection(db, "roles"), {
          ...payload,
          usersCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast("success", "Role created.");
        logAudit(`Created role "${name}"`, "Users & Roles");
      }
      closeRoleModal();
    } catch (error) {
      console.error("Save role failed:", error);
      showToast("error", "Could not save role.");
    }
  }

  /* =========================================================
     GENERIC DELETE MODAL (roles, templates)
  ========================================================= */
  function openDeleteModal(type, id, label) {
    if (!guardEdit()) return;
    pendingDelete = { type, id };
    $("#deleteTargetName").textContent = label || "this item";
    $("#deleteModalTitle").textContent =
      type === "role" ? "Delete Role?" : "Delete Template?";
    $("#deleteModalOverlay").hidden = false;
  }
  function closeDeleteModal() {
    pendingDelete = null;
    $("#deleteModalOverlay").hidden = true;
  }

  async function confirmDelete() {
    if (!guardEdit()) return;
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    try {
      if (type === "role") {
        await deleteDoc(doc(db, "roles", id));
        showToast("success", "Role deleted.");
        logAudit("Deleted a role", "Users & Roles");
      } else if (type === "template") {
        await deleteDoc(doc(db, "emailTemplates", id));
        showToast("success", "Template deleted.");
        logAudit("Deleted an email template", "Email Templates");
      }
      closeDeleteModal();
    } catch (error) {
      console.error("Delete failed:", error);
      showToast("error", "Could not delete item.");
    }
  }

  /* =========================================================
     API KEYS — generate / regenerate / revoke / copy
  ========================================================= */
  function loadApiKeys() {
    const q = query(collection(db, "apiKeys"), orderBy("createdAt", "desc"));
    onSnapshot(
      q,
      (snap) => {
        apiKeys = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderApiKeys();
      },
      (error) => console.error("Failed to load API keys:", error),
    );
  }

  function renderApiKeys() {
    const wrap = $("#apiKeysList");
    const empty = $("#apiKeysEmptyState");
    if (!wrap) return;

    if (!apiKeys.length) {
      wrap.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    wrap.innerHTML = apiKeys
      .map(
        (k) => `
      <div class="api-key-row">
        <div class="api-key-icon"><i class="ri-key-2-fill"></i></div>
        <div class="api-key-info">
          <div class="api-key-name">${escapeHtml(k.name)} <span class="status-badge status-badge--${k.revoked ? "inactive" : "active"}">${k.revoked ? "Revoked" : "Active"}</span></div>
          <div class="api-key-value">${escapeHtml(maskKey(k.keyValue))} <span style="opacity:.7;">· created ${formatDate(k.createdAt)}</span></div>
        </div>
        <div class="api-key-actions">
          <button class="icon-btn-sm" data-copy-key="${k.id}" title="Copy"><i class="ri-file-copy-line"></i></button>
          ${
            hasEditAccess
              ? `<button class="icon-btn-sm" data-regen-key="${k.id}" title="Regenerate"><i class="ri-refresh-line"></i></button>
          <button class="icon-btn-sm" data-revoke-key="${k.id}" title="Revoke"><i class="ri-forbid-line"></i></button>`
              : ""
          }
        </div>
      </div>`,
      )
      .join("");

    $$("[data-copy-key]", wrap).forEach((btn) =>
      btn.addEventListener("click", () => {
        const k = apiKeys.find((x) => x.id === btn.dataset.copyKey);
        navigator.clipboard
          ?.writeText(k.keyValue)
          .then(() => showToast("success", "API key copied."));
      }),
    );
    $$("[data-regen-key]", wrap).forEach((btn) =>
      btn.addEventListener("click", () => regenerateKey(btn.dataset.regenKey)),
    );
    $$("[data-revoke-key]", wrap).forEach((btn) =>
      btn.addEventListener("click", () => revokeKey(btn.dataset.revokeKey)),
    );
  }

  async function regenerateKey(id) {
    if (!guardEdit()) return;
    try {
      const newKey = genKey();
      await updateDoc(doc(db, "apiKeys", id), {
        keyValue: newKey,
        revoked: false,
        updatedAt: serverTimestamp(),
      });
      showToast("success", "API key regenerated.");
      logAudit("Regenerated an API key", "API Keys");
    } catch (error) {
      console.error("Regenerate failed:", error);
      showToast("error", "Could not regenerate key.");
    }
  }

  async function revokeKey(id) {
    if (!guardEdit()) return;
    try {
      await updateDoc(doc(db, "apiKeys", id), {
        revoked: true,
        updatedAt: serverTimestamp(),
      });
      showToast("success", "API key revoked.");
      logAudit("Revoked an API key", "API Keys");
    } catch (error) {
      console.error("Revoke failed:", error);
      showToast("error", "Could not revoke key.");
    }
  }

  function openApiKeyModal() {
    if (!guardEdit()) return;
    generatedKeyValue = null;
    $("#apiKeyNameInput").value = "";
    $("#generatedKeyWrap").hidden = true;
    $("#apiKeyModalOverlay").hidden = false;
  }
  function closeApiKeyModal() {
    $("#apiKeyModalOverlay").hidden = true;
  }

  async function handleGenerateKey() {
    if (!guardEdit()) return;
    const name = $("#apiKeyNameInput").value.trim();
    if (!name) {
      showToast("error", "Please name your key.");
      return;
    }

    const duplicate = apiKeys.some(
      (k) => k.name.toLowerCase() === name.toLowerCase() && !k.revoked,
    );
    if (duplicate) {
      showToast("error", "An active key with this name already exists.");
      return;
    }

    generatedKeyValue = genKey();
    try {
      await addDoc(collection(db, "apiKeys"), {
        name,
        keyValue: generatedKeyValue,
        revoked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      $("#generatedKeyText").textContent = generatedKeyValue;
      $("#generatedKeyWrap").hidden = false;
      showToast("success", "API key generated.");
      logAudit(`Generated API key "${name}"`, "API Keys");
    } catch (error) {
      console.error("Generate key failed:", error);
      showToast("error", "Could not generate key.");
    }
  }

  /* =========================================================
     EMAIL TEMPLATES — CRUD (seeds defaults once if empty)
  ========================================================= */
  async function loadTemplates() {
    const q = query(collection(db, "emailTemplates"), orderBy("name"));
    onSnapshot(
      q,
      async (snap) => {
        if (snap.empty) {
          await seedDefaultTemplates();
          return;
        }
        templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderTemplates();
      },
      (error) => console.error("Failed to load templates:", error),
    );
  }

  async function seedDefaultTemplates() {
    if (!hasEditAccess) return;
    try {
      await Promise.all(
        DEFAULT_TEMPLATES.map((t) =>
          addDoc(collection(db, "emailTemplates"), {
            ...t,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );
    } catch (error) {
      console.error("Failed to seed default templates:", error);
    }
  }

  function renderTemplates() {
    const search = ($("#templateSearchInput")?.value || "")
      .trim()
      .toLowerCase();
    const rows = search
      ? templates.filter((t) => (t.name || "").toLowerCase().includes(search))
      : templates;

    const tbody = $("#templatesTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows
      .map(
        (t) => `
      <tr>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td>${escapeHtml(t.subject)}</td>
        <td><span class="status-badge status-badge--${(t.status || "active").toLowerCase()}">${escapeHtml(t.status || "Active")}</span></td>
        <td>${formatDate(t.updatedAt || t.createdAt)}</td>
        <td class="col-actions">
          ${
            hasEditAccess
              ? `<div class="row-actions">
            <button class="row-action-btn" data-edit-template="${t.id}" title="Edit"><i class="ri-pencil-line"></i></button>
            <button class="row-action-btn danger" data-delete-template="${t.id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
          </div>`
              : ""
          }
        </td>
      </tr>`,
      )
      .join("");

    $$("[data-edit-template]", tbody).forEach((btn) =>
      btn.addEventListener("click", () =>
        openTemplateModal(btn.dataset.editTemplate),
      ),
    );
    $$("[data-delete-template]", tbody).forEach((btn) =>
      btn.addEventListener("click", () =>
        openDeleteModal(
          "template",
          btn.dataset.deleteTemplate,
          templates.find((t) => t.id === btn.dataset.deleteTemplate)?.name,
        ),
      ),
    );
  }

  function openTemplateModal(id) {
    if (!guardEdit()) return;
    editingTemplateId = id;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    $("#templateModalTitle").textContent = `Edit — ${t.name}`;
    $("#templateDocId").value = id;
    $("#templateNameInput").value = t.name || "";
    $("#templateSubjectInput").value = t.subject || "";
    $("#templateBodyInput").value = t.body || "";
    $("#templateStatusSelect").value = t.status || "Active";
    $("#templateModalOverlay").hidden = false;
  }
  function closeTemplateModal() {
    $("#templateModalOverlay").hidden = true;
    editingTemplateId = null;
  }

  async function handleTemplateSubmit(e) {
    e.preventDefault();
    if (!guardEdit()) return;
    if (!editingTemplateId) return;
    const payload = {
      name: $("#templateNameInput").value.trim(),
      subject: $("#templateSubjectInput").value.trim(),
      body: $("#templateBodyInput").value.trim(),
      status: $("#templateStatusSelect").value,
    };
    try {
      await updateDoc(doc(db, "emailTemplates", editingTemplateId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      showToast("success", "Template updated.");
      logAudit(`Updated email template "${payload.name}"`, "Email Templates");
      closeTemplateModal();
    } catch (error) {
      console.error("Save template failed:", error);
      showToast("error", "Could not save template.");
    }
  }

  /* =========================================================
     INTEGRATIONS — toggle connected state
  ========================================================= */
  async function loadIntegrations() {
    try {
      const snap = await getDocs(collection(db, "integrations"));
      const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));
      integrations = INTEGRATIONS_META.map((meta) => ({
        ...meta,
        connected: !!existing.get(meta.key)?.connected,
      }));
      renderIntegrations();
    } catch (error) {
      console.error("Failed to load integrations:", error);
      integrations = INTEGRATIONS_META.map((meta) => ({
        ...meta,
        connected: false,
      }));
      renderIntegrations();
    }
  }

  function renderIntegrations() {
    const wrap = $("#integrationsList");
    if (!wrap) return;
    wrap.innerHTML = integrations
      .map(
        (i) => `
      <div class="integration-row">
        <div class="integration-icon" style="background:${i.color}"><i class="${i.icon}"></i></div>
        <div class="integration-info"><div class="integration-name">${escapeHtml(i.name)}</div><div class="integration-desc">${escapeHtml(i.desc)}</div></div>
        <label class="switch"><input type="checkbox" data-integration="${i.key}" ${i.connected ? "checked" : ""} ${hasEditAccess ? "" : "disabled"} /><span class="switch-slider"></span></label>
      </div>`,
      )
      .join("");

    $$("[data-integration]", wrap).forEach((cb) =>
      cb.addEventListener("change", () =>
        toggleIntegration(cb.dataset.integration, cb.checked),
      ),
    );
  }

  async function toggleIntegration(key, connected) {
    if (!guardEdit()) return;
    try {
      await setDoc(
        doc(db, "integrations", key),
        { connected, updatedAt: serverTimestamp() },
        { merge: true },
      );
      showToast(
        "success",
        `${connected ? "Connected" : "Disconnected"} ${key}.`,
      );
      logAudit(
        `${connected ? "Connected" : "Disconnected"} ${key} integration`,
        "Integrations",
      );
    } catch (error) {
      console.error("Toggle integration failed:", error);
      showToast("error", "Could not update integration.");
    }
  }

  /* =========================================================
     BACKUP & RESTORE
  ========================================================= */
  async function backupNow() {
    if (!guardEdit()) return;
    try {
      const collections = [
        "settings",
        "organization",
        "attendanceSettings",
        "leaveSettings",
        "payrollSettings",
        "holidaySettings",
        "roles",
        "emailTemplates",
        "integrations",
      ];
      const snapshot = {};
      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        snapshot[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workspare-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      renderBackupHistory({ date: new Date(), name: a.download });
      showToast("success", "Backup created and downloaded.");
      logAudit("Created a manual backup", "Backup & Restore");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast("error", "Backup failed.");
    }
  }

  const backupHistory = [];
  function renderBackupHistory(entry) {
    if (entry) backupHistory.unshift(entry);
    const wrap = $("#backupHistoryList");
    if (!wrap) return;
    if (!backupHistory.length) {
      wrap.innerHTML = `<p class="form-hint">No backups created yet this session.</p>`;
      return;
    }
    wrap.innerHTML = backupHistory
      .map(
        (b) => `
      <div class="backup-row">
        <div><div class="backup-info-title">${escapeHtml(b.name)}</div><div class="backup-info-sub">${b.date.toLocaleString("en-GB")}</div></div>
        <span class="status-badge status-badge--active">Completed</span>
      </div>`,
      )
      .join("");
  }

  function openRestoreModal() {
    if (!guardEdit()) return;
    $("#restoreFileInput").value = "";
    $("#restoreModalOverlay").hidden = false;
  }
  function closeRestoreModal() {
    $("#restoreModalOverlay").hidden = true;
  }

  async function handleRestore() {
    if (!guardEdit()) return;
    const file = $("#restoreFileInput").files[0];
    if (!file) {
      showToast("error", "Please choose a backup file.");
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const writes = [];
      Object.entries(data).forEach(([col, docs]) => {
        (docs || []).forEach((d) => {
          const { id, ...rest } = d;
          writes.push(
            setDoc(
              doc(db, col, id),
              { ...rest, updatedAt: serverTimestamp() },
              { merge: true },
            ),
          );
        });
      });
      await Promise.all(writes);
      showToast("success", "Backup restored successfully.");
      logAudit("Restored from a backup file", "Backup & Restore");
      closeRestoreModal();
    } catch (error) {
      console.error("Restore failed:", error);
      showToast("error", "Invalid backup file or restore failed.");
    }
  }

  /* =========================================================
     AUDIT LOGS
  ========================================================= */
  function loadAuditLogs() {
    const q = query(collection(db, "auditLogs"), orderBy("createdAt", "desc"));
    onSnapshot(
      q,
      (snap) => {
        auditLogs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        populateAuditModuleFilter();
        renderAuditLogs();
      },
      (error) => console.error("Failed to load audit logs:", error),
    );
  }

  function populateAuditModuleFilter() {
    const select = $("#filterAuditModule");
    if (!select || select.dataset.populated) return;
    const modules = [
      ...new Set(auditLogs.map((l) => l.module).filter(Boolean)),
    ];
    select.innerHTML =
      '<option value="">All Modules</option>' +
      modules
        .map(
          (m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`,
        )
        .join("");
  }

  function renderAuditLogs() {
    const search = ($("#auditSearchInput")?.value || "").trim().toLowerCase();
    const module = $("#filterAuditModule")?.value || "";
    const dateRange = $("#filterAuditDate")?.value || "";

    let rows = [...auditLogs];
    if (search)
      rows = rows.filter(
        (l) =>
          (l.action || "").toLowerCase().includes(search) ||
          (l.user || "").toLowerCase().includes(search),
      );
    if (module) rows = rows.filter((l) => l.module === module);
    if (dateRange) {
      const now = Date.now();
      const spans = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5 };
      const span = spans[dateRange];
      if (span) rows = rows.filter((l) => now - toMillis(l.createdAt) <= span);
    }

    const tbody = $("#auditLogsTableBody");
    const empty = $("#auditLogsEmptyState");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      $("#auditPagination").style.display = "none";
      return;
    }
    empty.hidden = true;
    $("#auditPagination").style.display = "flex";

    const totalPages = Math.max(1, Math.ceil(rows.length / auditPageSize));
    auditPage = Math.min(auditPage, totalPages);
    const start = (auditPage - 1) * auditPageSize;
    const pageRows = rows.slice(start, start + auditPageSize);

    tbody.innerHTML = pageRows
      .map(
        (l) => `
      <tr>
        <td>${escapeHtml(l.user || "—")}</td>
        <td>${escapeHtml(l.action || "—")}</td>
        <td>${escapeHtml(l.module || "—")}</td>
        <td>${escapeHtml(l.ipAddress || "—")}</td>
        <td>${escapeHtml(l.browser || "—")}</td>
        <td>${formatDateTime(l.createdAt)}</td>
      </tr>`,
      )
      .join("");

    renderAuditPagination(totalPages, rows.length, start);
  }

  function renderAuditPagination(totalPages, totalRows, start) {
    const info = $("#auditPaginationInfo");
    const controls = $("#auditPaginationControls");
    if (!info || !controls) return;
    info.textContent = `Showing ${start + 1}–${Math.min(start + auditPageSize, totalRows)} of ${totalRows}`;

    let html = `<button class="pagination-btn" data-audit-page="prev" ${auditPage === 1 ? "disabled" : ""}><i class="ri-arrow-left-s-line"></i></button>`;
    for (let p = 1; p <= totalPages; p++)
      html += `<button class="pagination-btn ${p === auditPage ? "active" : ""}" data-audit-page="${p}">${p}</button>`;
    html += `<button class="pagination-btn" data-audit-page="next" ${auditPage === totalPages ? "disabled" : ""}><i class="ri-arrow-right-s-line"></i></button>`;
    controls.innerHTML = html;

    $$("[data-audit-page]", controls).forEach((btn) =>
      btn.addEventListener("click", () => {
        const val = btn.dataset.auditPage;
        if (val === "prev") auditPage = Math.max(1, auditPage - 1);
        else if (val === "next") auditPage++;
        else auditPage = Number(val);
        renderAuditLogs();
      }),
    );
  }

  function exportAuditLogs() {
    if (!auditLogs.length) {
      showToast("error", "No audit logs to export.");
      return;
    }
    const headers = [
      "User",
      "Action",
      "Module",
      "IP Address",
      "Browser",
      "Date",
    ];
    const lines = auditLogs.map((l) =>
      [
        l.user,
        l.action,
        l.module,
        l.ipAddress,
        l.browser,
        formatDateTime(l.createdAt),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* =========================================================
     ABOUT SYSTEM
  ========================================================= */
  async function renderAboutSystem() {
    $("#aboutFirebaseProject").textContent = db?.app?.options?.projectId || "—";
    $("#aboutLastUpdate").textContent = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    try {
      await getDocs(collection(db, "settings"));
      $("#aboutDbStatus").textContent = "Connected";
      $("#aboutDbStatus").className = "status-badge status-badge--active";
    } catch (error) {
      $("#aboutDbStatus").textContent = "Unreachable";
      $("#aboutDbStatus").className = "status-badge status-badge--inactive";
    }
  }

  /* =========================================================
     EXPORT SETTINGS (header action)
  ========================================================= */
  async function exportAllSettings() {
    if (!guardEdit()) return;
    await backupNow();
  }

  /* =========================================================
     FILE UPLOAD (logo)
  ========================================================= */
  function setupLogoUpload() {
    const btn = $("#uploadLogoBtn");
    const input = $("#logoFileInput");
    const preview = $("#logoPreview");
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      if (!guardEdit()) return;
      input.click();
    });
    input.addEventListener("change", () => {
      if (!guardEdit()) return;
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;" />`;
      };
      reader.readAsDataURL(file);
      showToast(
        "success",
        "Logo preview updated — click Save Changes to apply.",
      );
    });
  }

  /* =========================================================
     STATIC UI WIRING
  ========================================================= */
  function wireUI() {
    $$(".settings-nav-item").forEach((btn) =>
      btn.addEventListener("click", () => switchTab(btn.dataset.tab)),
    );

    $("#saveChangesBtn")?.addEventListener("click", handleSaveChanges);
    $("#resetChangesBtn")?.addEventListener("click", handleResetChanges);
    $("#exportSettingsBtn")?.addEventListener("click", exportAllSettings);

    setupLogoUpload();

    // Roles
    $("#addRoleBtn")?.addEventListener("click", () => openRoleModal());
    $("#emptyRoleAddBtn")?.addEventListener("click", () => openRoleModal());
    $("#closeRoleModalBtn")?.addEventListener("click", closeRoleModal);
    $("#cancelRoleModalBtn")?.addEventListener("click", closeRoleModal);
    $("#roleForm")?.addEventListener("submit", handleRoleSubmit);
    $("#roleSearchInput")?.addEventListener("input", renderRoles);
    $("#filterRoleStatus")?.addEventListener("change", renderRoles);

    // Delete modal (shared)
    $("#cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
    $("#confirmDeleteBtn")?.addEventListener("click", confirmDelete);

    // API Keys
    $("#generateKeyBtn")?.addEventListener("click", openApiKeyModal);
    $("#closeApiKeyModalBtn")?.addEventListener("click", closeApiKeyModal);
    $("#cancelApiKeyModalBtn")?.addEventListener("click", closeApiKeyModal);
    $("#confirmGenerateKeyBtn")?.addEventListener("click", handleGenerateKey);
    $("#copyGeneratedKeyBtn")?.addEventListener("click", () => {
      if (!generatedKeyValue) return;
      navigator.clipboard
        ?.writeText(generatedKeyValue)
        .then(() => showToast("success", "Key copied."));
    });

    // Email Templates
    $("#templateSearchInput")?.addEventListener("input", renderTemplates);
    $("#closeTemplateModalBtn")?.addEventListener("click", closeTemplateModal);
    $("#cancelTemplateModalBtn")?.addEventListener("click", closeTemplateModal);
    $("#templateForm")?.addEventListener("submit", handleTemplateSubmit);

    // Backup & Restore
    $("#backupNowBtn")?.addEventListener("click", backupNow);
    $("#restoreBackupBtn")?.addEventListener("click", openRestoreModal);
    $("#cancelRestoreBtn")?.addEventListener("click", closeRestoreModal);
    $("#confirmRestoreBtn")?.addEventListener("click", handleRestore);
    renderBackupHistory();

    // Audit Logs
    $("#auditSearchInput")?.addEventListener("input", () => {
      auditPage = 1;
      renderAuditLogs();
    });
    $("#filterAuditModule")?.addEventListener("change", () => {
      auditPage = 1;
      renderAuditLogs();
    });
    $("#filterAuditDate")?.addEventListener("change", () => {
      auditPage = 1;
      renderAuditLogs();
    });
    $("#exportAuditBtn")?.addEventListener("click", exportAuditLogs);

    // Appearance
    $$('input[name="themeOption"]').forEach((r) =>
      r.addEventListener("change", () => {}),
    );
    loadAppearance();

    $$(".modal-overlay").forEach((overlay) =>
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.hidden = true;
      }),
    );
  }
})();
