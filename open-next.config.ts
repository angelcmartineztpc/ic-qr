import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin caché incremental (R2) ni optimización de imágenes: la app no usa ISR ni next/image.
export default defineCloudflareConfig({});
