/**
 * I numeri del motore sotto il titolo di «Flussi di lavoro» (19/09/2026).
 *
 * Tiene fermo:
 *   · una riga di testo al posto dei sei riquadri;
 *   · niente «Flussi» e «Attivi»: li danno le pastiglie dell'elenco;
 *   · gli errori in rosso solo quando ci sono;
 *   · un passo rinviato («skipped», WhatsApp fuori fascia) non è un passaggio
 *     eseguito e non abbassa le riuscite.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

let erroriUltimoGiorno = 0;
const tabelleLette: string[] = [];

// Il registro delle esecuzioni: 82 passaggi riusciti nell'ultima ora, 8 tre
// giorni fa, 2 WhatsApp rinviati oggi, e gli errori della prova.
const oreFa = (ore: number) => new Date(Date.now() - ore * 3600 * 1000).toISOString();
function registro(): { status: string; created_at: string }[] {
  return [
    ...Array.from({ length: 82 }, () => ({ status: "success", created_at: oreFa(1) })),
    ...Array.from({ length: 8 }, () => ({ status: "success", created_at: oreFa(72) })),
    ...Array.from({ length: 2 }, () => ({ status: "skipped", created_at: oreFa(1) })),
    ...Array.from({ length: erroriUltimoGiorno }, () => ({ status: "error", created_at: oreFa(1) })),
  ];
}

// Il conteggio che il database darebbe per quella tabella e quei filtri.
function conteggio(tabella: string, uguali: Record<string, string>, diversi: Record<string, string>, daQuando: string | null): number {
  if (tabella === "automation_enrollments") return uguali.status === "active" ? 2 : 5;
  if (tabella !== "automation_execution_log") return 0;
  return registro().filter((r) =>
    (uguali.status === undefined || r.status === uguali.status)
    && (diversi.status === undefined || r.status !== diversi.status)
    && (daQuando === null || r.created_at >= daQuando),
  ).length;
}

function builder(tabella: string) {
  tabelleLette.push(tabella);
  const uguali: Record<string, string> = {};
  const diversi: Record<string, string> = {};
  let daQuando: string | null = null;
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.is = () => b;
  b.eq = (colonna: string, valore: string) => { uguali[colonna] = valore; return b; };
  b.neq = (colonna: string, valore: string) => { diversi[colonna] = valore; return b; };
  b.gte = (_colonna: string, valore: string) => { daQuando = valore; return b; };
  b.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: null as unknown, error: null as unknown, count: conteggio(tabella, uguali, diversi, daQuando) }).then(ok);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));

import { AutomationOverviewStats } from "@/components/marketing/automations/AutomationOverviewStats";

let root: Root | null = null;
let contenitore: HTMLDivElement;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  contenitore?.remove();
  erroriUltimoGiorno = 0;
  tabelleLette.length = 0;
});

async function monta() {
  contenitore = document.createElement("div");
  document.body.appendChild(contenitore);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root = createRoot(contenitore);
    root.render(
      <QueryClientProvider client={client}>
        <AutomationOverviewStats companyId="azienda-1" />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 3; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

describe("numeri delle automazioni sotto il titolo", () => {
  it("una riga sola, senza Flussi e Attivi", async () => {
    await monta();
    expect(contenitore.querySelectorAll("p")).toHaveLength(1);
    expect(contenitore.textContent).toBe(
      "2 iscrizioni in corso · 82 passaggi eseguiti nelle ultime 24 ore · 100% riusciti in 7 giorni · nessun errore",
    );
    expect(contenitore.textContent).not.toContain("Flussi");
    expect(contenitore.textContent).not.toContain("Attivi");
    // I totali dei flussi non si chiedono più al database.
    expect(tabelleLette).not.toContain("automation_flows");
  });

  it("gli errori delle ultime 24 ore in rosso", async () => {
    erroriUltimoGiorno = 3;
    await monta();
    // 82 riusciti + 3 errori; i 2 rinviati non contano.
    expect(contenitore.textContent).toContain("85 passaggi eseguiti nelle ultime 24 ore · 97% riusciti in 7 giorni");
    const errori = Array.from(contenitore.querySelectorAll("span")).find((s) => s.textContent === "3 errori nelle ultime 24 ore");
    expect(errori).toBeDefined();
    expect(errori?.className).toContain("text-destructive");
  });
});
