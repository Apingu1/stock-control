import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./pwa.css";
import "./stkflo.css";
import "./styles/stkflo-tokens.css";
import "./styles/stkflo-components.css";
import "./styles/stkflo-adaptive.css";
import "./styles/stkflo-operational.css";
import App from "./App.tsx";
import PwaUpdatePrompt from "./components/system/PwaUpdatePrompt";
import { registerPwa } from "./pwa";

registerPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PwaUpdatePrompt />
  </StrictMode>,
);
