/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm Roasted Hearth & Deep Truffle base (human, cozy, authentic food brand)
        ink:   '#141210',
        gph:   '#1C1916',
        slate: { DEFAULT: '#27221E', 600: '#3D352F', 500: '#63564C', 400: '#8E7F73' },
        steel: '#786B60',
        mist:  '#A6998D',
        line:  '#E5DCD1',
        // Warm artisan bakery porcelain & clotted cream
        paper: '#FAF7F2',
        snow:  '#FFFFFF',
        cream: '#F2EAE0',
        parchment: '#EDE4D8',
        // Appetizing culinary golden amber, butter honey & hearth warm glow
        amber: {
          50:  '#FFFDF7',
          100: '#FEF8E7',
          200: '#FCEEC7',
          300: '#F9DC96',
          400: '#F5C249',
          500: '#E89C19',
          600: '#C9770B',
          700: '#A35808',
          800: '#81420B',
          900: '#66330D',
        },
        herb: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        rust: {
          500: '#C2410C',
          600: '#9A3412',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: { ultra: '0.3em', mega: '0.46em' },
      boxShadow: {
        'warm': '0 12px 32px -8px rgba(90, 52, 16, 0.14)',
        'warm-lg': '0 20px 48px -12px rgba(90, 52, 16, 0.22)',
        'hearth': '0 8px 24px -4px rgba(232, 156, 25, 0.18)',
        'glow': '0 0 28px rgba(245, 194, 73, 0.35)',
        'glow-lg': '0 0 50px rgba(245, 194, 73, 0.45)',
        'glass': '0 10px 36px 0 rgba(40, 25, 10, 0.08)',
        'glass-dark': '0 14px 40px 0 rgba(0, 0, 0, 0.55)',
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
