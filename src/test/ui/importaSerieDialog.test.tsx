/**
 * Il dialogo "Aggiungi una serie": marca → serie → prezzo, e l'anteprima del
 * prezzo con lo scostamento applicato.
 *
 * Il conto che conta è quello: 600 €/m² con una serie a +18% fanno 708 €/m², e
 * su una finestra 1200 × 1400 (1,68 m²) fanno 1.189,44 €. Se quel numero sbaglia,
 * sbaglia ogni preventivo fatto con quella serie.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { MarcaSerramenti, SerieSerramenti } from "@/hooks/useSerieSerramenti";

const marche: MarcaSerramenti[] = [
  { id: "m1", nome: "Aluplast", slug: "aluplast", paese: "DE", logo_url: null, materiali: ["pvc"], descrizione: null, sort_order: 10 },
];
const serie: SerieSerramenti[] = [
  { id: "s1", marca_id: "m1", nome: "Ideal 4000", slug: "ideal-4000", materiale: "pvc", profondita_mm: null, camere: null, guarnizioni: null, uw_min: null, fascia: "basic", differenza_pct: -8, immagine_url: null, descrizione: null, tipologie_incluse: [], sort_order: 10 },
  { id: "s2", marca_id: "m1", nome: "Ideal 7000", slug: "ideal-7000", materiale: "pvc", profondita_mm: null, camere: null, guarnizioni: null, uw_min: null, fascia: "top", differenza_pct: 18, immagine_url: null, descrizione: null, tipologie_incluse: [], sort_order: 12 },
];

vi.mock("@/integrations/supabase/client", () => {
  const tabella = (nome: string) => {
    const risposta: { data: unknown[]; error: null } = {
      data: nome === "serramenti_marche" ? marche : serie,
      error: null,
    };
    const catena = {
      select: () => catena,
      eq: () => catena,
      order: () => catena,
      then: (r: (v: unknown) => unknown) => Promise.resolve(risposta).then(r),
    };
    return catena;
  };
  return { supabase: { from: tabella, rpc: vi.fn() } };
});

import { ImportaSerieDialog } from "@/components/listino/ImportaSerieDialog";

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Il dialogo esce in un portale: si guarda tutto il body. */
const testo = () => document.body.textContent ?? "";

/** React Query risolve dopo qualche giro: si aspetta che le marche compaiano. */
async function attendiLibreria() {
  for (let i = 0; i < 20 && !testo().includes("Aluplast"); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}
const clicca = async (etichetta: string) => {
  const nodo = [...document.body.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(etichetta),
  );
  expect(nodo, `pulsante "${etichetta}" non trovato`).toBeTruthy();
  await act(async () => {
    nodo!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("ImportaSerieDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mostra le marche della libreria e, scelta la marca, le sue serie", async () => {
    const { cleanup } = render(
      <ImportaSerieDialog open onOpenChange={() => {}} companyId="c1" />,
    );
    await attendiLibreria();
    expect(testo()).toContain("Aluplast");
    expect(testo()).not.toContain("Ideal 4000");

    await clicca("Aluplast");
    expect(testo()).toContain("Ideal 4000");
    expect(testo()).toContain("Ideal 7000");
    cleanup();
  });

  it("propone lo scostamento della serie e non duplica le tipologie", async () => {
    const { cleanup } = render(
      <ImportaSerieDialog open onOpenChange={() => {}} companyId="c1" />,
    );
    await attendiLibreria();
    await clicca("Aluplast");
    await clicca("Ideal 7000");

    const campo = document.querySelector<HTMLInputElement>("#serie-diff");
    expect(campo?.value).toBe("18");

    // Il testo spiega che la serie è una linea, non una copia del listino.
    expect(testo()).toContain("non vengono");
    cleanup();
  });
});
