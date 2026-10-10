import type { Layout, ProjectLayout, RecordId } from "@/types";

/** Layout efectivo de una pieza: base de la plantilla + override por pieza (§1.2-6). */
export function resolveLayout(layout: ProjectLayout, recordId: RecordId): Layout {
  const override = layout.overrides[recordId];
  if (!override) return layout.base;
  return { qr: override.qr ?? layout.base.qr, content: override.content ?? layout.base.content };
}

export const isCustomized = (layout: ProjectLayout, recordId: RecordId): boolean => recordId in layout.overrides;

/** "Restablecer" una pieza a la posición común. */
export function resetOverride(layout: ProjectLayout, recordId: RecordId): ProjectLayout {
  if (!(recordId in layout.overrides)) return layout;
  const { [recordId]: _removed, ...overrides } = layout.overrides;
  return { ...layout, overrides };
}

/** Ámbito "Todas": escribe en la base; "Solo esta pieza": escribe en overrides[id]. */
export function applyLayoutChange(
  layout: ProjectLayout,
  change: Partial<Layout>,
  scope: { kind: "all" } | { kind: "single"; recordId: RecordId },
): ProjectLayout {
  if (scope.kind === "all") return { ...layout, base: { ...layout.base, ...change } };
  const current = layout.overrides[scope.recordId] ?? {};
  return { ...layout, overrides: { ...layout.overrides, [scope.recordId]: { ...current, ...change } } };
}

/** Elimina overrides de piezas que ya no existen. */
export function pruneLayoutOverrides(layout: ProjectLayout, existingIds: ReadonlySet<RecordId>): ProjectLayout {
  const overrides = Object.fromEntries(Object.entries(layout.overrides).filter(([id]) => existingIds.has(id)));
  return Object.keys(overrides).length === Object.keys(layout.overrides).length ? layout : { ...layout, overrides };
}
