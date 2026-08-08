import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { PlatformApp } from "./PlatformApp.jsx";
import "./styles.css";

const platformMode = new URLSearchParams(window.location.search).get("platform") === "1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {platformMode ? <PlatformApp /> : <App />}
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
