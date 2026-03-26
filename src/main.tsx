import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// When a lazy-loaded chunk fails (e.g. after a new deploy the old hash no
// longer exists on the server), Vite fires this event. Force a hard reload so
// the browser picks up the fresh index.html + new chunk hashes.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
