import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf6ee",
          100: "#f2e8d5",
          200: "#e6d4b0",
          300: "#d6b985",
          400: "#c9a86a",
          500: "#b8925a",
          600: "#a97f45",
          700: "#8a6537",
        },
      },
    },
  },
  plugins: [],
};

export default config;
