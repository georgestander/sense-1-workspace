import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/electron/renderer";

import App from "./App";
import { applyTheme, readStoredTheme } from "./lib/theme";
import "./styles.css";

Sentry.init();

applyTheme(readStoredTheme());

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Desktop renderer root element was not found.");
}

const appTree = import.meta.env.DEV
  ? <App />
  : (
      <StrictMode>
        <App />
      </StrictMode>
    );

createRoot(rootElement).render(appTree);
