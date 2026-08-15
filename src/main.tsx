import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installTheme } from "./theme/useColorScheme";
import { bootstrapStore } from "./state/store";
import "./charts/register";
import "./index.css";

installTheme();
bootstrapStore();

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
