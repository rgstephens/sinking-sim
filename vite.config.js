import { defineConfig } from "vite";
import { releaseMetadata } from "./scripts/release-metadata.mjs";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(releaseMetadata.version),
    __BUILD_DATE__: JSON.stringify(releaseMetadata.buildDate),
  },
  server: {
    port: 5173,
    open: false,
  },
});
