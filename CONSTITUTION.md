# IC-QR Project Constitution

**Last Updated:** 2026-10-05  
**Owner:** Angel C. Martinez  
**Status:** Active

---

## Project Overview

**ic-qr** is a TypeScript-first QR code generation and export utility built with Next.js and Bun. All features must pass through spec-driven development before implementation.

---

## Tech Stack (Immutable)

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Bun | Latest | Fast TypeScript execution, native bundling |
| **Framework** | Next.js | Latest | React + server rendering + API routes |
| **Language** | TypeScript | Strict mode | Type safety, no runtime surprises |
| **Package Manager** | Bun | — | Replaces npm/yarn/pnpm |
| **Build Tool** | Bun native | — | Integrated; no webpack/esbuild config needed |
| **Testing** | Bun test | — | Built-in; no jest/vitest setup |

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

---

## Code Style & Constraints

### Always:
- **TypeScript strict mode** — no `any` type, no `@ts-ignore` without justification
- **Bun commands only** — `bun run`, `bun test`, `bun build`
- **No Python scripts** — All tooling and logic in TypeScript
- **Exported types** — Public API is fully typed; no implicit `any`
- **Error handling** — Explicit error types, no silent failures

### Ask First (before implementing):
- Adding dependencies beyond `qrcode`, `pdf-lib`, `archiver`
- Database schema or persistence layer changes
- API route additions that aren't in an approved spec
- Performance optimizations affecting QR generation quality

### Never:
- Commit `.env` or secrets to version control
- Remove or skip tests without justification
- Use external QR code generation services
- Mix TypeScript and JavaScript (`.js` files alongside `.ts`)
- Store generated QRs in version control (temp directories only)

---

## Project Structure

```
ic-qr/
├── src/
│   ├── components/          # React components
│   ├── lib/                 # Shared utilities
│   │   ├── qr-generator.ts  # QR generation logic
│   │   ├── exporters/       # Export format handlers
│   │   │   ├── pdf.ts
│   │   │   ├── svg.ts
│   │   │   └── zip.ts
│   │   └── types.ts         # Shared type definitions
│   ├── pages/               # Next.js pages & API routes
│   │   ├── api/
│   │   │   ├── generate.ts  # QR generation endpoint
│   │   │   └── export.ts    # Export handling endpoint
│   │   └── index.tsx        # UI
│   └── styles/              # CSS/Tailwind
├── tests/
│   ├── unit/                # Unit tests (lib functions)
│   ├── integration/         # Integration tests (API routes)
│   └── e2e/                 # End-to-end tests
├── docs/
│   ├── API.md              # API documentation
│   └── CONTRIBUTING.md     # Contributor guide
├── CONSTITUTION.md          # This file (immutable reference)
├── package.json            # Dependencies (Bun)
├── bunfig.toml             # Bun configuration
├── tsconfig.json           # TypeScript config (strict)
└── next.config.js          # Next.js configuration
```

---

## Commands (Bun-based)

```bash
# Development
bun --hot src/pages/index.tsx          # Hot reload dev server
bun run dev                             # Next.js dev

# Testing
bun test                                # Run all tests
bun test --coverage                    # Coverage report
bun test -- path/to/test.test.ts       # Single test file

# Building
bun build src/lib/qr-generator.ts      # Build library
bun run build                           # Next.js build

# Linting & Format
bun run lint                            # ESLint
bun run format                          # Prettier

# Dependencies
bun install                             # Install (replaces npm install)
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

### Code Style Example
```typescript
// ✅ GOOD
export interface QRGenerationRequest {
  content: string;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  size?: number;
}

export async function generateQR(req: QRGenerationRequest): Promise<Buffer> {
  if (!req.content) {
    throw new Error('QR content is required');
  }
  // Implementation
}

// ❌ BAD
export async function generateQR(req: any): Promise<any> {
  // Missing error handling, implicit any
}
```

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
- [ ] Save to `tasks/plan.md`

### Phase 3: Tasks
- [ ] Break plan into discrete tasks (each < 5 files touched)
- [ ] Acceptance criteria per task
- [ ] Verification steps (test commands, build checks)
- [ ] Dependency ordering

### Phase 4: Implement
- [ ] Execute tasks incrementally using `incremental-implementation` skill
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
3. Server-side generation only (no client-side QR code lib needed initially)
4. Single-user, stateless operation (no multi-user sessions)

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

---

## Open Questions

None at this stage. Constitution is locked pending first feature request.

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-10-05 | Initial constitution | Angel C. Martinez |

---

## Related Documents

- `SPEC-*.md` — Feature specifications (one per module)
- `tasks/plan.md` — Current implementation plan
- `tasks/todo.md` — Active task list
- `API.md` — API endpoint documentation
