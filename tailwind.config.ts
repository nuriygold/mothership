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
        background: "hsl(210, 22%, 9%)",
        surface: "hsl(215, 16%, 12%)",
        panel: "hsl(220, 18%, 16%)",
        border: "hsl(218, 15%, 22%)",
        primary: "#7C3AED",
        accent: "#22d3ee",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [animate],
};

export default config;
