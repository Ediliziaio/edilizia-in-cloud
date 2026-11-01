/**
 * Il popup «Crea con Silvio», fase 4: squadra, ditte, mezzi e ordini proposti coi dati
 * dell'azienda; chi non è disponibile ha il ⚠ e resta fuori; «Va bene» li fa entrare in «Crea»;
 * l'offerta di una ditta si collega alla sua richiesta e diventa l'ordine in bozza.
 * Lettori e database finti, dati inventati.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";

const CAPO = "c0000000-0000-4000-a000-0000000000c1";
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [{ id: "c0000000-0000-4000-a000-0000000000c1", first_name: "Carlo", last_name: "Capo", email: null }] }),
}));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const PREVENTIVO = "q0000000-0000-4000-a000-000000000142";
const MARIO = "e0000000-0000-4000-a000-000000000001";
const LUCA = "e0000000-0000-4000-a000-000000000002";
const DITTA = "a0000000-0000-4000-a000-0000000000d1";
const FORNITORE = "f0000000-0000-4000-a000-000000000001";

const dalPreventivo: Frammento = {
  fonte: { tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" },
  aree: {
    identita: { "identita.description": { valore: "Rifacimento bagno", fiducia: 1, stato: "fatto" } },
    cliente: { "cliente.nome": { valore: { client_name: "Cliente Prova" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 12000, fiducia: 1, stato: "fatto" } },
    fasi: {
      "fasi.work_start_date": { valore: "2026-12-01", fiducia: 1, stato: "fatto" },
      "fasi.order_work_phases": {
        valore: [
          { name: "Demolizioni", start_date: "2026-12-01", end_date: "2026-12-03" },
          { name: "Impianto idraulico", start_date: "2026-12-07", end_date: "2026-12-11", sottofasi: [{ name: "Tubazioni", quantita: 30, costo: 900 }] },
        ],
        fiducia: 1, stato: "fatto",
      },
    },
  },
};

const contesto: ContestoRisorse = {
  oggi: "2026-11-02",
  dipendenti: [{ id: MARIO, nome: "Mario Prova", attivo: true }, { id: LUCA, nome: "Luca Prova", attivo: true }],
  storicoDipendenti: [{ employee_id: MARIO, fase: "Demolizioni" }, { employee_id: LUCA, fase: "Impianto idraulico" }],
  // Mario è già su un altro cantiere nei giorni delle demolizioni.
  impegniDipendenti: [{ employee_id: MARIO, commessa: "O-0099", dal: "2026-11-30", al: "2026-12-04" }],
  assenze: [],
  staff: [{ id: CAPO, nome: "Carlo Capo" }],
  capomastri: [CAPO],
  ditte: [{ id: DITTA, nome: "Idraulica Prova", subappaltatore_id: "s0000000-0000-4000-a000-000000000001" }],
  storicoDitte: [{ external_team_id: DITTA, fase: "Impianto idraulico" }],
  documentiDitte: [{ subappaltatore_id: "s0000000-0000-4000-a000-000000000001", tipo: "durc", scadenza: "2027-02-28" }],
  mezzi: [], storicoMezzi: [], impegniMezzi: [],
  fornitori: [{ id: FORNITORE, nome: "Termoidraulica Prova", lead_time_days: 7 }],
  storicoAcquisti: [],
};

function dbFinto() {
  const salvati: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (nome: string, _args: Record<string, unknown>) => {
    if (nome === "commessa_crea_con_silvio") {
      return { data: { order_id: "o1", colonne: 4, fasi: 2, voci: 0, rate: 0, contratto: false, righe_registrate: 9,
        risorse: { persone: 1, ditte: 1, mezzi: 0, oda: 0, contratti: 0, promemoria: 0, non_prenotati: [], saltati: [] } }, error: null };
    }
    return { data: 0, error: null };
  });
  const query = () => {
    const q: Record<string, unknown> = {};
    const catena = (k: string) => (...a: unknown[]) => { if (k === "insert" || k === "update") salvati.push(a[0] as Record<string, unknown>); return q; };
    for (const k of ["select", "insert", "update", "eq", "neq", "gt", "order", "limit"]) q[k] = catena(k);
    const riga = async () => ({ data: { id: "b1", stato: "bozza", fonti: [] as unknown[], piano: {}, storia: [] as unknown[] }, error: null as unknown });
    q.single = riga;
    q.maybeSingle = riga;
    return q;
  };
  return {
    rpc, salvati,
    from: () => query(),
    storage: { from: () => ({ download: async () => ({ data: null as unknown, error: { message: "no" } }), upload: async () => ({ data: null as unknown, error: null as unknown }), remove: async () => ({ data: null as unknown, error: null as unknown }) }) },
  };
}

function servizi(over: Partial<ServiziSilvioCommessa> = {}) {
  const db = dbFinto();
  const s: ServiziSilvioCommessa = {
    elencaPreventivi: vi.fn(async () => []),
    elencaComputi: vi.fn(async () => []),
    frammentiPreventivo: vi.fn(async () => [dalPreventivo]),
    frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "offerta_ditta", fonte: "offerta", ai: true, immagine: false, motivo: "offerta" },
      frammenti: [], daCollegare: "richiesta_offerta",
    })),
    leggiTesto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo" }, frammenti: [],
    })),
    registraCorrezioni: vi.fn(async () => {}),
    frammentiCommessa: vi.fn(async () => []),
    elencaAllegati: vi.fn(async () => []),
    scaricaAllegato: vi.fn(async () => new File([], "vuoto")),
    leggiRemoto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: false, motivo: "documento" }, frammenti: [],
    })),
    frammentoContratto: vi.fn(async (): Promise<Frammento> => ({ fonte: { tipo: "contratto", etichetta: "contratto" }, aree: {} })),
    scaricaCaricato: vi.fn(async () => new File([], "vuoto")),
    apriDocumento: vi.fn(async () => ""),
    chat: vi.fn(async () => ({ testo: "", strumenti: [], costoEur: 0 })),
    saldoAI: vi.fn(async () => ({ saldoEur: 5, bloccato: false })),
    trascrivi: vi.fn(async () => ""),
    contestoRisorse: vi.fn(async () => contesto),
    richiesteOfferta: vi.fn(async () => [{
      id: "r0000000-0000-4000-a000-000000000001", rfq_number: "RDO-2026-0001", titolo: "Impianto idraulico",
      supplier_id: FORNITORE, fornitore: "Termoidraulica Prova",
    }]),
    leggiOfferta: vi.fn(async () => ({
      offerta: { righe: [{ voce_richiesta: "Tubazioni", prezzo_unitario: 12, aliquota_iva: 22 }], giorni_consegna: 5 },
      quantita: { Tubazioni: 30 },
    })),
    db: db as unknown as ClientBozze,
    ...over,
  };
  return { s, db };
}

function apri(s: ServiziSilvioCommessa) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s} onCreata={vi.fn()}
          iniziale={{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const commessa = () => screen.getByRole("tabpanel", { name: "La commessa" });
const area = (nome: string) => within(commessa()).findByRole("region", { name: nome });

describe("Popup «Crea con Silvio», fase 4", () => {
  it("propone squadra, capomastro e ditta coi dati veri: chi è impegnato ha il ⚠ e non entra", async () => {
    const { s, db } = servizi();
    apri(s);
    const persone = await area("Persone");
    await waitFor(() => expect(s.contestoRisorse).toHaveBeenCalledWith(AZIENDA, [{ id: CAPO, nome: "Carlo Capo" }], null));
    expect(await within(persone).findByText(/⚠ Mario Prova/)).toBeInTheDocument();
    expect(within(persone).getByText(/Mario Prova è già sulla commessa O-0099 dal 30\/11 al 04\/12/)).toBeInTheDocument();
    expect(within(persone).getByText("Luca Prova")).toBeInTheDocument();
    // Il capomastro si legge per nome, dallo staff.
    expect(within(persone).getByText("Carlo Capo")).toBeInTheDocument();

    const ditte = await area("Ditte e subappalti");
    // La ditta, e il suo contratto in bozza.
    expect(within(ditte).getAllByText("Idraulica Prova")).toHaveLength(2);
    const chat = screen.getByRole("log", { name: "Messaggi con Silvio" });
    expect(within(chat).getByText(/Ti propongo 1 persona, 1 ditta.*⚠ Uno non è disponibile/)).toBeInTheDocument();

    // «Va bene» sulla squadra e sulla ditta, poi «Crea».
    const squadra = within(persone).getByText("Squadra").closest("li")!;
    fireEvent.click(within(squadra as HTMLElement).getByRole("button", { name: "Va bene" }));
    const assegnate = within(ditte).getByText("Ditte").closest("li")!;
    fireEvent.click(within(assegnate as HTMLElement).getByRole("button", { name: "Va bene" }));
    fireEvent.click(screen.getByRole("button", { name: /^Crea/ }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith("commessa_crea_con_silvio", { p_bozza_id: "b1" }));

    const ultima = db.salvati.filter((r) => r.scrittura).at(-1)!.scrittura as {
      squadra: unknown[]; ditte: unknown[]; escluse: { chiave: string; motivo: string }[];
    };
    expect(ultima.squadra).toEqual([{ employee_id: LUCA, fase: "Impianto idraulico" }]);
    expect(ultima.ditte).toEqual([{ external_team_id: DITTA, fase: "Impianto idraulico", costo_previsto: 900 }]);
    expect(ultima.escluse).toContainEqual(expect.objectContaining({ chiave: "persone.squadra", motivo: expect.stringMatching(/^Mario Prova: /) }));
  });

  it("l'offerta di una ditta si collega alla sua richiesta e diventa l'ordine in bozza", async () => {
    const { s } = servizi();
    apri(s);
    await area("Persone");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "offerta-idraulica.pdf", { type: "application/pdf" })] } });
    });
    const fonti = screen.getByRole("list", { name: "Fonti caricate" });
    // L'offerta si legge solo col via (ha un costo): poi resta da collegare.
    const leggi = screen.queryByRole("button", { name: /^Leggi\s+il documento/ });
    if (leggi) fireEvent.click(leggi);
    expect(await within(fonti).findByText(/da collegare/)).toBeInTheDocument();

    fireEvent.change(await within(fonti).findByLabelText(/A quale richiesta risponde/), { target: { value: "r0000000-0000-4000-a000-000000000001" } });
    fireEvent.click(within(fonti).getByRole("button", { name: /Leggi l'offerta/ }));
    await waitFor(() => expect(s.leggiOfferta).toHaveBeenCalledWith("r0000000-0000-4000-a000-000000000001", expect.any(File)));

    const materiali = await area("Materiali e acquisti");
    expect(await within(materiali).findByText("Termoidraulica Prova")).toBeInTheDocument();
    expect(within(materiali).getByText(/ordinare entro 2 dic/)).toBeInTheDocument();
    expect(within(fonti).getByText("offerta Termoidraulica Prova (RDO-2026-0001)")).toBeInTheDocument();
  });
});
