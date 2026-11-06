import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "./app/providers";
import "./lib/env";
import { loadFixtures } from "./lib/game/fixtures";
import { installMotionFailsafe } from "./lib/motion";
import "./styles/app.css";

installMotionFailsafe();

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

// The board comes from the API in production; render once it is in (or the bundled list is kept).
void loadFixtures().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <Providers />
    </StrictMode>,
  );
});
