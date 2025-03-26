/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"], // Include all file types
  theme: {
    extend: {
      fontFamily: {
        sans: ['Klavika', 'ui-sans-serif', 'system-ui', 'Arial', 'sans-serif'],
        optimistic: ['Optimistic Display', 'ui-sans-serif', 'system-ui', 'sans-serif'], // Add Optimistic Display
      },
    },
  },
  plugins: [],
};
