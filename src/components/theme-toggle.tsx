"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "upsa-project-hub-theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored === "dark" || stored === "light" ? stored : systemTheme();
    applyTheme(initial);
    setTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateFromSystem = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        const next = event.matches ? "dark" : "light";
        applyTheme(next);
        setTheme(next);
      }
    };
    const updateFromStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const next = event.newValue === "dark" || event.newValue === "light" ? event.newValue : systemTheme();
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener("change", updateFromSystem);
    window.addEventListener("storage", updateFromStorage);
    return () => {
      media.removeEventListener("change", updateFromSystem);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  function toggleTheme() {
    const activeTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next: Theme = activeTheme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="button ghost theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" /></svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
      )}
    </button>
  );
}
