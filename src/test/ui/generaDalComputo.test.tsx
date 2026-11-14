/**
 * «Genera dal computo» (31/10/2026: il computo si carica e si apre dal popup;
 * 14/11/2026: il file si legge con la stessa finestra di «Importa voci»).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";

let computi: ComputoCommessa[];
let vociLette: unknown[] = [];
const salva = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, user: { id: "u1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, canViewOrderAmounts: true }) }));
vi.mock("@/hooks/useComputoCommessa", () => ({
  computoInLettura: (c: ComputoCommessa | null) => !!c && ["uploading", "extracting_text", "analyzing_ai", "validating"].includes(c.extraction_status),
  computoLetto: (c: ComputoCommessa | null) => !!c && ["review", "completed"].includes(c.extraction_status),
  useComputiCommessa: () => ({ data: computi, isLoading: false }),
  useVociComputo: () => ({ data: vociLette, isLoading: false }),
  useRiprovaLetturaComputo: () => ({ mutate: vi.fn(), isPending: false }),
  useSalvaComputoImportato: () => ({ mutate: salva.mutate, isPending: false }),
}));
const tabelle = vi.hoisted(() => ({ fasi: [] as { id: string; name: string; position: number }[] }));
vi.mock("@/integrations/supabase/client", () => {
  const da = (tabella: string) => {
    const risposta = { data: (tabella === "order_work_phases" ? tabelle.fasi : []) as unknown[], error: null as null };
    const catena: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "order", "or", "limit", "not", "in"]) catena[m] = () => catena;
    catena.then = (ok: (v: typeof risposta) => unknown) => Promise.resolve(risposta).then(ok);
    return catena;
  };
  return { supabase: { from: da, functions: { invoke: vi.fn() }, rpc: vi.fn() } };
});

import GeneraMaterialiDialog from "@/components/orders/materiali/GeneraMaterialiDialog";

const computo = (p: Partial<ComputoCommessa>): ComputoCommessa => ({
  id: "k1", titolo: "Computo esecutivo", file_name: "computo.pdf", file_type: "pdf", stato: "verificato",
  extraction_status: "review", extraction_error: null, extraction_method: "pdf_text", progresso: null, oggetto_lavori: null, committente: null,
  totale_dichiarato: null, totale_calcolato: null, controllo_totali: null, lavoro_pubblico: false, stazione_appaltante: null,
  cig: null, cup: null, ribasso_percentuale: null, oneri_sicurezza: null, created_at: null,
  variante_di: null, numero_variante: null, motivo_variante: null, contrattuale_dal: null, ...p,
});

/** Computo inventato, con una voce composta: nessun dato di clienti. */
const CSV = [
  "N.;Descrizione;U.M.;Quantità;Prezzo;Importo",
  "1;OPERE MURARIE;;;;",
  "1.1;Intonaco civile premiscelato spessore 2 cm;mq;100,00;24,00;2400,00",
  "1.2;Fornitura e posa in opera di piatto doccia 80x120, compreso piletta;cad;2,00;300,00;600,00",
  "1.3;Demolizione di tramezzi;mq;30,00;12,00;360,00",
].join("\n");

const apri = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <GeneraMaterialiDialog orderId="o1" orderCode="DEMO-1" open onOpenChange={() => {}} />
  </QueryClientProvider>,
);

beforeEach(() => { computi = []; vociLette = []; tabelle.fasi = []; salva.mutate.mockReset(); });

describe("Genera dal computo", () => {
  it("senza computo apre la finestra di «Importa voci»: trascinamento, scelta e gli stessi formati", async () => {
    apri();
    expect(await screen.findByText("Trascina qui i file")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Genera dal computo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli file" })).toBeInTheDocument();
    const formati = within(screen.getByRole("list", { name: "Formati letti" })).getAllByRole("listitem").map((l) => l.textContent);
    expect(formati).toEqual(["PriMus (XPWE)", "PDF", "Excel", "CSV", "Word", "Foto"]);
    // La vecchia finestra (nome del computo, «Carica e leggi») non c'è più.
    expect(screen.queryByRole("button", { name: /Carica e leggi/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome del computo")).not.toBeInTheDocument();
  });

  it("legge il file, fa rivedere le voci e solo alla conferma salva il computo della commessa", async () => {
    apri();
    const input = await screen.findByLabelText("File da cui importare le voci") as HTMLInputElement;
    const file = new File([CSV], "computo-prova.csv", { type: "text/csv" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    const avanti = await screen.findByRole("button", { name: "Avanti: materiali da 3 voci" }, { timeout: 3000 });
    expect(salva.mutate).not.toHaveBeenCalled();
    fireEvent.click(avanti);
    expect(salva.mutate).toHaveBeenCalledTimes(1);
    const [arg] = salva.mutate.mock.calls[0];
    expect(arg.voci.map((v: { descrizione: string }) => v.descrizione)).toEqual([
      "Intonaco civile premiscelato spessore 2 cm",
      "Fornitura e posa in opera di piatto doccia 80x120, compreso piletta",
      "Demolizione di tramezzi",
    ]);
    expect(arg.file[0]).toMatchObject({ formato: "CSV", via: "browser" });
    expect(arg.file[0].file.name).toBe("computo-prova.csv");
    expect(arg.sostituisce).toBeNull();
  });

  it("col computo letto lo nomina, lo fa aprire e «Carica un altro» riapre la stessa finestra", async () => {
    computi = [computo({})];
    apri();
    expect(await screen.findByText("Computo esecutivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri il computo" })).toBeInTheDocument();
    expect(screen.queryByText("Trascina qui i file")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Carica un altro/ }));
    expect(await screen.findByText("Trascina qui i file")).toBeInTheDocument();
    expect(screen.getByText(/«Computo esecutivo» resta archiviato/)).toBeInTheDocument();
  });

  it("mentre legge lo dice, senza chiedere un altro file", () => {
    computi = [computo({ extraction_status: "analyzing_ai", file_name: "lavori.pdf", titolo: null })];
    apri();
    expect(screen.getByText(/Sto leggendo «lavori.pdf»/)).toBeInTheDocument();
    expect(screen.queryByText("Trascina qui i file")).not.toBeInTheDocument();
  });

  it("se l'ultimo file non si è letto lo dice nella finestra e fa riprovare", async () => {
    computi = [computo({ extraction_status: "failed", extraction_error: "file vuoto", file_name: "rotto.pdf" })];
    apri();
    expect(await screen.findByRole("alert")).toHaveTextContent("«rotto.pdf») non si è letto: file vuoto");
    expect(screen.getByRole("button", { name: /Riprova la lettura/ })).toBeInTheDocument();
    expect(await screen.findByText("Trascina qui i file")).toBeInTheDocument();
  });

  it("dopo le voci, i materiali per fase: voce di provenienza, sicurezza, selezione per fase", async () => {
    computi = [computo({})];
    vociLette = [
      { id: "v1", codice_prezzario: "01.A10", descrizione_breve: "Intonaco civile premiscelato spessore 2 cm", unita_misura: "mq", quantita: 100, super_categoria: "Opere murarie" },
      { id: "v2", descrizione_breve: "Demolizione di tramezzi", unita_misura: "mq", quantita: 30, super_categoria: "Opere murarie" },
    ];
    apri();
    expect(await screen.findByText("Intonaco premiscelato di fondo")).toBeInTheDocument();
    expect(screen.getAllByText(/da 01\.A10 · Intonaco civile premiscelato/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Probabile 70%/).length).toBe(2);
    expect(screen.getByText(/Spessore 2 cm invece di 1,5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva i materiali (2)" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Includi Paraspigolo"));
    expect(screen.getByRole("button", { name: "Salva i materiali (1)" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Seleziona tutti i materiali"));
    expect(screen.getByRole("button", { name: "Salva i materiali (2)" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText(/Seleziona i materiali di/));
    expect(screen.getByRole("button", { name: "Salva i materiali (0)" })).toBeDisabled();
    fireEvent.click(screen.getByText(/Escluse 1 voci/));
    expect(screen.getByText(/Demolizione, rimozione/)).toBeInTheDocument();
  });

  it("un computo senza capitoli («Opere edili» di riserva) va nelle fasi dei mestieri, senza creare una fase nuova", async () => {
    // Prova su Demo Azienda 2, 14/11/2026: 30 materiali finivano in «Opere edili (nuova)».
    tabelle.fasi = ["Intonaci e cartongessi", "Impianto idraulico", "Tinteggiature"].map((name, position) => ({ id: `f-${position}`, name, position }));
    computi = [computo({})];
    vociLette = [
      { id: "v1", descrizione_breve: "Controsoffitto in cartongesso con lastra da 12,5 mm", unita_misura: "mq", quantita: 35, super_categoria: "Opere edili", capitolo_nome: "Opere edili" },
      { id: "v2", descrizione_breve: "Fornitura e posa di vaso sospeso in ceramica", unita_misura: "cad", quantita: 2, super_categoria: "Opere edili", capitolo_nome: "Opere edili" },
      { id: "v3", descrizione_breve: "Fornitura di sacchi di sabbia lavata", unita_misura: "cad", quantita: 10, super_categoria: "Opere edili", capitolo_nome: "Opere edili" },
    ];
    apri();
    expect(await screen.findByText("Lastra in cartongesso")).toBeInTheDocument();
    const fasi = screen.getAllByText(/ · \d+$/).map((e) => e.textContent);
    expect(fasi).toEqual(expect.arrayContaining(["Intonaci e cartongessi · 5", "Impianto idraulico · 1", "Opere edili (nuova) · 1"]));
    expect(fasi).toHaveLength(3);
  });
});
