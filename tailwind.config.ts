import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          /** Main app background */
          bg: "#F5F5F5",
          /** Primary yellow */
          yellow: "#E8C547",
          /** Primary green */
          green: "#60AA68",
          /** Primary red */
          red: "#D45046",
          /** Fillable inputs / blanks */
          fill: "#E9EDF1",
          /** Secondary red (soft surfaces) */
          "red-soft": "#F0E2DF",
          /** Secondary yellow (soft surfaces) */
          "yellow-soft": "#EDE8D6",
          /** Carbon body text (not pure black) */
          text: "#2B2B2B",
        },
        semantic: {
          success: "#60AA68",
          warning: "#E8C547",
          danger: "#D45046",
          info: "#4A7C9B",
        },
      },
      fontFamily: {
        /** Bebas Neue — titles, KPI values, queue, branded numerals */
        display: ["var(--font-bebas-neue)", "var(--font-dm-sans)", "system-ui", "sans-serif"],
        /** Alias for legacy `font-narrow` usages */
        narrow: ["var(--font-bebas-neue)", "var(--font-dm-sans)", "system-ui", "sans-serif"],
        /** DM Sans — body, UI, tables, labels, forms */
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        /** Reference: compact labels ~10–11px */
        label: ["10px", { lineHeight: "1.35", letterSpacing: "0.04em" }],
        /** Reference: buttons ~13px */
        button: ["13px", { lineHeight: "1.3", fontWeight: "600" }],
      },
      boxShadow: {
        /** Reference-style soft elevation */
        card: "0 3px 12px rgba(15, 23, 42, 0.08)",
        lift: "0 10px 34px rgba(15, 23, 42, 0.12)",
      },
      borderRadius: {
        ref: "10px",
        "ref-sm": "6px",
      },
    },
  },
  plugins: [],
};

export default config;
