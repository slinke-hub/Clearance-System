import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#006C67',
          'teal-light': '#00857E',
          'teal-dark': '#004D49',
          gold: '#C8962E',
          'gold-light': '#E0B44A',
          'gold-dark': '#A07520',
        },
        surface: {
          DEFAULT: '#1A1F2E',
          raised: '#1E2438',
          overlay: '#242A3E',
          border: '#2D3450',
        },
        muted: '#8892A4',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-noto-arabic)', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #006C67 0%, #1A1F2E 50%, #0D1117 100%)',
        'card-gradient': 'linear-gradient(145deg, rgba(30,36,56,0.8) 0%, rgba(26,31,46,0.95) 100%)',
        'gold-gradient': 'linear-gradient(135deg, #C8962E, #E0B44A)',
        'teal-gradient': 'linear-gradient(135deg, #006C67, #00857E)',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        card: '0 4px 24px rgba(0, 0, 0, 0.3)',
        glow: '0 0 20px rgba(0, 108, 103, 0.4)',
        'gold-glow': '0 0 20px rgba(200, 150, 46, 0.3)',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'progress': 'progress 1s ease-in-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0, 108, 103, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(0, 108, 103, 0.7)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};

export default config;
