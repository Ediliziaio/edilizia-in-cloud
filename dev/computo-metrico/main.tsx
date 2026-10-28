import { createRoot } from "react-dom/client";
import ComputoNativoEditor from "../../src/components/computo/ComputoNativoEditor";
import "../../src/index.css";

const prova = new URLSearchParams(window.location.search).get("bozza")?.slice(0, 80);
const storageKey = `computo-nativo:v1:anteprima-locale${prova ? `:${encodeURIComponent(prova)}` : ""}`;
if (import.meta.env.DEV || import.meta.env.MODE === "computo-local") createRoot(document.getElementById("root")!).render(
  <main className="mx-auto min-h-screen max-w-[1440px] bg-background px-4 py-6 sm:px-6">
    <ComputoNativoEditor storageKey={storageKey} azienda="Edilizia in Cloud" />
  </main>,
);
