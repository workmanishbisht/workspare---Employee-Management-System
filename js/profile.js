import { db } from "../firebase/firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
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
     FIELDS TRACKED FOR PROFILE COMPLETION %
  ========================================================= */
  const TOP_LEVEL_FIELDS = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "gender",
    "dob",
    "nationality",
    "maritalStatus",
    "addressLine1",
    "city",
    "state",
    "zipCode",
    "photoURL",
    "skills",
  ];

  const EMPLOYMENT_KEYS = [
    "employeeId",
    "department",
    "designation",
    "reportingManager",
    "employmentType",
    "joiningDate",
    "role",
    "status",
    "officeLocation",
    "currentProject",
  ];

  const ROLE_LABELS = {
    admin: "Admin",
    hr: "HR Manager",
    manager: "Team Manager",
    employee: "Employee",
  };

  /* =========================================================
     TOGGLE SETTING DEFINITIONS
     ----------------------------------------------------------
     Drives the "Two-Factor Authentication" / "Email Notifications"
     / "Privacy Settings" rows in Account Settings. Each maps a
     settings-list action to the Firestore field it reads/writes,
     plus the copy shown in the toggle modal — one generic modal,
     three real, persisted settings instead of "coming soon" toasts.
  ========================================================= */
  const TOGGLE_SETTINGS = {
    "2fa": {
      icon: "ri-shield-keyhole-line",
      title: "Two-Factor Authentication",
      description:
        "Require a verification code in addition to your password when signing in.",
      field: "twoFactorEnabled",
      onLabel: "Enabled",
      offLabel: "Disabled",
    },
    notifications: {
      icon: "ri-mail-settings-line",
      title: "Email Notifications",
      description:
        "Receive email updates about leave approvals, payroll, holidays and announcements.",
      field: "emailNotificationsEnabled",
      onLabel: "Enabled",
      offLabel: "Disabled",
      defaultValue: true,
    },
    privacy: {
      icon: "ri-eye-off-line",
      title: "Privacy Settings",
      description:
        "When enabled, other employees can only see your name and department — not your contact details.",
      field: "profilePrivate",
      onLabel: "Private",
      offLabel: "Public",
    },
  };

  let currentUid = null;
  let currentUser = {};
  let activeToggleKey = null;

  /* =========================================================
     FIRESTORE: LOAD / SAVE
  ========================================================= */
  async function loadUserDoc(uid) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (error) {
      console.error("Failed to load profile:", error);
      showToast("error", "Could not load your profile.");
      return null;
    }
  }

  async function saveUserDoc(uid, updates) {
    try {
      await updateDoc(doc(db, "users", uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error("Failed to save profile:", error);
      showToast("error", "Could not save your changes.");
      return false;
    }
  }

  /* =========================================================
     AVATAR FALLBACK
     ----------------------------------------------------------
     Every <img> that shows the user's photo now always gets a
     real, valid src — either the uploaded photoURL, or a
     generated initials avatar. Nothing is ever left pointing at
     a placeholder/broken URL.
  ========================================================= */
  function buildInitialsAvatar(name) {
    const initials = encodeURIComponent((name || "U").trim().slice(0, 2));
    return `https://ui-avatars.com/api/?name=${initials}&background=6c5ce7&color=fff&bold=true`;
  }

  function setAvatarSrc(imgEl, photoURL, fallbackName) {
    if (!imgEl) return;
    const fallback = buildInitialsAvatar(fallbackName);
    imgEl.referrerPolicy = "no-referrer";
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = fallback;
    };
    imgEl.src = photoURL || fallback;
  }

  /* =========================================================
     PROFILE COMPLETION %
  ========================================================= */
  function computeCompletion(user) {
    const hasValue = (val) => {
      if (Array.isArray(val)) return val.length > 0;
      return val !== undefined && val !== null && String(val).trim() !== "";
    };

    const emp = user.employment || {};
    const topFilled = TOP_LEVEL_FIELDS.filter((key) =>
      hasValue(user[key]),
    ).length;
    const empFilled = EMPLOYMENT_KEYS.filter((key) =>
      hasValue(emp[key]),
    ).length;
    const total = TOP_LEVEL_FIELDS.length + EMPLOYMENT_KEYS.length;

    return Math.round(((topFilled + empFilled) / total) * 100);
  }

  function renderCompletion(percent) {
    const fg = $("#completionRingFg");
    const label = $("#completionPercent");
    const sub = $("#completionSub");
    if (!fg || !label) return;

    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (percent / 100) * circumference;
    fg.style.strokeDasharray = `${circumference}`;
    fg.style.strokeDashoffset = `${offset}`;
    label.textContent = `${percent}%`;

    if (sub) {
      sub.textContent =
        percent >= 100
          ? "Your profile is fully complete."
          : `Add more information to get 100%`;
    }
  }

  /* =========================================================
     RENDER: HERO CARD
  ========================================================= */
  function renderHero(user) {
    const nameEl = $("#profileName");
    const jobEl = $("#profileJobTitle");
    const emailEl = $("#profileEmail");
    const phoneEl = $("#profilePhone");
    const locationEl = $("#profileLocation");
    const empIdEl = $("#profileEmployeeId");
    const joinEl = $("#profileJoiningDate");
    const statusEl = $("#profileStatus");
    const verifiedEl = $("#verifiedBadge");
    const photoEl = $("#profilePhoto");

    const emp = user.employment || {};

    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.fullName ||
      "Unnamed Employee";

    if (nameEl) nameEl.textContent = fullName;
    if (jobEl) jobEl.textContent = emp.designation || "No title set";
    if (emailEl) emailEl.textContent = user.email || "—";
    if (phoneEl) phoneEl.textContent = user.phone || "Not added";
    if (locationEl) {
      const loc = [user.city, user.state].filter(Boolean).join(", ");
      locationEl.textContent = loc || "Not added";
    }
    if (empIdEl) empIdEl.textContent = emp.employeeId || "—";
    if (joinEl) {
      joinEl.textContent = emp.joiningDate
        ? new Date(emp.joiningDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—";
    }
    if (statusEl) {
      const active = (emp.status || "active").toLowerCase() === "active";
      statusEl.textContent = capitalize(emp.status || "Active");
      statusEl.className = `status-pill ${
        active ? "status-pill--active" : "status-pill--inactive"
      }`;
    }
    if (verifiedEl) verifiedEl.style.display = user.emailVerified ? "" : "none";

    // FIX: previously only set when photoSrc was truthy, leaving the
    // HTML's literal `src={img}` placeholder in place otherwise. Now
    // every avatar always gets either the real photo or a generated
    // initials fallback.
    setAvatarSrc($("#profilePhoto"), user.photoURL, fullName);
    setAvatarSrc($("#sidebarAvatar"), user.photoURL, fullName);
    setAvatarSrc($("#topbarAvatar"), user.photoURL, fullName);

    const sidebarName = $("#sidebarUserName");
    const sidebarRole = $("#sidebarUserRole");
    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarRole)
      sidebarRole.textContent =
        ROLE_LABELS[emp.role] || capitalize(emp.role || "Employee");
  }

  /* =========================================================
     RENDER: INFO GRIDS
  ========================================================= */
  function renderInfoGrid(gridId, fields) {
    const grid = $(gridId);
    if (!grid) return;
    grid.innerHTML = fields
      .map(
        (f) => `
      <div class="info-field">
        <span class="info-field__label">${f.label}</span>
        <span class="info-field__value">${f.value || "Not added"}</span>
      </div>`,
      )
      .join("");
  }

  function renderPersonalInfo(user) {
    renderInfoGrid("#personalInfoGrid", [
      { label: "First Name", value: user.firstName },
      { label: "Last Name", value: user.lastName },
      { label: "Email Address", value: user.email },
      { label: "Phone Number", value: user.phone },
      { label: "Gender", value: user.gender },
      {
        label: "Date of Birth",
        value: user.dob
          ? new Date(user.dob).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
      },
      { label: "Nationality", value: user.nationality },
      { label: "Marital Status", value: user.maritalStatus },
    ]);
  }

  function renderEmploymentInfo(user) {
    const emp = user.employment || {};
    renderInfoGrid("#employmentInfoGrid", [
      { label: "Department", value: emp.department },
      { label: "Designation", value: emp.designation },
      { label: "Employee ID", value: emp.employeeId },
      { label: "Reporting Manager", value: emp.reportingManager },
      { label: "Employment Type", value: emp.employmentType },
      {
        label: "Joining Date",
        value: emp.joiningDate
          ? new Date(emp.joiningDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
      },
      { label: "Status", value: capitalize(emp.status || "Active") },
      {
        label: "Role",
        value: ROLE_LABELS[emp.role] || capitalize(emp.role || "Employee"),
      },
      { label: "Office Location", value: emp.officeLocation },
      { label: "Current Project", value: emp.currentProject },
    ]);
  }

  function renderAddressInfo(user) {
    renderInfoGrid("#addressInfoGrid", [
      { label: "Street Address", value: user.addressLine1 },
      { label: "City", value: user.city },
      { label: "State", value: user.state },
      { label: "Zip Code", value: user.zipCode },
    ]);
  }

  /* =========================================================
     RENDER: SKILLS
  ========================================================= */
  function renderSkills(skills) {
    const wrap = $("#skillsWrap");
    if (!wrap) return;

    if (!skills || !skills.length) {
      wrap.innerHTML = `<p class="empty-state">No skills added yet. Click Edit Profile to add some.</p>`;
      return;
    }

    const visible = skills.slice(0, 8);
    const remaining = skills.length - visible.length;

    wrap.innerHTML =
      visible.map((s) => `<span class="skill-chip">${s}</span>`).join("") +
      (remaining > 0
        ? `<span class="skill-chip skill-chip--more">+${remaining} More</span>`
        : "");
  }

  /* =========================================================
     RENDER: ACCOUNT SETTINGS LIST
     ----------------------------------------------------------
     2FA, Email Notifications, and Privacy Settings each read
     their live value straight off `user` and show a real
     Enabled/Disabled (or Private/Public) chip — not a static
     placeholder — driven by TOGGLE_SETTINGS above.
  ========================================================= */
  function renderSettingsList(user) {
    const list = $("#settingsList");
    if (!list) return;

    const toggleChip = (key) => {
      const cfg = TOGGLE_SETTINGS[key];
      const value = user[cfg.field] ?? cfg.defaultValue ?? false;
      return {
        chip: value ? cfg.onLabel : cfg.offLabel,
        chipClass: value ? "chip-enabled" : "chip-disabled",
      };
    };

    const twoFa = toggleChip("2fa");
    const notif = toggleChip("notifications");
    const privacy = toggleChip("privacy");

    const items = [
      {
        icon: "ri-lock-password-line",
        label: "Change Password",
        action: "password",
      },
      {
        icon: TOGGLE_SETTINGS["2fa"].icon,
        label: TOGGLE_SETTINGS["2fa"].title,
        action: "2fa",
        chip: twoFa.chip,
        chipClass: twoFa.chipClass,
      },
      {
        icon: TOGGLE_SETTINGS.notifications.icon,
        label: TOGGLE_SETTINGS.notifications.title,
        action: "notifications",
        chip: notif.chip,
        chipClass: notif.chipClass,
      },
      {
        icon: TOGGLE_SETTINGS.privacy.icon,
        label: TOGGLE_SETTINGS.privacy.title,
        action: "privacy",
        chip: privacy.chip,
        chipClass: privacy.chipClass,
      },
      {
        icon: "ri-delete-bin-6-line",
        label: "Delete Account",
        action: "delete",
        danger: true,
      },
    ];

    list.innerHTML = items
      .map(
        (it) => `
      <li>
        <button class="settings-list__item ${it.danger ? "settings-list__item--danger" : ""}" data-settings-action="${it.action}">
          <i class="${it.icon}"></i>
          <span>${it.label}</span>
          ${it.chip ? `<span class="${it.chipClass}">${it.chip}</span>` : ""}
          <i class="ri-arrow-right-s-line"></i>
        </button>
      </li>`,
      )
      .join("");

    list.querySelectorAll("[data-settings-action]").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleSettingsAction(btn.dataset.settingsAction),
      );
    });
  }

  function handleSettingsAction(action) {
    if (action === "password") {
      window.location.href = "./change-password.html";
      return;
    }
    if (action === "delete") {
      openDeleteModal();
      return;
    }
    if (TOGGLE_SETTINGS[action]) {
      openToggleSettingModal(action);
      return;
    }
    showToast("success", "This setting is coming soon.");
  }

  /* =========================================================
     RENDER: RECENT ACTIVITY
  ========================================================= */
  function renderActivity(activity) {
    const list = $("#profileActivityList");
    if (!list) return;

    if (!activity || !activity.length) {
      list.innerHTML = `<p class="empty-state">No recent activity yet.</p>`;
      return;
    }

    list.innerHTML = activity
      .slice(0, 5)
      .map(
        (a) => `
      <li class="profile-activity-item">
        <span class="profile-activity-item__dot"></span>
        <div>
          <p class="profile-activity-item__title">${a.title}</p>
          <p class="profile-activity-item__time">${a.time}</p>
        </div>
      </li>`,
      )
      .join("");
  }

  /* =========================================================
     RENDER: EVERYTHING
  ========================================================= */
  function renderAll(user) {
    renderHero(user);
    renderPersonalInfo(user);
    renderEmploymentInfo(user);
    renderAddressInfo(user);
    renderSkills(user.skills || []);
    renderSettingsList(user);
    renderActivity(user.recentActivity || []);
    renderCompletion(computeCompletion(user));
  }

  /* =========================================================
     EDIT PROFILE MODAL
  ========================================================= */
  function openEditModal() {
    const overlay = $("#editModalOverlay");
    const form = $("#editProfileForm");
    if (!overlay || !form) return;

    const emp = currentUser.employment || {};

    Object.keys(currentUser).forEach((key) => {
      if (key === "employment") return;
      if (key === "skills") return;
      const field = form.elements.namedItem(key);
      if (field) field.value = currentUser[key] ?? "";
    });

    const skillsField = form.elements.namedItem("skills");
    if (skillsField) {
      skillsField.value = Array.isArray(currentUser.skills)
        ? currentUser.skills.join(", ")
        : "";
    }

    EMPLOYMENT_KEYS.forEach((key) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = emp[key] ?? "";
    });

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeEditModal() {
    const overlay = $("#editModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const saveBtn = $("#saveEditBtn");
    const formData = new FormData(form);
    const rawValues = {};
    formData.forEach((value, key) => {
      rawValues[key] = value.trim();
    });

    const topUpdates = {};
    const employmentUpdates = {};

    Object.keys(rawValues).forEach((key) => {
      if (key === "skills") return;
      if (EMPLOYMENT_KEYS.includes(key)) {
        employmentUpdates[key] = rawValues[key];
      } else {
        topUpdates[key] = rawValues[key];
      }
    });

    if (rawValues.skills !== undefined) {
      topUpdates.skills = rawValues.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const firestoreUpdates = { ...topUpdates };
    Object.keys(employmentUpdates).forEach((key) => {
      firestoreUpdates[`employment.${key}`] = employmentUpdates[key];
    });

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="ri-loader-4-line"></i> Saving…`;
    }

    const ok = await saveUserDoc(currentUid, firestoreUpdates);

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="ri-save-3-line"></i> Save Changes`;
    }

    if (!ok) return;

    currentUser = {
      ...currentUser,
      ...topUpdates,
      employment: { ...(currentUser.employment || {}), ...employmentUpdates },
    };
    renderAll(currentUser);
    closeEditModal();
    showToast("success", "Profile updated successfully.");
  }

  function setupEditModal() {
    const editBtn = $("#editProfileBtn");
    const completeNowBtn = $("#completeNowBtn");
    const closeBtn = $("#closeEditModal");
    const cancelBtn = $("#cancelEditBtn");
    const overlay = $("#editModalOverlay");
    const form = $("#editProfileForm");

    editBtn?.addEventListener("click", openEditModal);
    completeNowBtn?.addEventListener("click", openEditModal);
    closeBtn?.addEventListener("click", closeEditModal);
    cancelBtn?.addEventListener("click", closeEditModal);
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeEditModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay?.classList.contains("open")) {
        closeEditModal();
      }
    });
    form?.addEventListener("submit", handleEditSubmit);
  }

  /* =========================================================
     TOGGLE SETTING MODAL (2FA / Email Notifications / Privacy)
     ----------------------------------------------------------
     One generic modal reused for all three, driven entirely by
     TOGGLE_SETTINGS[action]. Saving writes the real field to
     the user's Firestore document and re-renders the settings
     list so the chip updates immediately.
  ========================================================= */
  function openToggleSettingModal(action) {
    const cfg = TOGGLE_SETTINGS[action];
    if (!cfg) return;
    activeToggleKey = action;

    const overlay = $("#toggleSettingModalOverlay");
    const icon = $("#toggleSettingIcon");
    const titleText = $("#toggleSettingTitleText");
    const desc = $("#toggleSettingDesc");
    const input = $("#toggleSettingInput");
    const stateLabel = $("#toggleSettingStateLabel");
    if (!overlay) return;

    const currentValue = currentUser[cfg.field] ?? cfg.defaultValue ?? false;

    icon.className = cfg.icon;
    titleText.textContent = cfg.title;
    desc.textContent = cfg.description;
    input.checked = currentValue;
    stateLabel.textContent = currentValue ? cfg.onLabel : cfg.offLabel;

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeToggleSettingModal() {
    const overlay = $("#toggleSettingModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    activeToggleKey = null;
  }

  async function handleSaveToggleSetting() {
    if (!activeToggleKey) return;
    const cfg = TOGGLE_SETTINGS[activeToggleKey];
    const input = $("#toggleSettingInput");
    const saveBtn = $("#saveToggleSettingBtn");
    const newValue = input.checked;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i class="ri-loader-4-line"></i> Saving…`;
    }

    const ok = await saveUserDoc(currentUid, { [cfg.field]: newValue });

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="ri-save-3-line"></i> Save`;
    }

    if (!ok) return;

    currentUser = { ...currentUser, [cfg.field]: newValue };
    renderSettingsList(currentUser);
    closeToggleSettingModal();
    showToast(
      "success",
      `${cfg.title} ${newValue ? cfg.onLabel.toLowerCase() : cfg.offLabel.toLowerCase()}.`,
    );
  }

  function setupToggleSettingModal() {
    const overlay = $("#toggleSettingModalOverlay");
    const closeBtn = $("#closeToggleSettingModal");
    const cancelBtn = $("#cancelToggleSettingBtn");
    const saveBtn = $("#saveToggleSettingBtn");
    const input = $("#toggleSettingInput");

    closeBtn?.addEventListener("click", closeToggleSettingModal);
    cancelBtn?.addEventListener("click", closeToggleSettingModal);
    saveBtn?.addEventListener("click", handleSaveToggleSetting);

    input?.addEventListener("change", () => {
      if (!activeToggleKey) return;
      const cfg = TOGGLE_SETTINGS[activeToggleKey];
      const stateLabel = $("#toggleSettingStateLabel");
      if (stateLabel) {
        stateLabel.textContent = input.checked ? cfg.onLabel : cfg.offLabel;
      }
    });

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeToggleSettingModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay?.classList.contains("open")) {
        closeToggleSettingModal();
      }
    });
  }

  /* =========================================================
     DELETE ACCOUNT CONFIRMATION MODAL
  ========================================================= */
  function openDeleteModal() {
    const overlay = $("#deleteAccountModalOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDeleteModal() {
    const overlay = $("#deleteAccountModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  function handleConfirmDelete() {
    closeDeleteModal();
    showToast("error", "Delete Account feature coming soon.");
  }

  function setupDeleteModal() {
    const overlay = $("#deleteAccountModalOverlay");
    const cancelBtn = $("#cancelDeleteAccountBtn");
    const confirmBtn = $("#confirmDeleteAccountBtn");

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
     PHOTO UPLOAD
  ========================================================= */
  function setupPhotoUpload() {
    const uploadBtn = $("#uploadPhotoBtn");
    const fileInput = $("#photoInput");
    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file || !currentUid) return;

      try {
        showToast("success", "Uploading photo…");
        const storage = getStorage();
        const fileRef = ref(
          storage,
          `profile-photos/${currentUid}/${Date.now()}-${file.name}`,
        );
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        const ok = await saveUserDoc(currentUid, { photoURL: url });
        if (ok) {
          currentUser.photoURL = url;
          renderHero(currentUser);
          renderCompletion(computeCompletion(currentUser));
          showToast("success", "Profile photo updated.");
        }
      } catch (error) {
        console.error("Photo upload failed:", error);
        showToast(
          "error",
          "Could not upload photo. Check Firebase Storage rules/config.",
        );
      } finally {
        fileInput.value = "";
      }
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
    setupEditModal();
    setupToggleSettingModal();
    setupDeleteModal();
    setupPhotoUpload();

    const auth = getAuth();
    onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) return;
      currentUid = fbUser.uid;

      const userDoc = await loadUserDoc(currentUid);

      currentUser = {
        email: fbUser.email || "",
        emailVerified: fbUser.emailVerified,
        photoURL: fbUser.photoURL || "",
        ...(userDoc || {}),
      };

      currentUser.photoURL =
        (userDoc && userDoc.photoURL) || fbUser.photoURL || "";

      renderAll(currentUser);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
