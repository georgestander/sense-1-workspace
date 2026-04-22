import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/electron/renderer";

import App from "./App";
import { installReportBugCorrelationCapture, recordReportBugRendererEvent } from "./features/bug-report/report-bug-correlation.js";
import { applyTheme, readStoredTheme } from "./lib/theme";
import "./styles.css";

Sentry.init({
  beforeSend(event) {
    recordReportBugRendererEvent(event);
    return event;
  },
});

applyTheme(readStoredTheme());
installReportBugCorrelationCapture();

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
