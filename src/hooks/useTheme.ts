"use client";

import { useCallback } from "react";

export function useTheme() {
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("repconnect-theme", next);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { toggle };
}
