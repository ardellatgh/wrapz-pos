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
          red: "#b91c1c",
          yellow: "#c9a227",
          bg: "#FAF9F6",
          text: "#1A1A1A",
        },
        semantic: {
          success: "#2E7D32",
          warning: "#b45309",
          danger: "#991b1b",
          info: "#0369a1",
        },
      },
      fontFamily: {
        /** Bold condensed sans for titles, KPI numerals, brand */
        narrow: [
          "var(--font-barlow-condensed)",
          "var(--font-manrope)",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-barlow-condensed)",
          "var(--font-manrope)",
          "system-ui",
          "sans-serif",
        ],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
