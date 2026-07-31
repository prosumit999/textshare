const savedTheme = localStorage.getItem("color-scheme");
const systemPrefersDark = window.matchMedia(
  "(prefers-color-scheme: dark)",
).matches;
const initialTheme = savedTheme || (systemPrefersDark ? "dark" : "light");
document.documentElement.setAttribute("data-theme", initialTheme);
document.documentElement.style.colorScheme = initialTheme;
