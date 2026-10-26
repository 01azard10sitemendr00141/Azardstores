/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        mall: {
          900: "#0F1B2D",
          800: "#162338",
          700: "#1F3050",
          accent: "#1683FF",
          accentDark: "#1273E0",
          orange: "#FF6900",
          orangeDark: "#E05A00",
        },
        cream: "#F7F4EC",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
