/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eeeef0",
          200: "#d9d9de",
          300: "#b6b6bf",
          400: "#8b8b97",
          500: "#6b6b78",
          600: "#54545f",
          700: "#43434c",
          800: "#2a2a31",
          900: "#161619",
        },
        accent: {
          500: "#0a7d62",
          600: "#066952",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
