/**
 * «Importa le fasi» della commessa (14/11/2026): computi e preventivi del gestionale in un
 * elenco solo, con la ricerca; il documento scelto passa dalla stessa schermata di scelta dei
 * file, e l'import manda solo le fasi nuove con le righe per i SAL.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { voceVuota } from "@/lib/computo/editorNativo";

const m = vi.hoisted(() => ({ rpc: vi.fn(), ok: vi.fn(), err: vi.fn(), from: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: m.ok, error: m.err } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, from: m.from } }));
vi.mock("@/lib/computo/cloudComputo", () => ({
  elencaComputiCloud: async () => [{ id: "k1", titolo: "Computo villa Rossi", committente: "Rossi", numeroVoci: 2, updatedAt: "2026-11-10T10:00:00Z", totale: 5000 }],
  leggiComputoCloud: async () => ({ bozza: { titolo: "Computo villa Rossi", voci: [
    { ...voceVuota(), capitolo: "Demolizioni", descrizione: "Demolizione tramezze", unita: "mq", quantita: "120", prezzo: "20" },
    { ...voceVuota(), capitolo: "Murature", descrizione: "Tramezza", unita: "mq", quantita: "80", prezzo: "40" },
  ] } }),
}));

import { DocumentiDelGestionale, importaFasiNelDatabase } from "@/components/orders/ImportaFasiDaComputo";
import { filtraDocumenti, vociDaPreventivo, type DocumentoGestionale } from "@/lib/orders/fasiDaComputo";

function catena(risultato: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve(risultato).then(ok);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.from.mockImplementation((t: string) => t === "quotes"
    ? catena({ data: [{ id: "q1", quote_number: "P-12", title: "Bagno Bianchi", client_name: "Bianchi", status: "accepted", total: 9000, updated_at: "2026-11-12T10:00:00Z" }], error: null })
    : catena({ data: [
      { name: "Piastrelle", description: null, quantity: 20, unit_of_measure: "mq", unit_price: 50, line_total: 1000, is_optional: false, custom_field_values: null },
      { name: "Box doccia", description: null, quantity: 1, unit_of_measure: "pz", unit_price: null, line_total: 800, is_optional: true, custom_field_values: null },
    ], error: null }));
});
afterEach(cleanup);

function apri(mostraImporti = true) {
  const onScelto = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <DocumentiDelGestionale companyId="c1" mostraImporti={mostraImporti} onScelto={onScelto} />
  </QueryClientProvider>);
  return onScelto;
}

describe("Computi e preventivi in un elenco solo", () => {
  it("li mostra insieme, il più recente prima, con tipo, cliente e totale", async () => {
    apri();
    const elenco = await screen.findByRole("list", { name: "Computi e preventivi" });
    const righe = await screen.findAllByRole("button", { name: /^Importa da / });
    expect(righe.map((r) => r.getAttribute("aria-label"))).toEqual(["Importa da preventivo Bagno Bianchi", "Importa da computo Computo villa Rossi"]);
    expect(elenco).toHaveTextContent("Accettato");
    expect(elenco).toHaveTextContent(/9\.000,00/);
  });

  it("senza «Venduto e importi» i totali non si vedono", async () => {
    apri(false);
    await screen.findAllByRole("button", { name: /^Importa da / });
    expect(screen.queryByText(/9\.000,00/)).toBeNull();
  });

  it("la ricerca e il filtro per tipo restringono l'elenco", async () => {
    apri();
    await screen.findAllByRole("button", { name: /^Importa da / });
    fireEvent.change(screen.getByLabelText("Cerca un computo o un preventivo"), { target: { value: "rossi" } });
    expect(screen.getAllByRole("button", { name: /^Importa da / })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Cerca un computo o un preventivo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Preventivi 1" }));
    expect(screen.getAllByRole("button", { name: /^Importa da / })).toHaveLength(1);
  });

  it("scelto un computo, le sue voci vanno alla schermata di scelta", async () => {
    const onScelto = apri();
    fireEvent.click(await screen.findByRole("button", { name: "Importa da computo Computo villa Rossi" }));
    await waitFor(() => expect(onScelto).toHaveBeenCalled());
    const [voci, fonte] = onScelto.mock.calls[0];
    expect(fonte).toEqual({ nome: "Computo villa Rossi", tipo: "computo" });
    expect(voci.map((v: { descrizione: string }) => v.descrizione)).toEqual(["Demolizione tramezze", "Tramezza"]);
  });

  it("scelto un preventivo, le righe opzionali restano fuori", async () => {
    const onScelto = apri();
    fireEvent.click(await screen.findByRole("button", { name: "Importa da preventivo Bagno Bianchi" }));
    await waitFor(() => expect(onScelto).toHaveBeenCalled());
    const [voci, fonte] = onScelto.mock.calls[0];
    expect(fonte).toEqual({ nome: "Preventivo P-12", tipo: "preventivo" });
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({ capitolo: "Bagno Bianchi", descrizione: "Piastrelle", unita: "mq", quantita: "20", prezzo: "50" });
  });
});

describe("Voci di un preventivo", () => {
  it("senza prezzo unitario lo ricava dal totale; il capitolo del computo d'origine resta", () => {
    const [v] = vociDaPreventivo([{ name: "Massetto", description: "spessore 5 cm", quantity: 4, unit_of_measure: "mq", line_total: 90, unit_price: null, custom_field_values: { computo: { capitolo: "Sottofondi" } } }], "P");
    expect(v).toMatchObject({ capitolo: "Sottofondi", descrizione: "Massetto\nspessore 5 cm", quantita: "4", prezzo: "22,5" });
  });

  it("la ricerca vuole tutte le parole", () => {
    const d = (titolo: string, cliente: string): DocumentoGestionale => ({ id: titolo, tipo: "computo", titolo, cliente, numero: null, stato: null, voci: null, totale: null, aggiornato: null });
    expect(filtraDocumenti([d("Bagno", "Rossi"), d("Cucina", "Rossi")], "rossi bagno", "tutti").map((x) => x.titolo)).toEqual(["Bagno"]);
  });
});

describe("Scrittura nel database", () => {
  it("col database di prima dice che non è ancora attivo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    await expect(importaFasiNelDatabase("o1", [{ nome: "Murature", voci: [] }], "computo", null)).rejects.toThrow(/non è ancora attivo/);
  });
});

describe("Dove si trova", () => {
  it("«Importa» accanto ad «Aggiungi fasi» apre la finestra di «Importa voci» con i documenti del gestionale", async () => {
    const { readFileSync } = await import("node:fs");
    const f = readFileSync("src/components/orders/OrderWorkPhases.tsx", "utf8");
    expect(f).toContain('<FileUp className="mr-1 h-4 w-4" />Importa');
    expect(f).toContain("<ImportaVociDialog");
    expect(f).toContain('titolo="Importa le fasi"');
    expect(f).toContain("onScelto={carica}");
    expect(f).toContain('fonte?.tipo === "preventivo"');
  });
});
