/**
 * Tailwind + Material Design 3 Tokens
 * Source: tailwind.config.js
 * Este archivo es referencia para componentes y diseño.
 * NO editar directamente; los valores viven en tailwind.config.js
 */

export const TOKENS = {
  colors: {
    primary: {
      50: '#e3f2fd',
      100: '#bbdefb',
      200: '#90caf9',
      300: '#64b5f6',
      400: '#42a5f5',
      500: '#2196f3', // Main
      600: '#1e88e5',
      700: '#1976d2',
      800: '#1565c0',
      900: '#0d47a1',
    },
    secondary: {
      50: '#f3e5f5',
      100: '#e1bee7',
      200: '#ce93d8',
      300: '#ba68c8',
      400: '#ab47bc',
      500: '#9c27b0', // Main
      600: '#8e24aa',
      700: '#7b1fa2',
      800: '#6a1b9a',
      900: '#4a148c',
    },
    success: {
      50: '#e8f5e9',
      100: '#c8e6c9',
      200: '#a5d6a7',
      300: '#81c784',
      400: '#66bb6a',
      500: '#4caf50', // Main
      600: '#43a047',
      700: '#388e3c',
      800: '#2e7d32',
      900: '#1b5e20',
    },
    error: {
      50: '#ffebee',
      100: '#ffcdd2',
      200: '#ef9a9a',
      300: '#e57373',
      400: '#ef5350',
      500: '#f44336', // Main
      600: '#e53935',
      700: '#d32f2f',
      800: '#c62828',
      900: '#b71c1c',
    },
    warning: {
      50: '#fff3e0',
      100: '#ffe0b2',
      200: '#ffcc80',
      300: '#ffb74d',
      400: '#ffa726',
      500: '#ff9800', // Main
      600: '#fb8c00',
      700: '#f57c00',
      800: '#e65100',
      900: '#bf360c',
    },
    info: {
      50: '#e0f2f1',
      100: '#b2dfdb',
      200: '#80cbc4',
      300: '#4db6ac',
      400: '#26a69a',
      500: '#009688', // Main
      600: '#00897b',
      700: '#00796b',
      800: '#00695c',
      900: '#004d40',
    },
    neutral: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#eeeeee',
      300: '#e0e0e0',
      400: '#bdbdbd',
      500: '#9e9e9e', // Main
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121',
    },
  },

  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
  },

  fontFamily: {
    sans: 'Gotham (local: public/fonts/) -> class: font-sans',
  },

  typography: {
    displayLarge: {
      size: '57px',
      weight: '700',
      lineHeight: '64px',
      class: 'text-5xl',
    },
    displayMedium: {
      size: '45px',
      weight: '700',
      lineHeight: '52px',
      class: 'text-4xl',
    },
    displaySmall: {
      size: '36px',
      weight: '700',
      lineHeight: '44px',
      class: 'text-3xl',
    },
    headlineSmall: {
      size: '24px',
      weight: '500',
      lineHeight: '32px',
      class: 'text-2xl',
    },
    bodyLarge: {
      size: '16px',
      weight: '400',
      lineHeight: '24px',
      class: 'text-base',
    },
    bodyMedium: {
      size: '14px',
      weight: '500',
      lineHeight: '20px',
      class: 'text-sm',
    },
    bodySmall: {
      size: '12px',
      weight: '500',
      lineHeight: '16px',
      class: 'text-xs',
    },
  },

  shadows: {
    none: 'shadow-none',
    xs: 'shadow-xs',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    '2xl': 'shadow-2xl',
  },

  borderRadius: {
    xs: '4px (rounded-xs)',
    sm: '8px (rounded-sm)',
    md: '12px (rounded-md)',
    lg: '16px (rounded-lg)',
    xl: '24px (rounded-xl)',
    '2xl': '32px (rounded-2xl)',
    full: 'full circle (rounded-full)',
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

/**
 * Usage in components:
 *
 * // Colors
 * className="bg-primary-500 text-white"
 * className="hover:bg-primary-600"
 * className="border border-neutral-300"
 *
 * // Spacing
 * className="p-4 gap-6 mb-8"
 *
 * // Typography
 * className="text-2xl font-semibold"
 * className="text-base leading-relaxed"
 *
 * // Shadows
 * className="shadow-md hover:shadow-lg"
 *
 * // Radius
 * className="rounded-lg"
 *
 * // Responsive
 * className="p-4 md:p-6 lg:p-8"
 * className="text-sm md:text-base lg:text-lg"
 */