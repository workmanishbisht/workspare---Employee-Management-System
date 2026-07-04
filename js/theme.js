(function () {
    const THEME_KEY = "emsTheme";
    const html = document.documentElement;

    // Load saved theme
    function loadTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);

        if (savedTheme === "dark") {
            html.classList.add("dark-theme");
        } else {
            html.classList.remove("dark-theme");
        }

        updateToggleUI();
    }

    // Update Toggle UI
    function updateToggleUI() {
        const lightBtn = document.getElementById("themeToggleLight");
        const darkBtn = document.getElementById("themeToggleDark");

        const isDark = html.classList.contains("dark-theme");

        if (lightBtn) {
            lightBtn.classList.toggle("theme-toggle__option--active", !isDark);
        }

        if (darkBtn) {
            darkBtn.classList.toggle("theme-toggle__option--active", isDark);
        }
    }

    // Toggle Theme
    function toggleTheme() {
        const isDark = html.classList.toggle("dark-theme");

        localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");

        updateToggleUI();
    }

    document.addEventListener("DOMContentLoaded", function () {
        loadTheme();

        const toggle = document.getElementById("themeToggle");

        if (toggle) {
            toggle.addEventListener("click", toggleTheme);
        }
    });
})();
