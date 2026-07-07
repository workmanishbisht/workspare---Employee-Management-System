/* ==========================================================
   THEME TOGGLE (Light / Dark)
   ----------------------------------------------------------
   Yeh script har page par alag se <script src="../js/theme.js">
   ke through load hoti hai (module nahi hai), isliye is single
   file ka fix hi har page par kaam karega.

   FIX: Pehle sirf CLICK par active class set ho rahi thi.
   Page load hote hi saved theme ke hisaab se koi bhi option
   "--active" nahi ban raha tha, isliye fresh page par toggle
   ka purple round background missing/wrong dikh raha tha.
   Ab niche "applyTheme()" function DOMContentLoaded (aur even
   isse pehle bhi, taaki flash na ho) par turant sahi option ko
   active kar deta hai.
========================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "theme"; // localStorage me save hone wali key
  const DARK_CLASS = "dark-theme"; // <html> par lagne wali class (dashboard.css yahi expect karta hai)

  /* ----------------------------------------------------------
     STEP 1: Page paint hone se PEHLE hi theme apply kar do
     (isse dark mode me halka sa "flash of light theme" nahi dikhega)
  ---------------------------------------------------------- */
  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;

    // Agar user ne kabhi manually toggle nahi kiya,
    // to system/browser preference use kar lo.
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyThemeClassToHtml(theme) {
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add(DARK_CLASS);
    } else {
      html.classList.remove(DARK_CLASS);
    }
  }

  // Turant apply (script body me hi, DOMContentLoaded ka wait nahi)
  const initialTheme = getPreferredTheme();
  applyThemeClassToHtml(initialTheme);

  /* ----------------------------------------------------------
     STEP 2: DOM ready hone ke baad toggle button ki UI (donon
     spans par --active class) ko current theme ke sath sync karo
  ---------------------------------------------------------- */
  function syncToggleUI(theme) {
    const lightBtn = document.getElementById("themeToggleLight");
    const darkBtn = document.getElementById("themeToggleDark");
    if (!lightBtn || !darkBtn) return;

    const ACTIVE = "theme-toggle__option--active";

    if (theme === "dark") {
      darkBtn.classList.add(ACTIVE);
      lightBtn.classList.remove(ACTIVE);
    } else {
      lightBtn.classList.add(ACTIVE);
      darkBtn.classList.remove(ACTIVE);
    }
  }

  function setTheme(theme) {
    applyThemeClassToHtml(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    syncToggleUI(theme);
  }

  function initThemeToggle() {
    // Page load hote hi correct button ko active dikhayein
    const currentTheme = document.documentElement.classList.contains(DARK_CLASS)
      ? "dark"
      : "light";
    syncToggleUI(currentTheme);

    const toggleBtn = document.getElementById("themeToggle");
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", () => {
      const isDark = document.documentElement.classList.contains(DARK_CLASS);
      setTheme(isDark ? "light" : "dark");
    });
  }

  document.addEventListener("DOMContentLoaded", initThemeToggle);
})();
