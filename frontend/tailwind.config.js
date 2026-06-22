/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Deep navy = the mall's structure/signage; amber = the "open shop" energy
        mall: {
          900: "#0F1B2D",
          800: "#162338",
          700: "#1F3050",
          accent: "#E8A33D",
          accentDark: "#C9852A",
        },
        cream: "#F7F4EC",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
