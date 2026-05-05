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
        background: "#F2F5FF",
        surface: "#FFFFFF",
        panel: "#FFFFFF",
        border: "rgba(100,130,200,0.18)",
        primary: "#00D9FF",
        accent: "#7B68EE",
        cyan: "#00D9FF",
        navy: "#0A1628",
        purple: "#7B68EE",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [animate],
};

export default config;
