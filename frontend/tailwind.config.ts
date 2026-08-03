import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "on-tertiary-fixed": "#2a1700",
        "on-primary-fixed-variant": "#004c69",
        "secondary": "#bfc7d3",
        "on-tertiary-container": "#613b00",
        "on-tertiary": "#472a00",
        "on-primary": "#00354a",
        "surface-tint": "#7bd0ff",
        "inverse-surface": "#dee3e8",
        "outline": "#87929a",
        "on-secondary-container": "#b1b9c5",
        "on-secondary-fixed": "#141c25",
        "on-tertiary-fixed-variant": "#653e00",
        "surface-container-low": "#171c20",
        "error": "#ffb4ab",
        "on-primary-fixed": "#001e2c",
        "on-background": "#dee3e8",
        "tertiary-fixed-dim": "#ffb960",
        "background": "#0f1418",
        "primary-container": "#38bdf8",
        "secondary-container": "#424a54",
        "error-container": "#93000a",
        "surface-container-lowest": "#0a0f12",
        "surface": "#0f1418",
        "primary": "#8ed5ff",
        "surface-container-highest": "#303539",
        "inverse-on-surface": "#2c3135",
        "secondary-fixed": "#dbe3ef",
        "tertiary": "#ffc176",
        "on-error": "#690005",
        "surface-dim": "#0f1418",
        "surface-bright": "#343a3e",
        "on-surface": "#dee3e8",
        "secondary-fixed-dim": "#bfc7d3",
        "inverse-primary": "#00668a",
        "tertiary-fixed": "#ffddb8",
        "outline-variant": "#3e484f",
        "surface-variant": "#303539",
        "on-primary-container": "#004965",
        "on-error-container": "#ffdad6",
        "tertiary-container": "#f1a02b",
        "primary-fixed-dim": "#7bd0ff",
        "surface-container-high": "#252b2e",
        "primary-fixed": "#c4e7ff",
        "on-surface-variant": "#bdc8d1",
        "on-secondary-fixed-variant": "#404751",
        "surface-container": "#1b2026",
        "on-secondary": "#29313a"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        xl: "40px",
        lg: "24px",
        xs: "4px",
        "container-max": "1200px",
        gutter: "16px",
        base: "4px",
        sm: "8px",
        md: "16px"
      },
      fontFamily: {
        "label-caps": ["Inter", "sans-serif"],
        "display-lg-mobile": ["Inter", "sans-serif"],
        "body-base": ["Inter", "sans-serif"],
        "display-lg": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "code-block": ["JetBrains Mono", "monospace"],
        "body-sm": ["Inter", "sans-serif"]
      },
      fontSize: {
        "label-caps": ["11px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "display-lg-mobile": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "body-base": ["14px", { lineHeight: "22px", fontWeight: "400" }],
        "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "code-block": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }]
      },
      animation: {
        "spin-slow": "spin-slow 1s linear infinite",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(56, 189, 248, 0.4)" },
          "70%": { boxShadow: "0 0 0 8px rgba(56, 189, 248, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(56, 189, 248, 0)" },
        },
      }
    },
  },
  plugins: [],
};

export default config;
