(function () {
  /* =========================================================
     THEME INIT
  ========================================================= */
  var THEME_KEY = "emsTheme";
  var htmlEl = document.documentElement;

  if (localStorage.getItem(THEME_KEY) === "dark") {
    htmlEl.classList.add("dark-theme");
  }

  /* THEME TOGGLE BUTTON */
  var themeToggle = document.getElementById("themeToggle");
  var themeLight = document.getElementById("themeToggleLight");
  var themeDark = document.getElementById("themeToggleDark");

  function syncToggleUI(isDark) {
    themeLight.classList.toggle("theme-toggle__option--active", !isDark);
    themeDark.classList.toggle("theme-toggle__option--active", isDark);
  }

  syncToggleUI(htmlEl.classList.contains("dark-theme"));

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var isDark = htmlEl.classList.toggle("dark-theme");
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
      syncToggleUI(isDark);
    });
  }

  /* =========================================================
     PASSWORD SHOW/HIDE (multiple fields, matched by data-target)
  ========================================================= */
  var passwordToggles = document.querySelectorAll(".form-field__toggle");

  passwordToggles.forEach(function (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      var targetId = toggleBtn.getAttribute("data-target");
      var input = document.getElementById(targetId);
      var icon = toggleBtn.querySelector("i");
      if (!input || !icon) return;

      var isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      icon.classList.toggle("ri-eye-line", !isHidden);
      icon.classList.toggle("ri-eye-off-line", isHidden);
    });
  });

  /* =========================================================
     VIEW SWITCHING (Login / Signup / Forgot Password)
  ========================================================= */
  var authBody = document.getElementById("authBody");
  var brandTrust = document.getElementById("brandTrust");

  var brandContent = {
    login: {
      line1: "Manage Employees.",
      line2: "Simplify",
      accent: "Success.",
      desc: "A complete solution to manage your workforce efficiently and effectively.",
      showFeatures: true,
      showTrust: false,
    },
    signup: {
      line1: "Join the Future.",
      line2: "Of",
      accent: "Workforce Management.",
      desc: "Create your account and start managing your team in minutes.",
      showFeatures: false,
      showTrust: true,
    },
    forgot: {
      line1: "Forgot Your",
      line2: "Password?",
      accent: "No Problem.",
      desc: "We'll help you get back into your account safely and securely.",
      showFeatures: false,
      showTrust: false,
    },
  };

  var brandHeadlineLine1 = document.getElementById("brandHeadlineLine1");
  var brandHeadlineLine2 = document.getElementById("brandHeadlineLine2");
  var brandHeadlineAccent = document.getElementById("brandHeadlineAccent");
  var brandHeadlineDesc = document.getElementById("brandHeadlineDesc");
  var brandFeatureList = document.getElementById("brandFeatureList");
  var formPanelInner = document.getElementById("formPanelInner");

  var authViews = document.querySelectorAll(".auth-view");

  function switchView(viewName) {
    var content = brandContent[viewName];

    authViews.forEach(function (view) {
      var isActive = view.getAttribute("data-view") === viewName;
      view.classList.toggle("auth-view--active", isActive);
      view.style.display = isActive ? "block" : "none";
    });

    if (formPanelInner) {
      formPanelInner.classList.toggle(
        "form-panel__inner--wide",
        viewName === "signup",
      );
    }

    if (content) {
      brandHeadlineLine1.textContent = content.line1;
      brandHeadlineLine2.textContent = content.line2;
      brandHeadlineAccent.textContent = content.accent;
      brandHeadlineDesc.textContent = content.desc;

      if (brandFeatureList) {
        brandFeatureList.style.display = content.showFeatures ? "" : "none";
      }
      if (brandTrust) {
        brandTrust.style.display = content.showTrust ? "flex" : "none";
      }
    }

    if (authBody) {
      authBody.setAttribute("data-view", viewName);
    }

    if (viewName === "forgot") {
      showForgotRequestPanel();
    }

    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-switch-view]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var target = link.getAttribute("data-switch-view");
      switchView(target);
    });
  });

  authViews.forEach(function (view) {
    var isActive = view.getAttribute("data-view") === "login";
    view.classList.toggle("auth-view--active", isActive);
    view.style.display = isActive ? "block" : "none";
  });

  /* =========================================================
     FORGOT PASSWORD: request -> success state
  ========================================================= */
  var forgotRequestPanel = document.getElementById("forgotRequestPanel");
  var resetSuccess = document.getElementById("resetSuccess");
  var forgotForm = document.getElementById("forgotForm");
  var forgotEmailInput = document.getElementById("forgotEmailInput");
  var sentEmailLabel = document.getElementById("sentEmailLabel");
  var resendLink = document.getElementById("resendLink");

  function showForgotRequestPanel() {
    if (forgotRequestPanel) forgotRequestPanel.classList.remove("is-hidden");
    if (resetSuccess) resetSuccess.classList.remove("is-visible");
  }

  function showResetSuccess(email) {
    if (forgotRequestPanel) forgotRequestPanel.classList.add("is-hidden");
    if (resetSuccess) resetSuccess.classList.add("is-visible");
    if (sentEmailLabel && email) sentEmailLabel.textContent = email;
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = forgotEmailInput ? forgotEmailInput.value : "";
      showResetSuccess(email);
    });
  }

  if (resendLink) {
    resendLink.addEventListener("click", function () {
      resendLink.textContent = "Link sent again!";
      setTimeout(function () {
        resendLink.textContent = "Click to resend";
      }, 2500);
    });
  }

  /* =========================================================
     LOGIN FORM SUBMIT
  ========================================================= */
  var loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
    });
  }

  /* =========================================================
     CUSTOM ROLE DROPDOWN
  ========================================================= */
  var roleTrigger = document.getElementById("roleSelectTrigger");
  var roleDropdown = document.getElementById("roleSelectDropdown");
  var roleValueLabel = document.getElementById("roleSelectValue");
  var roleNativeSelect = document.getElementById("roleSelect");
  var roleOptions = roleDropdown
    ? roleDropdown.querySelectorAll(".custom-select__option")
    : [];

  function closeRoleDropdown() {
    if (!roleDropdown || !roleTrigger) return;
    roleDropdown.classList.remove("is-open");
    roleTrigger.classList.remove("is-open");
    roleTrigger.setAttribute("aria-expanded", "false");
  }

  function openRoleDropdown() {
    if (!roleDropdown || !roleTrigger) return;
    roleDropdown.classList.add("is-open");
    roleTrigger.classList.add("is-open");
    roleTrigger.setAttribute("aria-expanded", "true");
  }

  function toggleRoleDropdown() {
    if (!roleDropdown) return;
    if (roleDropdown.classList.contains("is-open")) {
      closeRoleDropdown();
    } else {
      openRoleDropdown();
    }
  }

  function selectRoleOption(optionEl) {
    if (!optionEl || !roleNativeSelect || !roleValueLabel) return;

    var value = optionEl.getAttribute("data-value");
    var label = optionEl.textContent;

    roleNativeSelect.value = value;
    roleValueLabel.textContent = label;
    roleValueLabel.classList.remove("custom-select__value--placeholder");

    roleOptions.forEach(function (opt) {
      opt.classList.toggle("custom-select__option--selected", opt === optionEl);
    });

    roleNativeSelect.dispatchEvent(new Event("change", { bubbles: true }));

    closeRoleDropdown();
    roleTrigger.focus();
  }

  if (roleTrigger && roleDropdown) {
    roleTrigger.addEventListener("click", function () {
      toggleRoleDropdown();
    });

    roleTrigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleRoleDropdown();
      } else if (e.key === "Escape") {
        closeRoleDropdown();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        openRoleDropdown();
      }
    });

    roleOptions.forEach(function (optionEl) {
      optionEl.addEventListener("click", function () {
        selectRoleOption(optionEl);
      });
    });

    document.addEventListener("click", function (e) {
      if (!roleTrigger.contains(e.target) && !roleDropdown.contains(e.target)) {
        closeRoleDropdown();
      }
    });
  }

  /* =========================================================
     SIGNUP FORM SUBMIT
  ========================================================= */
  var signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var password = document.getElementById("signupPasswordInput");
      var confirmPassword = document.getElementById("confirmPasswordInput");

      if (
        password &&
        confirmPassword &&
        password.value !== confirmPassword.value
      ) {
        confirmPassword.setCustomValidity("Passwords do not match");
        confirmPassword.reportValidity();
        return;
      }
      if (confirmPassword) confirmPassword.setCustomValidity("");
    });

    var confirmPasswordInput = document.getElementById("confirmPasswordInput");
    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener("input", function () {
        confirmPasswordInput.setCustomValidity("");
      });
    }
  }
})();
