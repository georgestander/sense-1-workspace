import { fileURLToPath } from "node:url";

import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: "dist/preload",
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: desktopRoot,
    plugins: [tailwindcss()],
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL("./index.html", import.meta.url)),
        },
      },
    },
  },
});
