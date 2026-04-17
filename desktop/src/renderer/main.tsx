import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applyTheme, readStoredTheme } from "./lib/theme";
import "./styles.css";

applyTheme(readStoredTheme());

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Desktop renderer root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

