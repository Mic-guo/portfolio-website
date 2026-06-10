import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
import BlobPlayground from "./playground/BlobPlayground.jsx";
import OrangeSlicePlayground from "./playground/OrangeSlicePlayground.jsx";
import DeskPlayground from "./playground/DeskPlayground.jsx";

// Reload when toggling playground routes so the correct root mounts.
window.addEventListener("hashchange", () => window.location.reload());

const hash = window.location.hash;
const Root =
  hash === "#blob"
    ? BlobPlayground
    : hash === "#orangeslice"
      ? OrangeSlicePlayground
      : hash === "#app"
        ? App
        : DeskPlayground;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
