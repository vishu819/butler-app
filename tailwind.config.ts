import type { Config } from "tailwindcss";

const config: Config = {
  // Keep "class" strategy so stray `dark:` variants never trigger from OS
  // preference — the app is intentionally light-only. We never add `.dark`.
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7fbe6",
          100: "#eef7c9",
          200: "#dcef95",
          300: "#c8f135",
          400: "#b6dd1f",
          500: "#9dbf19",
          600: "#7c9713",
          700: "#5a6b0e",
        },
        charcoal: {
          DEFAULT: "#111112",
          soft: "#1c1c1e",
          line: "#2a2a2c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
