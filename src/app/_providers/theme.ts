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
        primary: { main: "#1f5c4d", contrastText: "#ffffff" },
        secondary: { main: "#8a5a19", contrastText: "#ffffff" },
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
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
  },
});
