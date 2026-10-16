import { eyeBallCommands, eyeFrameCommands, moduleCommands, toPath, type EyeShape, type ModuleShape } from "@/lib/qr-style";
import type { QrMatrix } from "@/types";

/** Patrón fijo con vecinos en todas direcciones: así se aprecia cómo cada forma une o separa módulos. */
const SAMPLE: QrMatrix = ["110101", "101110", "011011", "110010", "001111", "101101"].map((row) => [...row].map((c) => c === "1"));
const PLACE = { x: 0, y: 0, module: 1, decimals: 3 };

export function ModuleSwatch({ shape }: { shape: ModuleShape }) {
  return (
    <svg viewBox="-0.2 -0.2 6.4 6.4" width="36" height="36" fill="currentColor" fillRule="nonzero" aria-hidden>
      <path d={toPath(moduleCommands(SAMPLE, shape), PLACE)} />
    </svg>
  );
}

/** Marco de la esquina con la forma elegida (centro cuadrado de referencia). */
export function EyeFrameSwatch({ shape }: { shape: EyeShape }) {
  return (
    <svg viewBox="-0.2 -0.2 7.4 7.4" width="36" height="36" fill="currentColor" fillRule="nonzero" aria-hidden>
      <path d={toPath(eyeFrameCommands(0, 0, shape), PLACE)} />
      <path d={toPath(eyeBallCommands(0, 0, "square"), PLACE)} opacity="0.35" />
    </svg>
  );
}

/** Centro de la esquina con la forma elegida (marco cuadrado tenue de referencia). */
export function EyeBallSwatch({ shape }: { shape: EyeShape }) {
  return (
    <svg viewBox="-0.2 -0.2 7.4 7.4" width="36" height="36" fill="currentColor" fillRule="nonzero" aria-hidden>
      <path d={toPath(eyeFrameCommands(0, 0, "square"), PLACE)} opacity="0.35" />
      <path d={toPath(eyeBallCommands(0, 0, shape), PLACE)} />
    </svg>
  );
}

export function OutlineSwatch({ shape }: { shape: "square" | "circle" }) {
  return (
    <svg viewBox="0 0 10 10" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      {shape === "circle" ? <circle cx="5" cy="5" r="4.2" /> : <rect x="0.8" y="0.8" width="8.4" height="8.4" />}
    </svg>
  );
}
