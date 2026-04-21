import { fileURLToPath } from "node:url";

import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const desktopBuildId = process.env.SENSE1_DESKTOP_BUILD_ID?.trim() ?? "";

export default defineConfig({
  define: {
    __SENSE1_DESKTOP_BUILD_ID__: JSON.stringify(desktopBuildId),
  },
  main: {
    build: {
      outDir: "dist/main",
      sourcemap: true,
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: "dist/preload",
      sourcemap: true,
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: desktopRoot,
    plugins: [tailwindcss()],
    build: {
      outDir: "dist/renderer",
      sourcemap: true,
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL("./index.html", import.meta.url)),
        },
      },
    },
  },
});
