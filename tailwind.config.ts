import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FBF8F2',
          100: '#F7F1E6',
          200: '#EFE7D5',
        },
        sage: {
          50: '#F2F6F1',
          100: '#E0EBDE',
          200: '#BFD4BB',
          300: '#9CBA96',
          400: '#7AA174',
          500: '#5C8559',
          600: '#466942',
          700: '#375433',
          800: '#2A3F26',
          900: '#1F2D1C',
        },
        terracotta: {
          50: '#FBEFE9',
          100: '#F4D7C8',
          200: '#E8B396',
          300: '#D88E66',
          400: '#C5703F',
          500: '#A85A2F',
          600: '#8A4822',
          700: '#6B361A',
        },
        gold: {
          50: '#FBF6E6',
          100: '#F4E7B7',
          200: '#E8D178',
          300: '#D3B848',
          400: '#B79A2F',
          500: '#8F7920',
        },
        ink: {
          900: '#1F2326',
          700: '#3B434A',
          500: '#5C6770',
          400: '#76808A',
          300: '#9AA4AE',
        },
        border: {
          DEFAULT: '#D8D2C4',
          strong: '#B7AE9A',
        },
        danger: {
          700: '#9B1C1C',
          500: '#C53030',
          100: '#FEE2E2',
        },
        success: {
          700: '#1F7A36',
          500: '#2F8B45',
          100: '#DBF1DE',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,35,38,0.04), 0 8px 24px -12px rgba(31,35,38,0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
