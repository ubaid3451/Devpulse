"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "midnight" | "cyberpunk";

export interface ThemeOption {
  id: Theme;
  name: string;
  icon: string;
  description: string;
  preview: {
    bg: string;
    surface: string;
    primary: string;
  };
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "dark",
    name: "Dark",
    icon: "dark_mode",
    description: "Classic deep slate developer dark theme",
    preview: {
      bg: "#0f1418",
      surface: "#171c20",
      primary: "#8ed5ff",
    },
  },
  {
    id: "light",
    name: "Light",
    icon: "light_mode",
    description: "Crisp, clean high-contrast light theme",
    preview: {
      bg: "#f4f6f8",
      surface: "#ffffff",
      primary: "#0284c7",
    },
  },
  {
    id: "midnight",
    name: "Midnight OLED",
    icon: "contrast",
    description: "Pure true-black contrast for OLED displays",
    preview: {
      bg: "#000000",
      surface: "#0a0a0c",
      primary: "#38bdf8",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    icon: "palette",
    description: "Neon synthwave violet and hot pink glow",
    preview: {
      bg: "#13091f",
      surface: "#1f1033",
      primary: "#ff2a85",
    },
  },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  availableThemes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  availableThemes: THEME_OPTIONS,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = (localStorage.getItem("devpulse_theme") as Theme) || "dark";
      const validTheme = THEME_OPTIONS.some((t) => t.id === saved) ? saved : "dark";
      setThemeState(validTheme);
      applyThemeToDocument(validTheme);
    } catch {
      applyThemeToDocument("dark");
    }
    setMounted(true);
  }, []);

  const applyThemeToDocument = (t: Theme) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", t);
    if (t === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("devpulse_theme", newTheme);
    } catch {}
    applyThemeToDocument(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes: THEME_OPTIONS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
