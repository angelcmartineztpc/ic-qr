# IC-QR Project Constitution

**Last Updated:** 2026-10-06 (Tailwind + Material Design 3)  
**Owner:** Angel C. Martinez  
**Status:** Active

---

## Project Overview

**ic-qr** is a TypeScript-first QR code generation and export utility built with Next.js and Bun. All features must pass through spec-driven development before implementation. UI built with Tailwind CSS following Material Design 3 principles.

---

## Tech Stack (Immutable)

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Bun | Latest | Fast TypeScript execution, native bundling |
| **Framework** | Next.js | Latest | React + server rendering + API routes (App Router) |
| **Language** | TypeScript | Strict mode | Type safety, no runtime surprises |
| **Package Manager** | Bun | — | Replaces npm/yarn/pnpm |
| **Build Tool** | Bun native | — | Integrated; no webpack/esbuild config needed |
| **Testing** | Bun test | — | Built-in; no jest/vitest setup |
| **UI Framework** | Tailwind CSS | Latest | Utility-first CSS; Material Design 3 tokens |
| **Design System** | Material Design 3 | — | Colors, typography, spacing, components principles |
| **Theming** | tailwind.config.js | — | Centralized tokens (colors, scales, breakpoints) |

---

## Core Features (Locked)

### QR Code Generation
- **Library:** `qrcode` (npm package)
- **Constraint:** No external services (e.g., no QR code APIs)
- **Input:** Text, URL, or structured data
- **Output format:** Raw data for downstream processing

### Export Formats

| Format | Library | Input | Output | Notes |
|--------|---------|-------|--------|-------|
| **PDF** | `pdf-lib` | QR data | `.pdf` file | Embeddable in documents |
| **SVG** | Native (canvas → SVG) | QR data | `.svg` file | Scalable, editable |
| **ZIP** | `node archiver` | Multiple QRs | `.zip` archive | Batch export |

### UI Layer (Frontend)
- **Library:** Tailwind CSS + Material Design 3 tokens
- **Theming:** All colors, spacing, typography defined in `tailwind.config.js`
- **Components:** Presentational only (props in, events out) — no business logic
- **Pattern:** Interface Props → variantStyles → baseStyles → finalStyles (Tailwind classes)
- **Priority:** Desktop-first, responsive via Tailwind breakpoints (md:, lg:, xl:)
- **Responsibility:** Design team owns component iteration; dev team owns prop contracts

---

## Code Style & Constraints

### Always:
- **TypeScript strict mode** — no `any` type, no `@ts-ignore` without justification
- **Bun commands only** — `bun run`, `bun test`, `bun build`
- **No Python scripts** — All tooling and logic in TypeScript
- **Exported types** — Public API is fully typed; no implicit `any`
- **Error handling** — Explicit error types, no silent failures
- **Components presentational** — No business logic in React components; use custom hooks in `hooks/`
- **Tailwind tokens only** — All colors, fonts, spacing from `tailwind.config.js`; no inline styles or magic numbers
- **Theme at component level** — Never hardcode colors; use theme tokens from config
- **Colors from palette** — Only use colors defined in `tailwind.config.js`; no hardcoded `#fff` or `rgb()`
- **Spacing from scale** — Use Tailwind spacing units (px-4, py-6, etc.); never `px-[15px]`
- **Material Design principles** — Elevation (shadows), typography scale, responsive design

### Ask First (before implementing):
- Adding dependencies beyond `qrcode`, `pdf-lib`, `archiver`
- Database schema or persistence layer changes
- API route additions that aren't in an approved spec
- Performance optimizations affecting QR generation quality
- Changes to `tailwind.config.js` color palette

### Never:
- Commit `.env` or secrets to version control
- Remove or skip tests without justification
- Use external QR code generation services
- Mix TypeScript and JavaScript (`.js` files alongside `.ts`)
- Store generated QRs in version control (temp directories only)
- **Add component styles outside `tailwind.config.js`** — No CSS files, no inline styles
- **Put business logic in React components** — Use `hooks/` and `lib/`
- **Hardcode colors or spacing** — Always use theme tokens
- **Inline color values** — No `className="bg-[#ff0000]"` — use theme colors
- **Arbitrary Tailwind values** — No `w-[433px]` or `text-[17px]` — use scale
- **CSS files alongside components** — All styles via className and tailwind.config.js
- **Hardcoded breakpoints** — Use Tailwind defaults (sm:, md:, lg:, xl:, 2xl:)

---

## Project Structure

```
ic-qr/
├── app/
│   ├── api/
│   │   ├── qr/
│   │   │   └── route.ts         # QR generation endpoint
│   │   └── export/
│   │       └── route.ts         # Export handling endpoint
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── components/              # Presentational React components
│       ├── QRPreview.tsx
│       ├── PropertySelector.tsx
│       ├── ExportButtons.tsx
│       └── ...
├── lib/
│   ├── qr-generator.ts          # QR generation logic
│   ├── exporters/               # Export format handlers
│   │   ├── pdf.ts
│   │   ├── svg.ts
│   │   └── zip.ts
│   ├── types.ts                 # Shared type definitions
│   └── api-contracts.ts         # API request/response types
├── hooks/
│   ├── useQRGenerator.ts        # QR generation logic (custom hook)
│   ├── useExport.ts             # Export logic (custom hook)
│   └── ...
├── data/
│   ├── properties.ts            # Property definitions
│   └── tailwind-tokens.ts       # Tailwind token reference
├── specs/
│   ├── F1-data.md               # Feature 1 spec
│   ├── F2-qr-api.md             # Feature 2 spec
│   ├── F3-export-api.md         # Feature 3 spec
│   ├── F4-odp.md                # Feature 4 spec
│   └── F5-ui-andamio.md         # Feature 5 spec (UI skeleton)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── public/                      # Static assets
├── CONSTITUTION.md              # This file (immutable reference)
├── CLAUDE.md                    # Context for Claude Code sessions
├── tailwind-tokens.ts           # Token definitions
├── package.json
├── bunfig.toml
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── README.md
```

---

## Component Pattern (Tailwind + Material Design 3)

```typescript
import { Icon } from '@icons';

interface MiComponenteProps {
  variant?: 'primary' | 'secondary' | 'error';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function MiComponente({
  variant = 'primary',
  size = 'md',
  disabled = false,
}: MiComponenteProps) {
  // Variantes de color (Material Design 3 desde tailwind.config.js)
  const variantStyles = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600',
    secondary: 'bg-secondary-500 text-white hover:bg-secondary-600',
    error: 'bg-error-500 text-white hover:bg-error-600',
  };

  // Variantes de tamaño (Material Design 3 spacing scale)
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',    // 12px text + 8px padding
    md: 'px-4 py-2 text-base',  // 16px text + 16px padding
    lg: 'px-6 py-3 text-lg',    // 18px text + 24px padding
  };

  // Base styles (Material Design 3 principles)
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-md transition-all duration-200';

  // Estados
  const stateStyles = disabled ? 'opacity-50 cursor-not-allowed' : '';

  // Sombra elevación (Material Design 3)
  const shadowStyles = 'shadow-md hover:shadow-lg';

  const finalStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${stateStyles} ${shadowStyles}`;

  return (
    <button className={finalStyles} disabled={disabled}>
      <Icon className="mr-2" />
      Click me
    </button>
  );
}
```

---

## Commands (Bun-based)

```bash
# Development
bun run dev                             # Next.js dev with hot reload

# Testing
bun test                                # Run all tests
bun test --coverage                    # Coverage report
bun test -- path/to/test.test.ts       # Single test file

# Building
bun run build                           # Next.js build
bun run build:analyze                  # Analyze bundle

# Linting & Format
bun run lint                            # ESLint
bun run format                          # Prettier

# Dependencies
bun install                             # Install
bun add <package>                       # Add package
```

---

## Code Quality Standards

### Testing Strategy
- **Framework:** Bun test (built-in)
- **Coverage threshold:** 80% for lib/, 60% for API routes
- **Test locations:** `tests/unit/`, `tests/integration/`
- **Before commit:** `bun test` must pass

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true
  }
}
```

---

## UI Component Contract (Design ↔ Dev)

**All components are "smart hooks + dumb components".**

### Component Shape
```typescript
// ✅ GOOD: presentational, props-driven, Tailwind-based
interface QRPreviewProps {
  imageData: string;           // Base64 or data URL
  spotType: 'mesa' | 'camastro';
  spotNumber: number;
  onExport?: (format: 'svg' | 'pdf') => void;
}

export function QRPreview(props: QRPreviewProps) {
  const baseStyles = 'flex flex-col items-center gap-4 p-6 rounded-lg shadow-md';
  const containerStyles = `${baseStyles} bg-neutral-50`;
  
  return (
    <div className={containerStyles}>
      {/* Render only; no logic */}
    </div>
  );
}

// ✅ GOOD: hook holds the logic
export function useQRGenerator() {
  const [qrData, setQrData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const generate = async (url: string) => {
    setLoading(true);
    const result = await fetch(`/api/qr?url=${url}`);
    // ... handle and set state
  };
  
  return { qrData, loading, generate };
}

// ❌ BAD: logic mixed into component
export function QRPreviewBad() {
  const [qrData, setQrData] = useState(null);
  const handleGenerateClick = async () => {
    // Fetch and logic here = component is not reusable
  };
}
```

### Design Handoff
1. Design team modifies components and `tailwind.config.js`
2. Dev team never changes the component contract (props interface)
3. API spec lives in `specs/` and is frozen before UI work starts
4. Design review happens on component iteration without touching logic

---

## Workflow: Spec-Driven Development

**Every feature request follows this sequence. Do not skip phases.**

### Phase 1: Specify
- [ ] Surface assumptions explicitly
- [ ] Define objective, tech stack, commands, structure, code style, testing strategy, boundaries
- [ ] Write specific success criteria (not "make it work" but "QR generation < 50ms")
- [ ] **STOP** — Wait for human approval

### Phase 2: Plan
- [ ] Technical implementation plan (what to build in what order)
- [ ] Component dependencies and build order
- [ ] Risk identification and mitigation
- [ ] Save to `specs/plan.md`

### Phase 3: Tasks
- [ ] Break plan into discrete tasks (each < 5 files touched)
- [ ] Acceptance criteria per task
- [ ] Verification steps (test commands, build checks)
- [ ] Dependency ordering

### Phase 4: Implement
- [ ] Execute tasks incrementally
- [ ] TDD: write test first, then implementation
- [ ] Context-aware: load only relevant spec sections per task
- [ ] Verify before moving to next task

---

## Boundaries & Trade-offs

### Performance Targets
- QR generation: < 50ms for typical payloads
- Export to PDF: < 200ms per file
- Batch export (ZIP): < 5s for 100 files

### Scope Exclusions (Out of Bounds)
- Cloud storage integration (no S3, no cloud bucket APIs)
- Real-time collaboration features
- Database persistence (state only in session/request)
- User authentication/authorization
- Payment processing

### Assumptions
1. QR payloads are < 5KB (typical URL or text)
2. Batch exports are < 1000 files per request
3. Server-side generation only
4. Single-user, stateless operation
5. Desktop-first UI, responsive as enhancement

---

## Success Criteria (MVP)

- [ ] `generateQR()` produces valid QR codes in < 50ms
- [ ] PDF export preserves QR fidelity at all sizes
- [ ] SVG export is valid and scalable
- [ ] ZIP export batches 100+ files without memory issues
- [ ] All code is TypeScript (strict mode, 80% test coverage)
- [ ] No external API calls for QR generation
- [ ] Zero Python dependencies
- [ ] Bun commands work end-to-end (install → dev → build → test)
- [ ] UI renders with Tailwind components, no inline styles
- [ ] All colors, fonts, spacing defined in `tailwind.config.js`
- [ ] Desktop view tested on 1920px+, responsive tested on 768px (tablet) and 375px (mobile)
- [ ] Component prop contracts documented and frozen before UI iteration
- [ ] Design team can iterate on styles without touching logic

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-10-05 | Initial constitution | Angel C. Martinez |
| 2026-10-06 | Add Tailwind + Material Design 3 tokens, component contracts, design handoff | Angel C. Martinez |
