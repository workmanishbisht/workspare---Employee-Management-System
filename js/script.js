/* ==========================================================
   VIEW SWITCHING (Login / Signup / Forgot Password)
========================================================== */

function switchView(viewName) {
  const body = document.getElementById("authBody");
  if (!body) return;

  document.querySelectorAll(".auth-view").forEach((view) => {
    view.classList.toggle("auth-view--active", view.dataset.view === viewName);
  });

  body.dataset.view = viewName;

  if (viewName === "forgot") {
    const requestPanel = document.getElementById("forgotRequestPanel");
    const successPanel = document.getElementById("resetSuccess");
    if (requestPanel) requestPanel.style.display = "";
    if (successPanel) successPanel.style.display = "none";
  }
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-switch-view]");
  if (!trigger) return;

  e.preventDefault();
  switchView(trigger.dataset.switchView);
});

document.addEventListener("password-reset:sent", () => {
  const requestPanel = document.getElementById("forgotRequestPanel");
  const successPanel = document.getElementById("resetSuccess");
  if (requestPanel) requestPanel.style.display = "none";
  if (successPanel) successPanel.style.display = "";
});

/* ==========================================================
   PASSWORD SHOW / HIDE TOGGLE
========================================================== */

document.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest(".form-field__toggle");
  if (!toggleBtn) return;

  const targetId = toggleBtn.dataset.target;
  const input = document.getElementById(targetId);
  if (!input) return;

  const icon = toggleBtn.querySelector("i");
  const isHidden = input.type === "password";

  input.type = isHidden ? "text" : "password";

  if (icon) {
    icon.classList.toggle("ri-eye-line", !isHidden);
    icon.classList.toggle("ri-eye-off-line", isHidden);
  }

  toggleBtn.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password",
  );
});

/* ==========================================================
   CUSTOM ROLE SELECT DROPDOWN
========================================================== */

function closeRoleDropdown() {
  const field = document.getElementById("roleField");
  const trigger = document.getElementById("roleSelectTrigger");
  if (!field) return;
  field.classList.remove("custom-select--open");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("#roleSelectTrigger");
  const field = document.getElementById("roleField");

  if (trigger && field) {
    e.stopPropagation();
    const isOpen = field.classList.contains("custom-select--open");
    closeRoleDropdown();
    if (!isOpen) {
      field.classList.add("custom-select--open");
      trigger.setAttribute("aria-expanded", "true");
    }
    return;
  }

  const option = e.target.closest(".custom-select__option");
  if (option) {
    const nativeSelect = document.getElementById("roleSelect");
    const valueLabel = document.getElementById("roleSelectValue");
    if (!nativeSelect || !valueLabel) return;

    const value = option.dataset.value;
    const label = option.textContent.trim();

    nativeSelect.value = value;
    nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));

    valueLabel.textContent = label;
    valueLabel.classList.remove("custom-select__value--placeholder");

    const dropdown = option.closest("#roleSelectDropdown");
    if (dropdown) {
      dropdown.querySelectorAll(".custom-select__option").forEach((opt) => {
        opt.setAttribute("aria-selected", opt === option ? "true" : "false");
      });
    }

    closeRoleDropdown();
    return;
  }

  if (!e.target.closest("#roleField")) {
    closeRoleDropdown();
  }
});

document.addEventListener("keydown", (e) => {
  const trigger = e.target.closest("#roleSelectTrigger");
  if (!trigger) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    trigger.click();
  } else if (e.key === "Escape") {
    closeRoleDropdown();
  }
});

document.addEventListener("role-select:reset", () => {
  const valueLabel = document.getElementById("roleSelectValue");
  if (!valueLabel) return;

  valueLabel.textContent = "Select your role";
  valueLabel.classList.add("custom-select__value--placeholder");
  document
    .querySelectorAll("#roleSelectDropdown .custom-select__option")
    .forEach((opt) => opt.setAttribute("aria-selected", "false"));

  closeRoleDropdown();
});
