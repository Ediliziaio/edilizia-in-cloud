import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "../../src/index.css";
import { GalleriaImmaginiCatalogo } from "../../src/components/listino/GalleriaImmaginiCatalogo";
import type { BozzaImmagineCatalogo } from "../../src/lib/listino/immaginiCatalogo";

function ProvaGalleria() {
  const [immagini, setImmagini] = useState<BozzaImmagineCatalogo[]>([
    { id: "frontale", url: "/render-references/profiles/Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg", ruolo: "principale", didascalia: "Vista frontale" },
    { id: "sezione", url: "/render-references/profiles/Profilo-PVC-5-Camere-Sezione-Bianco.webp", ruolo: "sezione", didascalia: "Sezione del profilo" },
  ]);
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <header className="border-b pb-4"><p className="text-sm text-muted-foreground">Prova locale, senza salvataggio</p><h1 className="text-xl font-semibold">Scheda linea serramenti</h1></header>
    <GalleriaImmaginiCatalogo value={immagini} onChange={setImmagini} />
    <Toaster />
  </main>;
}

if (import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  createRoot(document.getElementById("root")!).render(<ProvaGalleria />);
}
