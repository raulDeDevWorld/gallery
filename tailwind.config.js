/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "nav-bg": "rgb(var(--nav-bg) / <alpha-value>)",
        "nav-text": "rgb(var(--nav-text) / <alpha-value>)",
        "sidebar-bg": "rgb(var(--sidebar-bg) / <alpha-value>)",
        "sidebar-surface": "rgb(var(--sidebar-surface) / <alpha-value>)",
        "sidebar-text": "rgb(var(--sidebar-text) / <alpha-value>)",
        "sidebar-muted": "rgb(var(--sidebar-muted) / <alpha-value>)",
        "sidebar-border": "rgb(var(--sidebar-border) / <alpha-value>)",
        "thead-bg": "rgb(var(--thead-bg) / <alpha-value>)",
        "thead-text": "rgb(var(--thead-text) / <alpha-value>)",
        "thead-muted": "rgb(var(--thead-muted) / <alpha-value>)",
        "thead-border": "rgb(var(--thead-border) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
