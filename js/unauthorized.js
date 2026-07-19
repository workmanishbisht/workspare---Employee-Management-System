(function () {
  "use strict";

  /* ---------- 1. Resolve the logged-in user via layout.js ---------- */

  function resolveCurrentUser() {
    try {
      if (window.Layout && typeof window.Layout.getCurrentUser === "function") {
        return window.Layout.getCurrentUser();
      }
      if (window.EMS && window.EMS.layout && typeof window.EMS.layout.getCurrentUser === "function") {
        return window.EMS.layout.getCurrentUser();
      }
      if (typeof window.getCurrentUser === "function") {
        return window.getCurrentUser();
      }
    } catch (err) {
      console.warn("[unauthorized.js] Could not read current user from layout.js:", err);
    }
    // Fallback demo data so the page still renders correctly in isolation.
    return {
      name: "Manish Bisht",
      role: "HR Manager",
      photoUrl: null
    };
  }

  function getInitials(name) {
    if (!name) return "?";
    var parts = name.trim().split(/\s+/);
    var first = parts[0] ? parts[0][0] : "";
    var last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function renderUser() {
    var user = resolveCurrentUser() || {};
    var avatarEl = document.getElementById("uaUserAvatar");
    var nameEl = document.getElementById("uaUserName");
    var roleEl = document.getElementById("uaUserRole");

    if (nameEl) nameEl.textContent = user.name || "Unknown User";
    if (roleEl) roleEl.textContent = user.role || "";

    if (avatarEl) {
      if (user.photoUrl) {
        avatarEl.style.backgroundImage = "url('" + user.photoUrl + "')";
        avatarEl.style.backgroundSize = "cover";
        avatarEl.style.backgroundPosition = "center";
        avatarEl.textContent = "";
      } else {
        avatarEl.textContent = getInitials(user.name);
      }
    }

    return user;
  }

  /* ---------- 2. Permission context (role attempted vs. required) ---------- */

  function renderPermissionContext(user) {
    var params = new URLSearchParams(window.location.search);

    var currentRoleEl = document.getElementById("uaCurrentRole");
    var requestedModuleEl = document.getElementById("uaRequestedModule");

    var currentRole = params.get("role") || (user && user.role) || "HR";
    var requestedModule = params.get("module") || "Payroll";

    if (currentRoleEl) currentRoleEl.textContent = currentRole;
    if (requestedModuleEl) requestedModuleEl.textContent = requestedModule;
  }

  /* ---------- 3. Navigation ---------- */

  function wireActions() {
    var dashboardBtn = document.getElementById("uaBackDashboard");
    var backBtn = document.getElementById("uaGoBack");

    if (dashboardBtn) {
      dashboardBtn.addEventListener("click", function () {
        window.location.href = "./dashboard.html";
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        history.back();
      });
    }
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    var user = renderUser();
    renderPermissionContext(user);
    wireActions();
  });
})();