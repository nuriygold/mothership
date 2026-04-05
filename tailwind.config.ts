import type { Config } from 'tailwindcss';
import animate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#faf9f8",
        surface: "#ffffff",
        panel: "#ffffff",
        border: "rgba(196,149,159,0.15)",
        primary: "#c4959f",
        accent: "#b8c5e0",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [animate],
};

export default config;
