/**
 * Protocolo de frames de `POST /api/export` (docs/ARCHITECTURE.md §S5):
 * `[type:u8][len:u32 BE][payload]`. Isomórfico: el servidor lo escribe y el
 * cliente (y los tests) lo leen.
 */
export const FRAME = { PROGRESS: 1, FILE_META: 2, FILE_CHUNK: 3, DONE: 4, WARNING: 5, ERROR: 6 } as const;
export type FrameType = (typeof FRAME)[keyof typeof FRAME];

/** `fileId` de un FILE_CHUNK (1 byte antes de los datos). */
export const FILE_ID = { pdf: 1, zip: 2 } as const;
export type FileName = keyof typeof FILE_ID;

export const CHUNK_BYTES = 64 * 1024;

/** Mismo contorno que `AppErrorPayload` del servidor (src/server/http/errors.ts); aquí el código es texto libre. */
export interface AppErrorPayload {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
  recordId?: string;
}

export interface ProgressPayload {
  phase: "generating" | "preparing";
  done: number;
  total: number;
}
export interface FileMetaPayload {
  fileId: FileName;
  name: string;
  size: number;
  mime: string;
}
export interface DonePayload {
  pages: number;
  pieces: number;
  warnings: number;
}
export interface WarningPayload {
  recordId?: string;
  code: string;
  message: string;
}

export type Frame =
  | { type: typeof FRAME.PROGRESS; payload: ProgressPayload }
  | { type: typeof FRAME.FILE_META; payload: FileMetaPayload }
  | { type: typeof FRAME.FILE_CHUNK; fileId: FileName; data: Uint8Array }
  | { type: typeof FRAME.DONE; payload: DonePayload }
  | { type: typeof FRAME.WARNING; payload: WarningPayload }
  | { type: typeof FRAME.ERROR; payload: AppErrorPayload };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function wrap(type: FrameType, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + body.length);
  out[0] = type;
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, 5);
  return out;
}

const json = (type: FrameType, payload: unknown) => wrap(type, encoder.encode(JSON.stringify(payload)));

export const encodeFrame = {
  progress: (payload: ProgressPayload) => json(FRAME.PROGRESS, payload),
  fileMeta: (payload: FileMetaPayload) => json(FRAME.FILE_META, payload),
  fileChunk(fileId: FileName, data: Uint8Array): Uint8Array {
    const body = new Uint8Array(1 + data.length);
    body[0] = FILE_ID[fileId];
    body.set(data, 1);
    return wrap(FRAME.FILE_CHUNK, body);
  },
  done: (payload: DonePayload) => json(FRAME.DONE, payload),
  warning: (payload: WarningPayload) => json(FRAME.WARNING, payload),
  error: (payload: AppErrorPayload) => json(FRAME.ERROR, payload),
};

export class FrameDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameDecodeError";
  }
}

export function decodeFrame(type: number, body: Uint8Array): Frame {
  switch (type) {
    case FRAME.FILE_CHUNK: {
      const id = body[0];
      const fileId = (Object.keys(FILE_ID) as FileName[]).find((name) => FILE_ID[name] === id);
      if (!fileId) throw new FrameDecodeError(`fileId desconocido: ${String(id)}`);
      return { type, fileId, data: body.subarray(1) };
    }
    case FRAME.PROGRESS:
    case FRAME.FILE_META:
    case FRAME.DONE:
    case FRAME.WARNING:
    case FRAME.ERROR:
      return { type, payload: JSON.parse(decoder.decode(body)) as never } as Frame;
    default:
      throw new FrameDecodeError(`Tipo de frame desconocido: ${type}`);
  }
}

/**
 * Lee frames de un stream binario, uniendo trozos partidos en cualquier punto.
 * Si el stream termina a mitad de un frame lanza FrameDecodeError («truncado»).
 */
export async function* readFrames(stream: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);
  try {
    for (;;) {
      while (buffer.length >= 5) {
        const length = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(1, false);
        if (buffer.length < 5 + length) break;
        const frame = decodeFrame(buffer[0] as number, buffer.subarray(5, 5 + length));
        buffer = buffer.subarray(5 + length);
        yield frame;
      }
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.length > 0) throw new FrameDecodeError("El stream terminó a mitad de un frame");
        return;
      }
      const merged = new Uint8Array(buffer.length + value.length);
      merged.set(buffer);
      merged.set(value, buffer.length);
      buffer = merged;
    }
  } finally {
    reader.releaseLock();
  }
}
