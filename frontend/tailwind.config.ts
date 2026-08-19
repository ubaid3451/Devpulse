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
        "on-tertiary-fixed": "var(--on-tertiary-fixed)",
        "on-primary-fixed-variant": "var(--on-primary-fixed-variant)",
        "secondary": "var(--secondary)",
        "on-tertiary-container": "var(--on-tertiary-container)",
        "on-tertiary": "var(--on-tertiary)",
        "on-primary": "var(--on-primary)",
        "surface-tint": "var(--surface-tint)",
        "inverse-surface": "var(--inverse-surface)",
        "outline": "var(--outline)",
        "on-secondary-container": "var(--on-secondary-container)",
        "on-secondary-fixed": "var(--on-secondary-fixed)",
        "on-tertiary-fixed-variant": "var(--on-tertiary-fixed-variant)",
        "surface-container-low": "var(--surface-container-low)",
        "error": "var(--error)",
        "on-primary-fixed": "var(--on-primary-fixed)",
        "on-background": "var(--on-background)",
        "tertiary-fixed-dim": "var(--tertiary-fixed-dim)",
        "background": "var(--background)",
        "primary-container": "var(--primary-container)",
        "secondary-container": "var(--secondary-container)",
        "error-container": "var(--error-container)",
        "surface-container-lowest": "var(--surface-container-lowest)",
        "surface": "var(--surface)",
        "primary": "var(--primary)",
        "surface-container-highest": "var(--surface-container-highest)",
        "inverse-on-surface": "var(--inverse-on-surface)",
        "secondary-fixed": "var(--secondary-fixed)",
        "tertiary": "var(--tertiary)",
        "on-error": "var(--on-error)",
        "surface-dim": "var(--surface-dim)",
        "surface-bright": "var(--surface-bright)",
        "on-surface": "var(--on-surface)",
        "secondary-fixed-dim": "var(--secondary-fixed-dim)",
        "inverse-primary": "var(--inverse-primary)",
        "tertiary-fixed": "var(--tertiary-fixed)",
        "outline-variant": "var(--outline-variant)",
        "surface-variant": "var(--surface-variant)",
        "on-primary-container": "var(--on-primary-container)",
        "on-error-container": "var(--on-error-container)",
        "tertiary-container": "var(--tertiary-container)",
        "primary-fixed-dim": "var(--primary-fixed-dim)",
        "surface-container-high": "var(--surface-container-high)",
        "primary-fixed": "var(--primary-fixed)",
        "on-surface-variant": "var(--on-surface-variant)",
        "on-secondary-fixed-variant": "var(--on-secondary-fixed-variant)",
        "surface-container": "var(--surface-container)",
        "on-secondary": "var(--on-secondary)",
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
