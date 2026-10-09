"use client";

import { createTheme } from "@mui/material/styles";

/**
 * Tema único de la aplicación. Con cssVariables, MUI expone sus tokens como
 * --mui-* y globals.css los mapea a Tailwind (@theme inline), así que los
 * colores y la tipografía se definen solo aquí.
 *
 * Modo oscuro: se añadirá en la Fase 12 (colorSchemes.dark + InitColorSchemeScript).
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#274c69", contrastText: "#ffffff" },
        secondary: { main: "#8a5a19", contrastText: "#ffffff" },
        // Ámbar oscuro: el naranja por defecto de MUI no llega a 4.5:1 como texto sobre fondo claro.
        warning: { main: "#9a4f00", contrastText: "#ffffff" },
        text: { secondary: "rgba(0, 0, 0, 0.68)" },
        background: { default: "#f5f6f4", paper: "#ffffff" },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "var(--font-ui), system-ui, sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // El foco visible vive en globals.css (sin capa, para ganar a `outline: 0` de MUI).
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40, "@media (pointer: coarse)": { minHeight: 44 } } },
    },
    MuiIconButton: {
      // 40 px como mínimo (la guía recomienda 44 en pantallas táctiles); antes los pequeños medían 30.
      styleOverrides: { root: { minWidth: 40, minHeight: 40, "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 } } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { "@media (pointer: coarse)": { minHeight: 44 } } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { "@media (pointer: coarse)": { minHeight: 44 } } },
    },
    // Las ayudas y los errores de los campos se leen: 14 px en lugar de los 12 px de MUI.
    MuiFormHelperText: { styleOverrides: { root: { fontSize: "0.875rem", lineHeight: 1.4 } } },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
  },
});
