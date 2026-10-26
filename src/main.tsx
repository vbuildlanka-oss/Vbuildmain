import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { loadContent } from "./content/store";
import "./styles.css";

function dismissLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;
  // Small delay so the app has fully painted before we fade out
  requestAnimationFrame(() => {
    setTimeout(() => {
      loader.classList.add("hidden");
      // Remove from DOM after transition completes
      loader.addEventListener("transitionend", () => loader.remove(), { once: true });
    }, 300);
  });
}

// Content comes first (Supabase, or the cached/bundled fallback), so pages never
// render placeholder text and swap it out. The loading screen covers the wait.
loadContent().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );

  // Dismiss loader once React is mounted and first frame has painted
  if (document.readyState === "complete") {
    dismissLoader();
  } else {
    window.addEventListener("load", dismissLoader, { once: true });
  }
});
