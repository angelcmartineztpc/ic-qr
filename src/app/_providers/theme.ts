"use client";

import { createTheme } from "@mui/material/styles";

/**
 * Tema único de la aplicación (Estilo Linear / Figma Studio).
 * Con cssVariables, MUI expone sus tokens como --mui-* y globals.css los mapea
 * a Tailwind (@theme inline), garantizando una única fuente de verdad visual.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        // Color primario oficial: RGB(39, 76, 105) = #274C69
        primary: { main: "#274C69", light: "#356488", dark: "#1b3549", contrastText: "#ffffff" },
        secondary: { main: "#475569", contrastText: "#ffffff" },
        // Ámbar, rojo y verde con contraste >= 4.5:1 (WCAG AA) sobre superficies claras.
        warning: { main: "#9a4f00", contrastText: "#ffffff" },
        error: { main: "#b91c1c", contrastText: "#ffffff" },
        success: { main: "#15803d", contrastText: "#ffffff" },
        text: { primary: "#0f172a", secondary: "#475569" },
        background: { default: "#f4f5f7", paper: "#ffffff" },
        divider: "rgba(15, 23, 42, 0.09)",
      },
    },
    dark: {
      palette: {
        // Identidad corporativa en modo oscuro: fondo sólido #274C69 + variante luminosa #6B9BC3 para legibilidad WCAG AA sobre fondos oscuros.
        primary: { main: "#274C69", light: "#6B9BC3", dark: "#1b3549", contrastText: "#ffffff" },
        secondary: { main: "#94a3b8", contrastText: "#0a0e12" },
        warning: { main: "#f59e0b", contrastText: "#0a0e12" },
        error: { main: "#f87171", contrastText: "#0a0e12" },
        success: { main: "#4ade80", contrastText: "#0a0e12" },
        text: { primary: "#f1f5f9", secondary: "#94a3b8" },
        // Material 3 Tonal Surfaces teñidas con el azul corporativo:
        background: { default: "#0a0e12", paper: "#121920" },
        divider: "rgba(255, 255, 255, 0.08)",
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "var(--font-ui), system-ui, sans-serif",
    h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.5rem", lineHeight: 1.25 },
    h5: { fontWeight: 600, letterSpacing: "-0.015em", fontSize: "1.25rem", lineHeight: 1.3 },
    h6: { fontWeight: 600, letterSpacing: "-0.01em", fontSize: "1rem", lineHeight: 1.35 },
    subtitle1: { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.4 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.5 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.45 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: "-0.005em" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // El foco visible vive en globals.css (sin capa, para ganar a `outline: 0` de MUI).
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 999,
          paddingInline: 18,
          "@media (pointer: coarse)": { minHeight: 44 },
          "&.MuiButton-containedPrimary": {
            backgroundColor: "#274C69",
            color: "#ffffff",
            "&:hover": {
              backgroundColor: "#1b3549",
            },
            ".dark &": {
              backgroundColor: "#274C69",
              color: "#ffffff",
              boxShadow: "inset 0 1px 0 0 rgba(107, 155, 195, 0.35), 0 0 0 1px rgba(107, 155, 195, 0.28)",
              "&:hover": {
                backgroundColor: "#315f82",
                boxShadow: "inset 0 1px 0 0 rgba(107, 155, 195, 0.5), 0 0 0 1px rgba(107, 155, 195, 0.4)",
              },
            },
          },
          "&.MuiButton-textPrimary": {
            ".dark &": {
              color: "#6B9BC3",
              "&:hover": {
                backgroundColor: "rgba(107, 155, 195, 0.12)",
              },
            },
          },
          "&.MuiButton-outlinedPrimary": {
            ".dark &": {
              color: "#6B9BC3",
              borderColor: "rgba(107, 155, 195, 0.4)",
              "&:hover": {
                borderColor: "#6B9BC3",
                backgroundColor: "rgba(107, 155, 195, 0.12)",
              },
            },
          },
        },
        sizeSmall: {
          minHeight: 36,
          paddingInline: 10,
          fontSize: "0.8125rem",
          "@media (pointer: coarse)": { minHeight: 40 },
        },
        sizeLarge: {
          minHeight: 42,
          paddingInline: 18,
          fontSize: "0.9375rem",
          "@media (pointer: coarse)": { minHeight: 44 },
        },
        outlined: {
          borderColor: "var(--mui-palette-divider)",
          "&:hover": {
            borderColor: "color-mix(in srgb, var(--mui-palette-text-primary) 24%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--mui-palette-text-primary) 4%, transparent)",
          },
          ".dark &:hover": {
            borderColor: "rgba(107, 155, 195, 0.35)",
            backgroundColor: "#1b242e",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 36,
          minHeight: 36,
          borderRadius: 8,
          "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 },
          ".dark &:hover": {
            backgroundColor: "#1b242e",
          },
        },
        sizeSmall: {
          minWidth: 36,
          minHeight: 36,
          "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 36,
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.8125rem",
          paddingInline: 12,
          borderColor: "var(--mui-palette-divider)",
          "@media (pointer: coarse)": { minHeight: 44 },
          ".dark &:hover": {
            backgroundColor: "#1b242e",
          },
          ".dark &.Mui-selected": {
            backgroundColor: "#274C69",
            color: "#ffffff",
            borderColor: "rgba(107, 155, 195, 0.35)",
            "&:hover": {
              backgroundColor: "#315f82",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
          "&.MuiChip-filledPrimary": {
            backgroundColor: "#274C69",
            color: "#ffffff",
            ".dark &": {
              backgroundColor: "#274C69",
              color: "#ffffff",
              boxShadow: "inset 0 0 0 1px rgba(107, 155, 195, 0.35)",
              "&:hover": {
                backgroundColor: "#315f82",
              },
            },
          },
        },
        sizeSmall: {
          height: 28,
          fontSize: "0.75rem",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          borderRadius: 16,
          border: "1px solid var(--mui-palette-divider)",
          ".dark &": {
            backgroundColor: "#1b242e",
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: "0.875rem",
          minHeight: 36,
          "@media (pointer: coarse)": { minHeight: 44 },
          ".dark &:hover": {
            backgroundColor: "rgba(107, 155, 195, 0.14)",
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: "#274C69",
          ".dark &": {
            color: "#6B9BC3",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: "var(--mui-palette-background-paper)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "color-mix(in srgb, var(--mui-palette-text-primary) 16%, transparent)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "color-mix(in srgb, var(--mui-palette-text-primary) 30%, transparent)",
          },
          ".dark &:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(107, 155, 195, 0.45)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--color-focus-ring, #274C69)",
            borderWidth: 2,
          },
        },
        sizeSmall: {
          minHeight: 38,
          fontSize: "0.875rem",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          ".dark &.Mui-focused": {
            color: "#6B9BC3",
          },
        },
        sizeSmall: {
          fontSize: "0.875rem",
        },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { fontSize: "0.8125rem", lineHeight: 1.4 } } },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: "28px 28px 12px 12px",
          backgroundImage: "none",
          border: "1px solid var(--mui-palette-divider)",
          ".dark &": {
            backgroundColor: "#121920",
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          fontSize: "1.0625rem",
          lineHeight: 1.35,
          padding: "16px 20px 12px",
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: "16px 20px",
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: "12px 20px 16px",
          gap: 8,
        },
      },
    },
  },
});
