# IC-QR Project Context (Claude Code)

**Read this first in every session. Respuestas breves, sin explicaciones innecesarias.**

---

## Project at a Glance

- **What:** QR code generator + exporter (SVG, PDF, ZIP) for resort spots (mesas, camastros)
- **Stack:** Next.js (App Router) + TypeScript (strict) + Tailwind CSS + Material Design 3
- **Runtime:** Bun (no npm, no Python)
- **Design:** Desktop-first, responsive. UI team handles final design; dev owns logic + prop contracts
- **Process:** Spec-first always. `/speckit.specify` → plan → tasks → implement

---

## Before Every Request

1. **Check CONSTITUTION.md** — All rules, structure, patterns live there
2. **Reference `tailwind.config.js`** — Colors, spacing, shadows (tokens are the source of truth)
3. **Use component pattern** — Interface Props → variantStyles → baseStyles → finalStyles (no inline styles)
4. **Load only relevant code** — Don't paste entire files unless asked
5. **Reference by @path** — `@lib/qr-generator.ts` instead of pasting content

---

## Stack Rules (Immutable)

| What | Use | Don't |
|---|---|---|
| **QR** | `qrcode` npm package | External APIs, services |
| **PDF** | `pdf-lib` | reportlab, other PDF libs |
| **ZIP** | `archiver` | Manual file handling |
| **UI** | Tailwind CSS + Material Design 3 tokens | MUI, styled-components, inline styles |
| **Colors** | `tailwind.config.js` palette | Hardcoded hex, rgb() |
| **Spacing** | `tailwind.config.js` scale (px-4, py-6) | Arbitrary values like `px-[15px]` |
| **TypeScript** | Strict mode, all exports typed | any, @ts-ignore |
| **Runner** | Bun (`bun run dev`, `bun test`) | npm, yarn, pnpm |

---

## Component Pattern

```typescript
// Always this structure:
interface ComponentProps { /* ... */ }

export function Component(props: ComponentProps) {
  const variantStyles = { /* ... */ };      // Material Design variants
  const sizeStyles = { /* ... */ };          // Responsive sizes
  const baseStyles = 'flex gap-4 rounded-md'; // Base (reusable)
  const stateStyles = disabled ? 'opacity-50' : '';
  const shadowStyles = 'shadow-md hover:shadow-lg';
  
  const finalStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${stateStyles} ${shadowStyles}`;
  
  return <div className={finalStyles}>{/* no logic */}</div>;
}
```

**Logic goes in hooks/ (useQRGenerator, useExport, etc.), NOT in components.**

---

## File Locations

| Purpose | Path |
|---|---|
| **API endpoints** | `app/api/qr/route.ts`, `app/api/export/route.ts` |
| **React components** | `app/components/` |
| **Custom hooks** | `hooks/` (has logic) |
| **Library logic** | `lib/` (exporters, generators, types) |
| **Types** | `lib/types.ts` |
| **Data (constants)** | `data/properties.ts`, `data/tailwind-tokens.ts` |
| **Specs** | `specs/F*.md` |

---

## Tailwind + Material Design 3 Tokens

Available in `tailwind.config.js`:

**Colors:** primary-{50..900}, secondary-{50..900}, success, error, warning, info, neutral-{50..900}
**Spacing:** 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px), 12 (48px), 16 (64px), 20 (80px), 24 (96px)
**Text:** xs, sm, base, lg, xl, 2xl, 3xl, 4xl, 5xl (with weights and lineheight baked in)
**Shadows:** none, xs, sm, md, lg, xl, 2xl (elevation scale)
**Radius:** xs (4px), sm (8px), md (12px), lg (16px), xl (24px), 2xl (32px), full

---

## Commands

```bash
bun run dev              # Local dev
bun test                 # Run tests
bun run build            # Production build
```

---

## When to Ask

Before implementing, ask if:
- Adding new npm packages
- Changing `tailwind.config.js`
- Adding API routes not in spec
- Performance changes
- Testing strategy changes

---

## Red Flags (Don't Do These)

🚩 Hardcoded colors (`bg-[#ff0000]`)  
🚩 Arbitrary Tailwind values (`w-[433px]`)  
🚩 Inline styles in JSX  
🚩 CSS files alongside components  
🚩 Business logic in React components  
🚩 `any` type in TypeScript  
🚩 External QR APIs  
🚩 Python scripts  

---

## Design Handoff

- **Design team** owns: component styling, `tailwind.config.js` colors/fonts, visual iteration
- **Dev team** owns: API contracts, logic hooks, prop interfaces (frozen)
- **Both own:** Component acceptance criteria, responsive breakpoints

---

## Sessions Are Stateless

Each session is independent. Always:
- Reference CONSTITUTION.md for rules
- Load relevant spec first (`/speckit.specify`)
- Use `/clear` between features to reset context
- Reference files by @path instead of pasting
