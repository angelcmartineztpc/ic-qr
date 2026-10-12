"use client";

import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import IconButton from "@mui/material/IconButton";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { rectSortingStrategy, sortableKeyboardCoordinates, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { QRRecord, RecordId } from "@/types";

import { RecordCard, type RecordCardHandlers } from "./RecordCard";

interface Props extends RecordCardHandlers {
  records: QRRecord[];
  /** Posición absoluta (0-based) de la primera pieza de esta página en el orden completo. */
  offset: number;
  selectedId: RecordId | null;
  customized: ReadonlySet<RecordId>;
  readOnly: boolean;
  /** Mover una pieza a una posición absoluta del orden completo. */
  onReorder(id: RecordId, toIndex: number): void;
  /** Con un filtro o búsqueda activos arrastrar no tiene un orden claro: solo «Mover a…». */
  reorderable: boolean;
}

function SortableCard({ record, position, disabled, ...card }: { record: QRRecord; position: number; disabled: boolean; selected: boolean; customized: boolean; readOnly: boolean } & RecordCardHandlers) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: record.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.7 : 1 }}>
      <RecordCard
        record={record}
        position={position}
        {...card}
        leading={
          disabled ? null : (
            <IconButton ref={setActivatorNodeRef} size="small" aria-label={`Arrastrar para reordenar la pieza ${record.mesa}`} className="!cursor-grab !bg-white/90 touch-none" {...attributes} {...listeners}>
              <DragIndicatorIcon fontSize="small" />
            </IconButton>
          )
        }
      />
    </div>
  );
}

/** Tira de piezas de la página actual. Se reordena con ratón, con el dedo (pulsación larga) o con el teclado (Espacio + flechas). */
export function SortableStrip({ records, offset, selectedId, customized, readOnly, reorderable, onReorder, ...handlers }: Props) {
  const theme = useTheme();
  const small = useMediaQuery(theme.breakpoints.down("sm"));
  // En móvil no se arrastra: el menú «Mover a…» cubre el reordenado sin gestos.
  const disabled = readOnly || small || !reorderable;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const target = records.findIndex((r) => r.id === over.id);
    if (target >= 0) onReorder(String(active.id), offset + target);
  };

  const name = (id: string | number) => {
    const r = records.find((x) => x.id === id);
    return r ? [r.mesa, r.area].filter(Boolean).join(" · ") : "pieza";
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: "Para reordenar, pulsa Espacio, mueve con las flechas y vuelve a pulsar Espacio para soltar. Esc cancela." },
        announcements: {
          onDragStart: ({ active }) => `Has cogido ${name(active.id)}.`,
          onDragOver: ({ active, over }) => (over ? `${name(active.id)} está sobre la posición de ${name(over.id)}.` : `${name(active.id)} ya no está sobre ninguna posición.`),
          onDragEnd: ({ active, over }) => (over ? `${name(active.id)} se movió a la posición de ${name(over.id)}.` : `${name(active.id)} se soltó sin moverse.`),
          onDragCancel: ({ active }) => `Se canceló el movimiento de ${name(active.id)}.`,
        },
      }}
    >
      <SortableContext items={records.map((r) => r.id)} strategy={rectSortingStrategy} disabled={disabled}>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4" aria-label="Piezas">
          {records.map((record, index) => (
            <li key={record.id}>
              <SortableCard record={record} position={offset + index + 1} disabled={disabled} selected={record.id === selectedId} customized={customized.has(record.id)} readOnly={readOnly} {...handlers} />
            </li>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
