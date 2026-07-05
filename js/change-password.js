/* ==========================================================
   IMPORTS
   NOTE: same assumptions as profile.js — db from firebase.js,
   auth pulled from the default Firebase app, and shared layout
   helpers from layout.js.
========================================================== */
import {
  getAuth,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
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

  let currentFbUser = null;

  /* =========================================================
     ELEMENTS
  ========================================================= */
  const form = () => $("#changePasswordForm");
  const currentPasswordInput = () => $("#currentPassword");
  const newPasswordInput = () => $("#newPassword");
  const confirmPasswordInput = () => $("#confirmPassword");
  const confirmError = () => $("#confirmError");
  const strengthMeter = () => $("#strengthMeter");
  const strengthFill = () => $("#strengthFill");
  const strengthLabel = () => $("#strengthLabel");
  const updateBtn = () => $("#updatePasswordBtn");

  /* =========================================================
     REQUIREMENT CHECKS
  ========================================================= */
  const REQUIREMENTS = {
    length: (pwd) => pwd.length >= 8,
    uppercase: (pwd) => /[A-Z]/.test(pwd),
    number: (pwd) => /[0-9]/.test(pwd),
    special: (pwd) => /[^A-Za-z0-9]/.test(pwd),
  };

  function evaluateRequirements(pwd) {
    const results = {};
    Object.keys(REQUIREMENTS).forEach((key) => {
      results[key] = REQUIREMENTS[key](pwd);
    });
    return results;
  }

  function renderRequirements(results) {
    Object.keys(results).forEach((key) => {
      const li = document.querySelector(`[data-req="${key}"]`);
      if (!li) return;
      const icon = li.querySelector("i");
      const met = results[key];
      li.classList.toggle("met", met);
      if (icon) {
        icon.className = met
          ? "ri-checkbox-circle-fill"
          : "ri-checkbox-blank-circle-line";
      }
    });
  }

  /* =========================================================
     PASSWORD STRENGTH
  ========================================================= */
  function computeStrength(pwd) {
    if (!pwd) return { score: 0, level: null, label: "—" };

    const results = evaluateRequirements(pwd);
    const metCount = Object.values(results).filter(Boolean).length;
    const hasLower = /[a-z]/.test(pwd);

    let score = metCount;
    if (hasLower) score += 0.5;
    if (pwd.length >= 12) score += 0.5;

    let level = "weak";
    let label = "Weak";

    if (score >= 4) {
      level = "strong";
      label = "Strong";
    } else if (score >= 2.5) {
      level = "medium";
      label = "Medium";
    }

    return { score, level, label };
  }

  function renderStrength(pwd) {
    const meter = strengthMeter();
    const fill = strengthFill();
    const label = strengthLabel();
    if (!meter || !fill || !label) return;

    const { level, label: text } = computeStrength(pwd);
    const pct = pwd.length === 0 ? 0 : level === "strong" ? 100 : level === "medium" ? 65 : 30;

    fill.style.width = `${pct}%`;
    label.textContent = text;
    if (level) {
      meter.setAttribute("data-level", level);
    } else {
      meter.removeAttribute("data-level");
    }
  }

  /* =========================================================
     SHOW / HIDE PASSWORD TOGGLES
  ========================================================= */
  function setupPasswordToggles() {
    document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;

        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";

        const icon = btn.querySelector("i");
        if (icon) {
          icon.className = isHidden ? "ri-eye-off-line" : "ri-eye-line";
        }
        btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      });
    });
  }

  /* =========================================================
     LIVE VALIDATION
  ========================================================= */
  function checkConfirmMatch() {
    const newPwd = newPasswordInput()?.value || "";
    const confirmPwd = confirmPasswordInput()?.value || "";
    const errorEl = confirmError();
    if (!errorEl) return true;

    if (confirmPwd.length === 0) {
      errorEl.textContent = "";
      return false;
    }
    if (newPwd !== confirmPwd) {
      errorEl.textContent = "Passwords do not match.";
      return false;
    }
    errorEl.textContent = "";
    return true;
  }

  function setupLiveValidation() {
    newPasswordInput()?.addEventListener("input", (e) => {
      const pwd = e.target.value;
      renderRequirements(evaluateRequirements(pwd));
      renderStrength(pwd);
      checkConfirmMatch();
    });

    confirmPasswordInput()?.addEventListener("input", checkConfirmMatch);
  }

  /* =========================================================
     RESET FORM
  ========================================================= */
  function resetForm() {
    form()?.reset();
    renderRequirements(evaluateRequirements(""));
    renderStrength("");
    const errorEl = confirmError();
    if (errorEl) errorEl.textContent = "";

    document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) input.type = "password";
      const icon = btn.querySelector("i");
      if (icon) icon.className = "ri-eye-line";
    });
  }

  /* =========================================================
     SUBMIT: FIREBASE PASSWORD UPDATE
  ========================================================= */
  async function handleSubmit(e) {
    e.preventDefault();

    const currentPwd = currentPasswordInput()?.value || "";
    const newPwd = newPasswordInput()?.value || "";
    const confirmPwd = confirmPasswordInput()?.value || "";

    if (!currentPwd) {
      showToast("error", "Please enter your current password.");
      return;
    }

    const reqResults = evaluateRequirements(newPwd);
    const allMet = Object.values(reqResults).every(Boolean);
    if (!allMet) {
      showToast("error", "New password doesn't meet all requirements yet.");
      return;
    }

    if (newPwd !== confirmPwd) {
      showToast("error", "New password and confirmation do not match.");
      return;
    }

    if (newPwd === currentPwd) {
      showToast("error", "New password must be different from the current one.");
      return;
    }

    if (!currentFbUser || !currentFbUser.email) {
      showToast("error", "Could not verify your account. Please log in again.");
      return;
    }

    const btn = updateBtn();
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="ri-loader-4-line"></i> Updating…`;
    }

    try {
      const credential = EmailAuthProvider.credential(currentFbUser.email, currentPwd);
      await reauthenticateWithCredential(currentFbUser, credential);
      await updatePassword(currentFbUser, newPwd);

      showToast("success", "Password updated successfully.");
      resetForm();
    } catch (error) {
      console.error("Password update failed:", error);
      let message = "Could not update password. Please try again.";

      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        message = "Current password is incorrect.";
      } else if (error.code === "auth/weak-password") {
        message = "New password is too weak.";
      } else if (error.code === "auth/requires-recent-login") {
        message = "Please log out and log back in, then try again.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      }

      showToast("error", message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="ri-shield-check-line"></i> Update Password`;
      }
    }
  }

  function setupCancel() {
    $("#cancelPasswordBtn")?.addEventListener("click", () => {
      resetForm();
      window.location.href = "./profile.html";
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
    setupPasswordToggles();
    setupLiveValidation();
    setupCancel();

    renderRequirements(evaluateRequirements(""));
    renderStrength("");

    form()?.addEventListener("submit", handleSubmit);

    const auth = getAuth();
    onAuthStateChanged(auth, (fbUser) => {
      currentFbUser = fbUser || null;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();