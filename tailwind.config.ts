import type { Config } from 'tailwindcss';

/**
 * Helper for legacy color-name function-reference aliases.
 *
 * Tailwind 3.x supports function-reference values in `theme.extend.colors`
 * (https://tailwindcss.com/docs/customizing-colors#using-a-function-to-access-your-theme-values),
 * but its `Config` TypeScript type doesn't model the pattern — it expects
 * `string | RecursiveKeyValuePair<string, string>`. We work around that
 * with `any` (assignable to anything), while the runtime behaviour is
 * unchanged: Tailwind calls the returned function with `{ theme }` and
 * uses the resolved color object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacyAlias = (key: string): any =>
  ({ theme }: { theme: (path: string) => unknown }) =>
    theme(`colors.${key}`);

/**
 * Culinary-spice palette + semantic `flavor` tokens.
 *
 * Old color names (cream / sage / terracotta / gold / ink / border) are
 * kept as Tailwind function-reference aliases pointing into the new ramps
 * so every existing call site picks up the new palette without a mass
 * rename. Plan to drop the aliases in a follow-up tech-debt pass.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── NEW: culinary-spice palette ────────────────────────────────
        tomato: {
          50: '#FFF1ED',
          100: '#FFE0D6',
          200: '#FFBFA8',
          300: '#FF9B7A',
          400: '#F4714D',
          500: '#E94B23',
          600: '#C73818',
          700: '#A12A12',
          800: '#7A1E0B',
          900: '#561406',
        },
        basil: {
          50: '#F2FAEC',
          100: '#DFF5D2',
          200: '#B8E8A1',
          300: '#8BD56D',
          400: '#5FBD43',
          500: '#3FA52D',
          600: '#2D8621',
          700: '#1F6915',
          800: '#144D0C',
          900: '#0B3306',
        },
        turmeric: {
          50: '#FFF8E8',
          100: '#FFEFC1',
          200: '#FFE08A',
          300: '#FECC49',
          400: '#F4B721',
          500: '#D89500',
          600: '#B57900',
          700: '#8C5C00',
          800: '#654100',
          900: '#422900',
        },
        paprika: {
          50: '#FDEEF1',
          100: '#FAD3DA',
          200: '#F5A6B5',
          300: '#ED6F89',
          400: '#DE3F61',
          500: '#C9184A',
          600: '#A6113D',
          700: '#830B30',
          800: '#5F0622',
          900: '#3F0316',
        },
        lemon: {
          50: '#FFFAEB',
          100: '#FFF1C9',
          200: '#FFE388',
          300: '#FCD047',
          400: '#F7BC1A',
          500: '#DEA700',
          600: '#B68700',
          700: '#8C6700',
          800: '#634900',
          900: '#3F2E00',
        },
        eggplant: {
          50: '#F5F0FA',
          100: '#E5D6F2',
          200: '#CBADE3',
          300: '#AC7FD0',
          400: '#8A56B8',
          500: '#6A4C93',
          600: '#543876',
          700: '#3F2A5A',
          800: '#2B1C3F',
          900: '#1A1028',
        },
        lime: {
          50: '#F8FBEC',
          100: '#EEF6CC',
          200: '#DCEC9A',
          300: '#C7DD63',
          400: '#A7C957',
          500: '#82A534',
          600: '#647E25',
          700: '#4A5E1B',
          800: '#324010',
          900: '#1E260A',
        },
        pepper: {
          50: '#F2F4F4',
          100: '#DDE2E3',
          200: '#B8C2C5',
          300: '#8C9CA1',
          400: '#5E737A',
          500: '#3F5560',
          600: '#283D3B',
          700: '#1F2D2C',
          800: '#14201F',
          900: '#0B1312',
        },
        flour: {
          50: '#FFFDFA',
          100: '#FFF8F0',
          200: '#FFF1E0',
          300: '#FFE5C5',
          400: '#FFD9A8',
          500: '#F4C68A',
          600: '#D9A662',
          700: '#A87A45',
          800: '#7A572F',
          900: '#4E381E',
        },
        butter: {
          50: '#FFFEFA',
          100: '#FFF8E5',
          200: '#FFEFC9',
          300: '#FFE09A',
          400: '#FFCE68',
          500: '#E5B23F',
          600: '#C09030',
          700: '#8F6C20',
          800: '#604815',
          900: '#3D2D0D',
        },
        molasses: {
          50: '#F8F0EE',
          100: '#EBD9D2',
          200: '#D3B0A4',
          300: '#B58776',
          400: '#94614F',
          500: '#73463A',
          600: '#5A332A',
          700: '#42241D',
          800: '#2D1813',
          900: '#1B0D0A',
        },
        // ─── Semantic `flavor` tokens (use these for new code) ─────────
        flavor: {
          spice: '#E94B23', // tomato-500
          fresh: '#3FA52D', // basil-500
          warm: '#D89500', // turmeric-500
          deep: '#C9184A', // paprika-500
          bright: '#DEA700', // lemon-500
          dark: '#1F2D2C', // pepper-700
          bg: '#FFFDFA', // flour-50
          surface: '#FFF8E5', // butter-100
        },
        // ─── Semantic status colors (kept stable) ──────────────────────
        danger: {
          700: '#B91C1C',
          500: '#DC2626',
          100: '#FEE2E2',
        },
        success: {
          700: '#15803D',
          500: '#16A34A',
          100: '#DCFCE7',
        },
        // ─── Legacy aliases (one-cycle migration) ──────────────────────
        // Maps the old names to the new ramps via function references so
        // every existing `text-sage-700` etc. resolves to the new color
        // automatically. To be removed in a tech-debt follow-up.
        cream: legacyAlias('flour'),
        sage: legacyAlias('basil'),
        terracotta: legacyAlias('paprika'),
        gold: legacyAlias('turmeric'),
        ink: legacyAlias('pepper'),
        border: {
          DEFAULT: '#FFEFC9', // butter-200
          strong: '#A87A45', // flour-700 (warm tan for stronger lines)
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
          'Fraunces',
          'ui-serif',
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'Times',
          'serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,45,44,0.04), 0 8px 24px -12px rgba(31,45,44,0.12)',
        warm: '0 1px 2px rgba(233,75,35,0.10), 0 12px 28px -14px rgba(201,24,74,0.18)',
        plate: '0 2px 6px rgba(146,64,14,0.10), 0 18px 36px -16px rgba(146,64,14,0.22)',
      },
      borderRadius: {
        xl2: '1.25rem',
        plate: '2rem',
      },
      backgroundImage: {
        // Used by .section-warm and .section-spice utilities.
        'gradient-spice':
          'linear-gradient(135deg, #E94B23 0%, #C9184A 100%)',
        'gradient-fresh':
          'linear-gradient(135deg, #3FA52D 0%, #6A4C93 100%)',
        'gradient-warm':
          'linear-gradient(135deg, #FFF1E0 0%, #FFEFC9 100%)',
        'gradient-soft':
          'linear-gradient(180deg, #FFFDFA 0%, #FFF8E5 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'plate-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 320ms ease-out both',
        'plate-spin': 'plate-spin 22s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
