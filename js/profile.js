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

  let currentUid = null;
  let currentUser = {};

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

    const photoSrc = user.photoURL || "";
    if (photoEl && photoSrc) photoEl.src = photoSrc;

    const sidebarAvatar = $("#sidebarAvatar");
    const topbarAvatar = $("#topbarAvatar");
    if (sidebarAvatar && photoSrc) sidebarAvatar.src = photoSrc;
    if (topbarAvatar && photoSrc) topbarAvatar.src = photoSrc;

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
  ========================================================= */
  function renderSettingsList(user) {
    const list = $("#settingsList");
    if (!list) return;

    const items = [
      {
        icon: "ri-lock-password-line",
        label: "Change Password",
        action: "password",
      },
      {
        icon: "ri-shield-keyhole-line",
        label: "Two-Factor Authentication",
        action: "2fa",
        chip: user.twoFactorEnabled ? "Enabled" : null,
      },
      {
        icon: "ri-mail-settings-line",
        label: "Email Notifications",
        action: "notifications",
      },
      { icon: "ri-eye-off-line", label: "Privacy Settings", action: "privacy" },
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
          ${it.chip ? `<span class="chip-enabled">${it.chip}</span>` : ""}
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