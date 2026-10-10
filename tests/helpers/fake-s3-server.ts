import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Servidor mínimo con el protocolo S3 (estilo ruta: /bucket/clave) para probar
 * el adaptador con el SDK REAL de AWS sobre HTTP, sin mocks. `honorIfNoneMatch:
 * false` imita a Supabase, que hace upsert siempre.
 */
export interface FakeS3 {
  endpoint: string;
  objects: Map<string, { body: Buffer; contentType: string; metadata: Record<string, string> }>;
  requests: Array<{ method: string; key: string; ifNoneMatch?: string }>;
  close(): Promise<void>;
}

const xmlError = (code: string, message: string) => `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

export async function startFakeS3(options: { bucket: string; honorIfNoneMatch?: boolean }): Promise<FakeS3> {
  const objects: FakeS3["objects"] = new Map();
  const requests: FakeS3["requests"] = [];
  const honor = options.honorIfNoneMatch ?? true;

  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const [, bucket, ...rest] = url.pathname.split("/");
    const key = decodeURIComponent(rest.join("/"));
    const method = request.method ?? "GET";
    const ifNoneMatch = request.headers["if-none-match"];
    requests.push({ method, key, ...(typeof ifNoneMatch === "string" ? { ifNoneMatch } : {}) });

    const send = (status: number, headers: Record<string, string | number> = {}, body = "") => {
      response.writeHead(status, headers);
      response.end(method === "HEAD" ? undefined : body);
    };
    if (bucket !== options.bucket) return send(404, { "content-type": "application/xml" }, xmlError("NoSuchBucket", "bucket"));

    if (method === "PUT") {
      const body = await readBody(request);
      if (honor && ifNoneMatch === "*" && objects.has(key)) return send(412, { "content-type": "application/xml" }, xmlError("PreconditionFailed", "At least one of the pre-conditions you specified did not hold"));
      const metadata: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) if (name.startsWith("x-amz-meta-") && typeof value === "string") metadata[name.slice(11)] = value;
      objects.set(key, { body, contentType: String(request.headers["content-type"] ?? "application/octet-stream"), metadata });
      return send(200, { etag: `"${createHash("md5").update(body).digest("hex")}"` });
    }

    const object = objects.get(key);
    if (method === "DELETE") {
      objects.delete(key);
      return send(204);
    }
    if (!object) return send(404, { "content-type": "application/xml" }, xmlError("NoSuchKey", "The specified key does not exist."));
    const headers: Record<string, string | number> = {
      "content-type": object.contentType,
      "content-length": object.body.length,
      etag: `"${createHash("md5").update(object.body).digest("hex")}"`,
      ...Object.fromEntries(Object.entries(object.metadata).map(([k, v]) => [`x-amz-meta-${k}`, v])),
    };
    response.writeHead(200, headers);
    response.end(method === "HEAD" ? undefined : object.body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    objects,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
