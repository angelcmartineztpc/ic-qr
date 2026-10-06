/**
 * Genera BASIC_AUTH_PASSWORD_SHA256 a partir de una contraseña.
 *   bun run hash-password            (pide la contraseña por stdin)
 *   echo -n 'secreto' | npm run hash-password
 */
import { createHash } from "node:crypto";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

if (process.stdin.isTTY) process.stderr.write("Contraseña (Enter y luego Ctrl+D): ");
const password = await readStdin();
if (password.length < 12) {
  console.error("\nLa contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}
console.log(createHash("sha256").update(password, "utf8").digest("hex"));
