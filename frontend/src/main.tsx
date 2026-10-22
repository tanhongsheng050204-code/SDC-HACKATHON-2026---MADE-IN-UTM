import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import { startMonitoring } from "./lib/monitoring";
import { registerServiceWorker } from "./lib/pwa";
import "./styles/app.css";
import "./styles/site.css";
import "./styles/bright.css";

startMonitoring();  // only when VITE_SENTRY_DSN is set
registerServiceWorker();  // installable app and offline copy, production builds only

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
