import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "./app/providers";
import "./lib/env";
import { installMotionFailsafe } from "./lib/motion";
import "./styles/app.css";

installMotionFailsafe();

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
