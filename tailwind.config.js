/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Luxury Velvet Obsidian & Deep Truffle base
        ink:  '#0E1015',
        gph:  '#16181F',
        slate:{ DEFAULT: '#232731', 600: '#3A404E', 500: '#5F6B7E', 400: '#8E9BAE' },
        steel:'#6B7588',
        mist: '#9EA8B6',
        line: '#D8DEE6',
        // Warm artisan porcelain & studio cream
        paper:'#F4F5F8',
        snow: '#FFFFFF',
        cream: '#E9ECF2',
        // Appetizing culinary golden amber & honey caramel
        amber: {
          50: '#FFFDF5',
          100: '#FEF9E6',
          200: '#FDEBB3',
          300: '#FCD77A',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        herb: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: { ultra: '0.3em', mega: '0.46em' },
      boxShadow: {
        'warm': '0 14px 34px -10px rgba(180, 83, 9, 0.18)',
        'glow': '0 0 30px rgba(245, 158, 11, 0.32)',
        'glow-lg': '0 0 50px rgba(245, 158, 11, 0.45)',
        'glass': '0 10px 36px 0 rgba(0, 0, 0, 0.12)',
        'glass-dark': '0 12px 40px 0 rgba(0, 0, 0, 0.45)',
      },
      transitionTimingFunction: {
        cine: 'cubic-bezier(0.16, 1, 0.3, 1)',
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(18px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseSlow: { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.85', transform: 'scale(1.03)' } },
        toastSlide: { '0%': { transform: 'translateY(100%) scale(0.9)', opacity: '0' }, '100%': { transform: 'translateY(0) scale(1)', opacity: '1' } },
        auroraFloat: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.7' },
          '50%': { transform: 'translate3d(6%, -4%, 0) scale(1.12)', opacity: '0.95' },
        },
        // Red/amber edge flash for the incoming-order alarm screen.
        alarmFlash: {
          '0%, 100%': { boxShadow: 'inset 0 0 0 6px rgba(244, 63, 94, 0.9), 0 0 60px rgba(244, 63, 94, 0.5)' },
          '50%': { boxShadow: 'inset 0 0 0 6px rgba(251, 191, 36, 0.9), 0 0 90px rgba(251, 191, 36, 0.55)' },
        },
        bellRing: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%': { transform: 'rotate(18deg)' },
          '40%': { transform: 'rotate(-14deg)' },
          '60%': { transform: 'rotate(10deg)' },
          '80%': { transform: 'rotate(-6deg)' },
        },
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
        pulseSlow: 'pulseSlow 4s ease-in-out infinite',
        toast: 'toastSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        aurora: 'auroraFloat 18s ease-in-out infinite',
        alarm: 'alarmFlash 1.1s ease-in-out infinite',
        bell: 'bellRing 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
