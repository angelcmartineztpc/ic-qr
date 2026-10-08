---
name: QR Production Generator
description: Herramienta de producción interna para armar placas con QR y exportar PDF vectorial.
colors:
  forest-green: "#1f5c4d"
  bronze: "#8a5a19"
  burnt-amber: "#9a4f00"
  paper-mist: "#f5f6f4"
  white-sheet: "#ffffff"
  ink-muted: "rgba(0, 0, 0, 0.68)"
typography:
  body:
    fontFamily: "Gotham, system-ui, sans-serif"
    fontWeight: 400
  headline:
    fontFamily: "Gotham, system-ui, sans-serif"
    fontWeight: 700
  label:
    fontFamily: "Gotham, system-ui, sans-serif"
    fontWeight: 500
rounded:
  md: "8px"
spacing:
  unit: "8px"
components:
  button-primary:
    backgroundColor: "{colors.forest-green}"
    textColor: "{colors.white-sheet}"
    rounded: "{rounded.md}"
    height: "40px"
---

# Design System: QR Production Generator

## Overview

**Creative North Star: "El taller ordenado"**

Interfaz de herramienta: sobria, densa lo justo, con un solo acento verde bosque sobre papel neutro. La UI se aparta para que la pieza (placa de 70×70 mm) sea lo único con carácter. Gotham vive solo en la interfaz; la tipografía de las piezas es fija e independiente.

**Key Characteristics:**
- Un acento (verde bosque) sobre superficies blancas y fondo gris cálido.
- Tres pasos en stepper: Piezas → Diseño → Exportar; cada pantalla con un propósito.
- Contornos finos en lugar de sombras; tarjetas `outlined`.
- Objetivos táctiles de 44 px en puntero grueso.

## Colors

Paleta restringida: un acento, neutros claros.

### Primary
- **Verde bosque** (#1f5c4d): acciones primarias, foco, paso activo.

### Secondary
- **Bronce** (#8a5a19): acento secundario puntual.
- **Ámbar quemado** (#9a4f00): advertencias; cumple 4.5:1 como texto.

### Neutral
- **Papel neblina** (#f5f6f4): fondo de la app.
- **Hoja blanca** (#ffffff): superficies y tarjetas.
- **Tinta atenuada** (rgba(0,0,0,0.68)): texto secundario.

### Named Rules
**The One Accent Rule.** El verde bosque es el único acento de la interfaz; los demás colores son solo estado.

## Typography

**Font:** Gotham (con system-ui como respaldo), solo en la UI.

**Character:** geométrica y clara; jerarquía por peso (700 títulos, 500 botones, 400 cuerpo).

### Hierarchy
- **Headline** (700): títulos de paso y panel.
- **Label** (500, sin mayúsculas forzadas): botones.
- **Body** (400): contenido y ayudas.

## Layout

Base de 8 px (MUI spacing) con utilidades Tailwind de 4 px. Breakpoints 600/900/1200/1536. Contenido en paneles; en móvil una sola columna sin scroll horizontal.

## Elevation & Depth

Plano: la profundidad se expresa con bordes de 1 px (divider) y cambio de superficie, sin sombras en reposo.

## Shapes

Esquinas de 8 px en botones, campos y tarjetas.

## Components

### Buttons
- **Shape:** radio 8 px; altura mínima 40 px (44 px con puntero grueso).
- **Primary:** verde bosque, texto blanco, sin elevación.
- **Focus:** contorno de 2 px en verde bosque con desfase de 2 px, solo con teclado.

### Cards / Containers
- **Corner Style:** 8 px; variante `outlined`, fondo blanco, sin sombra.

### Inputs / Fields
- **Style:** MUI TextField pequeño, ancho completo.

### Navigation
- Stepper de tres pasos con insignia del proyecto en la barra.

## Do's and Don'ts

### Do:
- **Do** usar los tokens del tema MUI (`--mui-palette-*`) o clases Tailwind; nunca colores literales en JSX.
- **Do** mantener contraste AA y foco visible.
- **Do** mantener la UI en español.

### Don't:
- **Don't** usar Gotham ni tocar la tipografía en las piezas.
- **Don't** añadir un segundo acento ni sombras decorativas.
- **Don't** repetir información entre pasos del stepper.
