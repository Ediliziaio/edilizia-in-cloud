/**
 * Il popup «Crea con Silvio», seconda revisione del 2/11/2026 (docs/silvio-commessa-revisione-20261102.md,
 * P1–P9), più quello che database e logica hanno preparato e il popup deve mostrare (D7, D9, D10,
 * G3, G8, G17, G18, G19, G20). Lettori e database finti: niente Supabase, niente AI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactNode } from "react";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";

const permessi = { canViewOrderAmounts: true, canViewMargins: true, canViewCosts: true };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [{ id: "cliente-mario", first_name: "Mario", last_name: "Rossi", email: null as string | null }] }) }));
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));
vi.mock("@/components/silvio-commessa/useCreaConSilvioAttivo", () => ({ useCreaConSilvioAttivo: () => true }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";
import { PianoDiVoloCommessa } from "@/components/silvio-commessa/PianoDiVoloCommessa";
import { pianoSenzaFonte } from "@/components/silvio-commessa/useBozzaSilvio";
import { IMPOSTAZIONI_PREDEFINITE } from "@/lib/silvio-commessa/autonomia";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const PREVENTIVO = "q0000000-0000-4000-a000-000000000142";

const base = (aree: Frammento["aree"] = {}, extra: Partial<Frammento> = {}): Frammento => ({
  fonte: { tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" },
  aree: {
    identita: { "identita.description": { valore: "Rifacimento bagno", fiducia: 1, stato: "fatto" } },
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 48500, fiducia: 1, stato: "fatto" } },
    ...aree,
  },
  ...extra,
});

const FASI = {
  "fasi.work_start_date": { valore: "2030-01-07", fiducia: 1, stato: "fatto" as const },
  "fasi.order_work_phases": {
    valore: [{ name: "Demolizioni", start_date: "2030-01-07", end_date: "2030-01-09", sottofasi: [{ name: "Tubi", quantita: 1, costo: 900 }] }],
    fiducia: 1, stato: "fatto" as const,
  },
};

interface OpzioniDb {
  rispostaRpc?: Record<string, unknown>;
  /** Il salvataggio di una bozza che c'è già. */
  update?: () => Promise<{ data: unknown; error: unknown }>;
  bozze?: unknown[];
  erroreSelect?: { message: string } | null;
}

function dbFinto(o: OpzioniDb = {}) {
  const rpc = vi.fn(async (nome: string, _a: Record<string, unknown>) => {
    if (nome === "commessa_crea_con_silvio") {
      return { data: { order_id: "o1", colonne: 4, fasi: 0, voci: 0, rate: 0, contratto: false, righe_registrate: 7, ...o.rispostaRpc }, error: null };
    }
    return { data: 1, error: null };
  });
  const cancellate: unknown[] = [];
  const inserite: unknown[] = [];
  const query = () => {
    const q: Record<string, unknown> = {};
    let ultimo: "update" | "delete" | "select" | "insert" = "select";
    const catena = (k: string) => (...a: unknown[]) => {
      if (k === "update" || k === "delete" || k === "insert") ultimo = k;
      if (k === "insert") inserite.push(a[0]);
      if (k === "eq" && ultimo === "delete" && a[0] === "id") cancellate.push(a[1]);
      // Rileva anche un'eventuale regressione che tenti di eliminare tutte le bozze dell'autore.
      if (k === "eq" && ultimo === "delete" && a[0] === "created_by") cancellate.push(...(o.bozze ?? []).map((b) => (b as { id: string }).id));
      return q;
    };
    for (const k of ["select", "insert", "update", "delete", "eq", "neq", "gt", "order", "limit"]) q[k] = catena(k);
    q.single = async () => ({ data: { id: "b1", stato: "bozza" }, error: null as unknown });
    q.maybeSingle = async () => (ultimo === "update" && o.update ? o.update() : { data: { id: "b1" }, error: null as unknown });
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve(ok({ data: o.bozze ?? [], error: ultimo === "select" ? o.erroreSelect ?? null : null }));
    return q;
  };
  const storage = {
    from: () => ({
      download: async () => ({ data: new Blob(["x"]), error: null as unknown }),
      upload: async () => ({ data: null as unknown, error: null as unknown }),
      remove: async () => ({ data: null as unknown, error: null as unknown }),
    }),
  };
  return { rpc, from: () => query(), storage, cancellate, inserite };
}

function servizi(over: Partial<ServiziSilvioCommessa> = {}, frammenti: Frammento[] = [base()], o: OpzioniDb = {}) {
  const db = dbFinto(o);
  const s: ServiziSilvioCommessa = {
    elencaPreventivi: vi.fn(async () => []),
    elencaComputi: vi.fn(async () => []),
    frammentiPreventivo: vi.fn(async () => frammenti),
    frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" }, frammenti: [],
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
    saldoAI: vi.fn(async () => ({ saldoEur: null, bloccato: false })),
    trascrivi: vi.fn(async () => ""),
    contestoRisorse: vi.fn(async () => { throw new Error("non in questo test"); }),
    richiesteOfferta: vi.fn(async () => []),
    leggiOfferta: vi.fn(async () => ({ offerta: {}, quantita: {} })),
    db: db as unknown as ClientBozze,
    ...over,
  };
  return { s, db };
}

function avvolgi(n: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{n}</MemoryRouter></QueryClientProvider>);
}

const apri = (s: ServiziSilvioCommessa, p: Record<string, unknown> = {}) => avvolgi(
  <CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s} onCreata={vi.fn()}
    iniziale={{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }} {...p} />,
);
const commessa = () => screen.getByRole("tabpanel", { name: "La commessa" });
const fontiColonna = () => screen.getByRole("tabpanel", { name: "Fonti" });
const crea = () => screen.getByRole("button", { name: /^Crea/ });
const pronto = () => screen.findByText("Rifacimento bagno");
/** Scrive in chat, dopo che la fonte è stata letta. */
const inChat = async (testo: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: "Scrivi a Silvio" }), { target: { value: testo } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Scrivi a Silvio" }), { key: "Enter" });
};
const pdf = () => new File(["x"], "Contratto.pdf", { type: "application/pdf" });

// Aspettano il salvataggio vero, con la sua attesa: sotto carico i 5 secondi di serie non bastano.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  permessi.canViewOrderAmounts = true; permessi.canViewMargins = true; permessi.canViewCosts = true;
});

describe("P1: «Crea» non scrive una bozza vecchia", () => {
  it("se l'ultima modifica non si salva si ferma e lo dice", async () => {
    const { s, db } = servizi({}, [base()], { update: async () => ({ data: null, error: { message: "Failed to fetch" } }) });
    apri(s);
    await pronto();
    await waitFor(() => expect(db.inserite.length).toBeGreaterThan(0), { timeout: 3000 });
    fireEvent.click(within(commessa()).getByRole("button", { name: "Modifica «Importo»" }));
    fireEvent.change(within(commessa()).getByLabelText("Importo"), { target: { value: "50000" } });
    fireEvent.click(within(commessa()).getByRole("button", { name: "Salva" }));
    fireEvent.click(crea());
    expect(await screen.findByRole("alert")).toHaveTextContent(/non si è salvata/);
    expect(db.rpc).not.toHaveBeenCalledWith("commessa_crea_con_silvio", expect.anything());
  });
});

describe("P2: gli importi seguono «Importi di vendita»", () => {
  const conCosti = base({ fasi: FASI });
  it("Controlla: chi entra in parte non è barrato, e la fine lavori segue le fasi", async () => {
    const squadra = { "persone.squadra": { valore: [
      { employee_id: "e0000000-0000-4000-a000-000000000001", nome: "Mario", fase: "Demolizioni", stato: "proposta" },
      { employee_id: "e0000000-0000-4000-a000-000000000002", nome: "Luca", fase: "Demolizioni", stato: "attenzione", avviso: "è in ferie" },
    ], fiducia: 1, stato: "fatto" as const } };
    const { s } = servizi({}, [base({ fasi: { ...FASI, "fasi.work_end_date": { valore: "2030-03-01", fiducia: 0.7, stato: "proposta" as const } }, persone: squadra })]);
    apri(s);
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: /Controlla/ }));
    const persone = await screen.findByRole("region", { name: "Persone" });
    expect(within(persone).getByText(/entra in parte, resta fuori:.*Luca/)).toBeInTheDocument();
    expect(within(persone).getByText(/Mario/).className).not.toMatch(/line-through/);
    const fasi = screen.getByRole("region", { name: "Fasi e tempi" });
    expect(within(fasi).getByText("9 gen 2030")).toBeInTheDocument();
    expect(within(fasi).getByText(/segue le fasi: 1 mar 2030 entra solo se la confermi/)).toBeInTheDocument();
    expect(within(fasi).queryByText(/resta fuori/)).toBeNull();
  });

  it("il margine con i costi parziali non è una percentuale: si dicono i costi e cosa manca", async () => {
    const { s } = servizi({}, [conCosti]);
    apri(s);
    await pronto();
    expect(screen.getByText("Costi inseriti")).toBeInTheDocument();
    expect(screen.queryByText(/Margine previsto/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/98\s*%/);
  });

  it("senza il permesso sui costi non si vedono i costi inseriti né la cifra di una ditta; la chat non li riceve", async () => {
    permessi.canViewCosts = false;
    const ditte = { "ditte.assegnate": { valore: [{ external_team_id: "t1", nome: "Edil Rossi", fase: "Demolizioni", costo_previsto: 7777, stato: "proposta" }], fiducia: 1, stato: "fatto" as const } };
    const { s } = servizi({}, [base({ fasi: FASI, ditte })]);
    apri(s);
    await pronto();
    expect(document.body.textContent).toMatch(/Edil Rossi/);
    expect(document.body.textContent).not.toMatch(/7\.777/);
    expect(screen.queryByText("Costi inseriti")).toBeNull();
    await inChat("cambia il titolo");
    await waitFor(() => expect(s.chat).toHaveBeenCalled());
    const contesto = JSON.stringify((s.chat as ReturnType<typeof vi.fn>).mock.calls[0][0].contesto);
    expect(contesto).not.toMatch(/7777|"costo":900/);
    expect(contesto).toMatch(/Edil Rossi/);
  });

  it("senza il permesso niente importo, margine, domanda sull'importo né contesto alla chat", async () => {
    permessi.canViewOrderAmounts = false;
    const { s } = servizi({}, [conCosti]);
    apri(s);
    await pronto();
    expect(document.body.textContent).not.toMatch(/48\.500/);
    expect(screen.queryByText(/Margine/)).toBeNull();
    const riga = within(commessa()).getByText("Importo").closest("li")!;
    expect(within(riga).getByText(/non visibile/)).toBeInTheDocument();
    expect(within(riga).queryByRole("button", { name: /Modifica/ })).toBeNull();
    expect(within(riga).queryByRole("button", { name: /Da dove viene/ })).toBeNull();
    await inChat("cambia il titolo");
    await waitFor(() => expect(s.chat).toHaveBeenCalled());
    expect(JSON.stringify((s.chat as ReturnType<typeof vi.fn>).mock.calls[0][0].contesto)).not.toMatch(/48500/);
  });

  it("con il permesso si vedono importo e margine; senza quello sui margini, il margine no", async () => {
    // Coi costi veri: 900 € su 48.500 € verrebbe 98 %, che si dice in un altro modo (vedi sotto).
    const conCosti = base({ fasi: { ...FASI, "fasi.order_work_phases": { ...FASI["fasi.order_work_phases"], valore: [{ name: "Demolizioni", start_date: "2030-01-07", end_date: "2030-01-09", sottofasi: [{ name: "Tubi", quantita: 1, costo: 30000 }] }] } } });
    const { s } = servizi({}, [conCosti]);
    const { unmount } = apri(s);
    await pronto();
    expect(screen.getByText(/Margine/)).toBeInTheDocument();
    expect(within(commessa()).getByText("48.500 €")).toBeInTheDocument();
    unmount();
    permessi.canViewMargins = false;
    apri(servizi({}, [conCosti]).s);
    await pronto();
    expect(screen.queryByText(/Margine/)).toBeNull();
  });

  it("dopo «Crea» dice cosa i permessi e le impostazioni hanno tolto, in parole", async () => {
    const onCreata = vi.fn();
    const { s } = servizi({}, [base()], { rispostaRpc: { tolte_permessi: ["importi", "contratti_ditte"], tolte_autonomia: ["mezzi"] } });
    apri(s, { onCreata });
    await pronto();
    fireEvent.click(crea());
    const carta = await screen.findByRole("region", { name: "Commessa creata" });
    expect(carta).toHaveTextContent(/Importi di vendita/);
    expect(carta).toHaveTextContent(/contratti delle ditte/);
    expect(carta).toHaveTextContent(/nelle impostazioni/i);
    expect(carta).toHaveTextContent(/i mezzi/);
    expect(carta.textContent).not.toMatch(/contratti_ditte|tolte_/);
    expect(onCreata).not.toHaveBeenCalled();
  });
});

describe("D9: la risposta di prima si è persa", () => {
  it("con gia_creata riprende gli allegati e porta alla commessa, senza contare due volte le correzioni", async () => {
    const onCreata = vi.fn();
    const leggiFile = vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" },
      percorso: "a/b/contratto.pdf",
      frammenti: [{ fonte: { tipo: "contratto", etichetta: "Contratto.pdf" }, aree: {
        identita: { "identita.description": { valore: "Rifacimento bagno", fiducia: 1, stato: "fatto" } },
        cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
      } }],
    }));
    const { s, db } = servizi({ leggiFile }, [], { rispostaRpc: { gia_creata: true } });
    apri(s, { onCreata, iniziale: { tipo: "file", file: pdf() } });
    fireEvent.click((await screen.findAllByRole("button", { name: /Sì, leggilo/ }))[0]);
    await pronto();
    fireEvent.click(crea());
    await waitFor(() => expect(onCreata).toHaveBeenCalledWith("o1"));
    expect(db.rpc).toHaveBeenCalledWith("commessa_bozza_allega", expect.objectContaining({ p_bozza_id: "b1" }));
    expect(s.registraCorrezioni).not.toHaveBeenCalled();
  });

  it("un salvataggio rifiutato perché la bozza è già scritta non ferma la ripresa", async () => {
    const onCreata = vi.fn();
    const { s, db } = servizi({}, [base()], { rispostaRpc: { gia_creata: true }, update: async () => ({ data: null, error: null }) });
    apri(s, { onCreata });
    await pronto();
    await waitFor(() => expect(db.inserite.length).toBeGreaterThan(0), { timeout: 3000 });
    fireEvent.click(within(commessa()).getByRole("button", { name: "Modifica «Importo»" }));
    fireEvent.change(within(commessa()).getByLabelText("Importo"), { target: { value: "50000" } });
    fireEvent.click(within(commessa()).getByRole("button", { name: "Salva" }));
    fireEvent.click(crea());
    await waitFor(() => expect(onCreata).toHaveBeenCalledWith("o1"));
  });
});

describe("P4: «Crea» aspetta tutto", () => {
  it("con un documento in attesa del via non parte, e lo nomina", async () => {
    const { s } = servizi();
    apri(s, { iniziale: [{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }, { tipo: "file", file: pdf() }] });
    await pronto();
    expect(crea()).toBeDisabled();
    expect(screen.getByText(/Per creare:.*Contratto\.pdf/)).toBeInTheDocument();
  });

  it("mentre Silvio risponde non parte", async () => {
    let finisci!: (v: { testo: string; strumenti: never[]; costoEur: number }) => void;
    const { s } = servizi({ chat: vi.fn(() => new Promise((r) => { finisci = r; })) as ServiziSilvioCommessa["chat"] });
    apri(s);
    await pronto();
    await inChat("cambia qualcosa");
    await waitFor(() => expect(crea()).toBeDisabled());
    expect(screen.getByText(/Per creare:.*risposta di Silvio/)).toBeInTheDocument();
    await act(async () => { finisci({ testo: "ok", strumenti: [], costoEur: 0 }); });
    await waitFor(() => expect(crea()).toBeEnabled());
  });

  it("un documento non letto non ferma, ma si dice che non entra", async () => {
    const { s } = servizi({ leggiFile: vi.fn(async () => { throw new Error("Silvio non ha restituito la lettura: riprova."); }) });
    apri(s, { iniziale: [{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }, { tipo: "file", file: pdf() }] });
    await pronto();
    fireEvent.click(screen.getAllByRole("button", { name: /Sì, leggilo/ })[0]);
    expect(await screen.findByText(/Non letti, restano fuori: Contratto\.pdf/)).toBeInTheDocument();
    expect(crea()).toBeEnabled();
  });
});

describe("P5: mai errori in inglese", () => {
  it("una lettura e una chat che falliscono parlano italiano", async () => {
    const { s } = servizi({
      leggiFile: vi.fn(async () => { throw new Error("Edge Function returned a non-2xx status code"); }),
      chat: vi.fn(async () => { throw new Error("Failed to send a request to the Edge Function"); }),
    });
    apri(s, { iniziale: [{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }, { tipo: "file", file: pdf() }] });
    await pronto();
    fireEvent.click(screen.getAllByRole("button", { name: /Sì, leggilo/ })[0]);
    await screen.findAllByText(/Non sono riuscito a leggere «Contratto\.pdf»/);
    await inChat("prova");
    await screen.findAllByText(/Non riesco a rispondere/);
    expect(document.body.textContent).not.toMatch(/Edge Function|non-2xx|Failed to/);
  });
});

describe("P6: un'offerta da collegare ha un'uscita", () => {
  it("«Leggilo come documento normale» lo fa leggere come documento, anche senza richieste aperte", async () => {
    const leggiFile = vi.fn(async (_f: File, o: { comeDocumento?: boolean }): Promise<EsitoLettura> => (o.comeDocumento
      ? { riconosciuto: { lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: false, motivo: "m" }, frammenti: [{ fonte: { tipo: "documento", etichetta: "Offerta.pdf" }, aree: {} }] }
      : { riconosciuto: { lettore: "offerta_ditta", fonte: "offerta", ai: true, immagine: false, motivo: "m" }, frammenti: [], daCollegare: "richiesta_offerta" }));
    const { s } = servizi({ leggiFile: leggiFile as unknown as ServiziSilvioCommessa["leggiFile"] });
    apri(s, { iniziale: [{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }, { tipo: "file", file: new File(["x"], "Offerta.pdf", { type: "application/pdf" }) }] });
    await pronto();
    fireEvent.click(screen.getAllByRole("button", { name: /Sì, leggilo/ })[0]);
    fireEvent.click(await within(fontiColonna()).findByRole("button", { name: /Leggilo come documento normale/ }));
    await waitFor(() => expect(leggiFile).toHaveBeenCalledTimes(2));
    expect(leggiFile.mock.calls[1][1].comeDocumento).toBe(true);
    await waitFor(() => expect(within(fontiColonna()).queryByRole("button", { name: /Leggilo come documento normale/ })).toBeNull());
  });
});

describe("P7: i contratti saltati si dicono", () => {
  it("col nome della ditta e il motivo, mai l'id", async () => {
    const ID = "a0000000-0000-4000-a000-0000000000d1";
    const conDitta = base({ ditte: { "ditte.contratti": { valore: [{ nome: "Idraulica Prova", external_team_id: ID, importo: 100, stato: "proposta", fasi: [] }], fiducia: 1, stato: "fatto" } } });
    const { s } = servizi({}, [conDitta], {
      rispostaRpc: { risorse: { persone: 0, ditte: 0, mezzi: 0, oda: 0, contratti: 0, promemoria: 0, non_prenotati: [], saltati: [{ contratto: ID, motivo: "ditta senza subappaltatore collegato" }] } },
    });
    apri(s);
    await pronto();
    fireEvent.click(crea());
    const carta = await screen.findByRole("region", { name: "Commessa creata" });
    expect(carta).toHaveTextContent(/Idraulica Prova: ditta senza subappaltatore collegato/);
    expect(carta.textContent).not.toContain(ID);
  });
});

describe("P8: si tocca col dito", () => {
  const alto = (b: HTMLElement) => /(^|\s)(min-h-11|h-11|h-12)(\s|$)/.test(b.className);
  it("ogni pulsante di Fonti e Commessa, testata e barra è di almeno 44 px sotto lg", async () => {
    const leggi = vi.fn(async () => { throw new Error("Silvio non ha restituito la lettura: riprova."); });
    const { s } = servizi({ leggiFile: leggi, elencaAllegati: vi.fn(async () => [{ id: "a1", nome: "Doc.pdf", path: "x", mime: "application/pdf", dimensione: 10 }]) },
      [base({ fasi: FASI })]);
    apri(s, { iniziale: [{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }, { tipo: "file", file: pdf() }] });
    await pronto();
    fireEvent.click(screen.getAllByRole("button", { name: /Sì, leggilo/ })[0]);
    await within(fontiColonna()).findByRole("button", { name: "Riprova" });
    fireEvent.click(within(fontiColonna()).getByRole("button", { name: "Preventivo" }));
    fireEvent.click(within(commessa()).getByRole("button", { name: "Modifica «Importo»" }));
    const piccoli = [
      ...within(fontiColonna()).getAllByRole("button"),
      ...within(commessa()).getAllByRole("button"),
      ...screen.getAllByRole("button").filter((b) => b.closest("header,footer")),
    ].filter((b) => !alto(b)).map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(piccoli).toEqual([]);
    for (const c of within(commessa()).getAllByRole("textbox")) expect(c.className).toMatch(/(^|\s)h-11(\s|$)/);
  });

  it("la ripresa dice che i documenti non letti non si salvano", async () => {
    const bozza = { id: "b9", created_by: UTENTE, modo: "crea", updated_at: "2026-11-01T10:00:00Z", fonti: [] as unknown[], storia: [] as unknown[], piano: fondi(pianoVuoto(AZIENDA), base()) };
    const { s } = servizi({}, [], { bozze: [bozza] });
    apri(s, { iniziale: null });
    fireEvent.click(await screen.findByRole("button", { name: "Riprendi la commessa" }));
    await screen.findAllByText(/I documenti che non avevo ancora letto non si salvano/);
  });
});

describe("P9: il telefono e le uscite", () => {
  it("Escape nella ricerca chiude l'elenco senza uscire dalla bozza", async () => {
    const { s } = servizi();
    const chiudi = vi.fn();
    apri(s, { iniziale: undefined, onOpenChange: chiudi });
    fireEvent.click(within(fontiColonna()).getByRole("button", { name: "Preventivo", exact: true }));
    const ricerca = await screen.findByRole("textbox", { name: "Cerca un preventivo" });
    fireEvent.keyDown(ricerca, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Cerca un preventivo" })).not.toBeInTheDocument());
    expect(chiudi).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Nuova commessa con Silvio" })).toBeInTheDocument();
  });
  it("un errore nel recupero delle bozze si vede e si può riprovare", async () => {
    const opzioni: OpzioniDb = { erroreSelect: { message: "Failed to fetch" } };
    const { s } = servizi({}, [], opzioni);
    apri(s, { iniziale: undefined });
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a recuperare le bozze precedenti");
    opzioni.erroreSelect = null;
    fireEvent.click(screen.getByRole("button", { name: "Riprova a caricare le bozze" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
  it("il salvataggio si vede anche sul telefono", async () => {
    const { s } = servizi();
    apri(s);
    await pronto();
    const stato = await screen.findByText(/bozza salvata/, undefined, { timeout: 3000 });
    expect(stato.closest("[class*='max-sm:hidden']")).toBeNull();
    expect(stato.className).not.toMatch(/max-sm:hidden/);
  });

  it("«Togli questa fonte» toglie la fonte e i suoi valori, e il file non va con la commessa", async () => {
    const { s } = servizi();
    apri(s);
    await pronto();
    fireEvent.click(within(fontiColonna()).getByRole("button", { name: /Togli questa fonte: preventivo PR-0142/ }));
    fireEvent.click(within(fontiColonna()).getByRole("button", { name: /Sì, togli/ }));
    await waitFor(() => expect(within(commessa()).queryByText("48.500 €")).toBeNull());
    expect(within(fontiColonna()).queryByText("preventivo PR-0142")).toBeNull();
    await screen.findAllByText(/Ho tolto «preventivo PR-0142»/);
  });

  it("la fonte tolta lascia quello che ha scritto la persona; con due in disaccordo resta l'altra", () => {
    const contratto: Frammento = { fonte: { tipo: "contratto", id: "c1", etichetta: "Contratto.pdf" }, aree: { economia: { "economia.total_amount": { valore: 47900, fiducia: 0.9, stato: "fatto" } } } };
    const p = fondi(fondi(pianoVuoto(AZIENDA), base()), contratto);
    expect(p.conflitti).toHaveLength(1);
    const { piano, tolti } = pianoSenzaFonte(p, [{ id: "c1", etichetta: "Contratto.pdf" }]);
    expect(piano.conflitti).toHaveLength(0);
    expect(piano.aree.economia?.["economia.total_amount"]?.valore).toBe(48500);
    expect(piano.aree.economia?.["economia.total_amount"]?.stato).toBe("fatto");
    expect(tolti).toBe(1);
    expect(piano.fonti.map((f) => f.etichetta)).not.toContain("Contratto.pdf");
    // Rileggere il documento giusto dopo averlo tolto funziona: non è «tolto da te».
    const riletto = fondi(pianoSenzaFonte(fondi(pianoVuoto(AZIENDA), base()), [{ id: PREVENTIVO, etichetta: "preventivo PR-0142" }]).piano, base());
    expect(riletto.aree.economia?.["economia.total_amount"]?.valore).toBe(48500);
  });

  it("l'eliminazione della bozza scelta richiede conferma e conserva le altre", async () => {
    const bozza = { id: "b9", created_by: UTENTE, modo: "crea", updated_at: "2026-11-01T10:00:00Z", fonti: [] as unknown[], storia: [] as unknown[], piano: fondi(pianoVuoto(AZIENDA), base()) };
    const { s, db } = servizi({}, [], { bozze: [bozza, { ...bozza, id: "b10" }] });
    apri(s, { iniziale: null });
    fireEvent.click(await screen.findByRole("button", { name: "Elimina bozza" }));
    expect(db.cancellate).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Sì, buttala via" }));
    await waitFor(() => expect(db.cancellate).toEqual(["b9"]));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Bozza da riprendere" })).toBeNull());
  });

  it("inizia un'altra commessa senza eliminare o modificare la bozza lasciata a metà", async () => {
    const bozza = { id: "b9", created_by: UTENTE, modo: "crea", updated_at: "2026-11-01T10:00:00Z", fonti: [] as unknown[], storia: [] as unknown[], piano: fondi(pianoVuoto(AZIENDA), base()) };
    const { s, db } = servizi({}, [], { bozze: [bozza] });
    apri(s, { iniziale: null });
    fireEvent.click(await screen.findByRole("button", { name: "Inizia un’altra" }));
    expect(screen.queryByRole("region", { name: "Bozza da riprendere" })).toBeNull();
    expect(db.cancellate).toEqual([]);
    expect(db.inserite).toEqual([]);
  });

  it("sceglie e riprende una bozza precedente senza cancellare le altre", async () => {
    const bozza = (id: string, titolo: string) => ({ id, created_by: UTENTE, modo: "crea", updated_at: "2026-11-01T10:00:00Z", fonti: [] as unknown[], storia: [] as unknown[], piano: fondi(pianoVuoto(AZIENDA), base({ identita: { "identita.description": { valore: titolo, fiducia: 1, stato: "fatto" } } })) });
    const { s, db } = servizi({}, [], { bozze: [bozza("b9", "Casa A"), bozza("b10", "Casa B")] });
    apri(s, { iniziale: null });
    fireEvent.change(await screen.findByRole("combobox", { name: "Bozza da riprendere" }), { target: { value: "b10" } });
    fireEvent.click(screen.getByRole("button", { name: "Riprendi la commessa" }));
    expect((await within(commessa()).findAllByText("Casa B")).length).toBeGreaterThan(0);
    expect(db.cancellate).toEqual([]);
  });
});

describe("Il piano di volo: l'esito resta (P3, D7)", () => {
  const proposta = (extra: Record<string, unknown> = {}) => ({
    id: "v1", tipo: "controllo", giorno: "2030-01-04", riassunto: "Parte tra 3 giorni", fase: "Tetto", problemi: [] as unknown[],
    azioni: [
      { tipo: "attivita", titolo: "Chiama la ditta", testo: "t", scadenza: null as string | null },
      { tipo: "attivita", titolo: "Ordina le tegole", testo: "t", scadenza: null as string | null },
    ],
    ...extra,
  });

  it("confermata: la riga sparisce ma l'esito si legge", async () => {
    let lista = [proposta()];
    const rpc = vi.fn(async (nome: string, _a?: Record<string, unknown>) => {
      if (nome === "silvio_volo_della_commessa") return { data: lista, error: null };
      lista = [];
      return { data: { fatte: [{ indice: 0, tipo: "attivita" }, { indice: 1, tipo: "attivita" }], saltate: [] as unknown[], gia_fatte: [] as number[], non_scelte: [] as number[], stato: "confermata" }, error: null };
    });
    avvolgi(<PianoDiVoloCommessa orderId="o1" companyId="c" puoModificare db={{ rpc }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fai queste 2" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Fatto: 2 cose/);
    await waitFor(() => expect(screen.queryByText(/Chiama la ditta/)).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent(/Fatto: 2 cose/);
  });

  it("aperta: la riga resta, il fatto è spuntato e non si rifà, il saltato ha il motivo e si può rifare", async () => {
    const saltate = [{ indice: 1, tipo: "attivita", motivo: "il mezzo è già prenotato" }];
    let lista = [proposta()];
    const rpc = vi.fn(async (nome: string, _a?: Record<string, unknown>) => {
      if (nome === "silvio_volo_della_commessa") return { data: lista, error: null };
      lista = [proposta({ gia_fatte: [0], saltate })];
      return { data: { fatte: [{ indice: 0, tipo: "attivita" }], saltate, gia_fatte: [] as number[], non_scelte: [] as number[], stato: "aperta" }, error: null };
    });
    avvolgi(<PianoDiVoloCommessa orderId="o1" companyId="c" puoModificare db={{ rpc }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Fai queste 2" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Fatto: 1 cosa. Non fatto: 1/);
    expect(await screen.findByText(/^Non fatto: il mezzo è già prenotato\.$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Chiama la ditta/ })).toBeNull());
    expect(screen.getByText(/Chiama la ditta/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Fai questa" }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("silvio_volo_conferma", { p_id: "v1", p_indici: [1] }));
  });

  it("una proposta riaperta mostra da sola quello che era stato saltato; un motivo tecnico non si vede", async () => {
    const lista = [proposta({ gia_fatte: [0], saltate: [{ indice: 1, tipo: "attivita", motivo: "insert or update on table \"tasks\" violates foreign key" }] })];
    const rpc = vi.fn(async () => ({ data: lista, error: null }));
    avvolgi(<PianoDiVoloCommessa orderId="o1" companyId="c" puoModificare db={{ rpc }} />);
    expect(await screen.findByText(/Non si è potuto fare/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/violates/);
  });
});

describe("Quello che i livelli sotto hanno preparato", () => {
  it("D10: le letture dei dati dell'azienda fallite si dicono in «Da sapere»", async () => {
    const contesto = {
      oggi: "2026-11-02", dipendenti: [], storicoDipendenti: [], impegniDipendenti: [], assenze: [], staff: [], capomastri: [], ditte: [], storicoDitte: [],
      documentiDitte: [], mezzi: [], storicoMezzi: [], impegniMezzi: [], fornitori: [], storicoAcquisti: [], lettureFallite: ["le persone"],
    } as ContestoRisorse;
    const { s } = servizi({ contestoRisorse: vi.fn(async () => contesto) }, [base({ fasi: FASI })]);
    apri(s);
    await within(commessa()).findByText(/Silvio non è riuscito a leggere: le persone/);
  });

  it("G18: l'importo proposto dalla chat ha «Va bene» e non è pronto", async () => {
    const { s } = servizi({ chat: vi.fn(async () => ({ testo: "", costoEur: 0, strumenti: [{ nome: "cambia_valore", argomenti: { chiave: "economia.total_amount", valore: 99000 } }] })) } as Partial<ServiziSilvioCommessa>);
    apri(s);
    await pronto();
    await inChat("metti l'importo del documento");
    const riga = (await within(commessa()).findByText("99.000 €")).closest("li")!;
    expect(within(riga).getByRole("button", { name: "Va bene" })).toBeInTheDocument();
  });

  it("G8: gli avvisi del piano si leggono nella colonna, senza quelli tecnici, una volta sola", async () => {
    const f = base({}, { avvisi: ["Il documento dice 49.000 € per «Importo», la commessa ha 48.500 €", "l'area «xyz» non esiste, ignorata"] });
    const { s } = servizi({}, [f]);
    apri(s);
    await pronto();
    expect(within(commessa()).getAllByText(/Il documento dice 49\.000/)).toHaveLength(1);
    expect(within(commessa()).queryByText(/ignorata/)).toBeNull();
    expect(within(commessa()).getByRole("heading", { name: /Da decidere|Da sapere|Niente di urgente/ })).toBeInTheDocument();
  });

  it("G3/G20: la nota dell'inizio lavori si vede anche quando è «fatto»", async () => {
    const { s } = servizi({}, [base({ fasi: FASI })]);
    apri(s);
    await pronto();
    fireEvent.click(within(commessa()).getByRole("button", { name: /Modifica «Inizio lavori»|Modifica «.*nizio/ }));
    fireEvent.change(within(commessa()).getByLabelText("Inizio lavori"), { target: { value: "2030-01-06" } });
    fireEvent.click(within(commessa()).getByRole("button", { name: "Salva" }));
    await within(commessa()).findByText(/primo giorno utile/);
  });

  it("G19: la chat rispetta l'autonomia dell'azienda", async () => {
    const impostazioni = { ...IMPOSTAZIONI_PREDEFINITE, autonomia: { squadra: { livello: "vietata", soglia_eur: null as number | null } } };
    const { s } = servizi({
      impostazioni: vi.fn(async () => impostazioni as typeof IMPOSTAZIONI_PREDEFINITE),
      chat: vi.fn(async () => ({ testo: "", costoEur: 0, strumenti: [{ nome: "cambia_valore", argomenti: { chiave: "persone.capomastro", valore: "x" } }] })),
    } as Partial<ServiziSilvioCommessa>);
    apri(s);
    await pronto();
    await waitFor(() => expect(s.impostazioni).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    await inChat("metti il capomastro");
    await screen.findAllByText(/nelle impostazioni Silvio non lo fa/);
  });

  it("G20: la nota sul conflitto imponibile contro ivato si legge, in chat e in «Da decidere»", async () => {
    const iva = base({ economia: { "economia.total_amount": { valore: 10000, fiducia: 1, stato: "fatto" }, "economia.vat_rate": { valore: 22, fiducia: 1, stato: "fatto" } } });
    const contratto: Frammento = { fonte: { tipo: "contratto", id: "c1", etichetta: "Contratto.pdf" }, aree: { economia: { "economia.total_amount": { valore: 12200, fiducia: 0.9, stato: "fatto" } } } };
    const { s } = servizi({}, [iva, contratto]);
    apri(s);
    await pronto();
    expect(within(commessa()).getAllByText(/sembra lo stesso importo/).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("tabpanel", { name: "Chat con Silvio" })).getByText(/sembra lo stesso importo/)).toBeInTheDocument();
  });

  it("G17: una scadenza già passata si legge accanto al promemoria", async () => {
    const f = base({ sicurezza: { "sicurezza.adempimenti": { valore: [{ titolo: "Notifica preliminare", scadenza: "2020-01-01", avviso: "Andava fatto entro il 01/01: la data è già passata, fallo subito." }], fiducia: 1, stato: "fatto" } } });
    const { s } = servizi({}, [f]);
    apri(s);
    await pronto();
    expect(within(commessa()).getByText(/Da fare subito: Notifica preliminare, era da fare entro il 1 gen/)).toBeInTheDocument();
  });

  it("le rate in percentuale con importo 0 mostrano la percentuale, e la nota che aspettano l'IVA", async () => {
    const f = base({ pagamenti: { "pagamenti.rate": { valore: [{ label: "Acconto", type: "deposit", amount: 0, percent: 30, daPercentuale: true }], fiducia: 1, stato: "fatto", nota: "Manca il totale: gli importi delle rate si calcolano dalle percentuali quando arriva." } } });
    (f.aree.economia as Record<string, unknown>)["economia.total_amount"] = undefined;
    delete (f.aree.economia as Record<string, unknown>)["economia.total_amount"];
    const { s } = servizi({}, [f]);
    apri(s);
    await pronto();
    const riga = within(commessa()).getByText("Rate").closest("li")!;
    expect(within(riga).getByText("30 %")).toBeInTheDocument();
    expect(riga.textContent).not.toMatch(/0 €/);
    expect(within(riga).getByText(/Manca il totale/)).toBeInTheDocument();
  });
});

describe("Visto a schermo il 2/11: quello che test e classi non dicevano", () => {
  /** La tastiera del telefono: l'altezza visibile si accorcia, e il popup se ne accorge da lì. */
  function tastieraFinta() {
    const larghezza = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    const vv = Object.assign(new EventTarget(), { height: window.innerHeight });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    return {
      apri: () => act(() => { vv.height = window.innerHeight - 280; vv.dispatchEvent(new Event("resize")); }),
      togli: () => {
        Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
        Object.defineProperty(window, "innerWidth", { value: larghezza, configurable: true });
      },
    };
  }

  it("con la tastiera aperta la barra si nasconde, e dopo il tocco torna solo con un attimo di ritardo: il pulsante deve ricevere il click", async () => {
    const t = tastieraFinta();
    const { s } = servizi();
    apri(s);
    await pronto();
    const barra = crea().closest("footer")!;
    const campo = screen.getByRole("textbox", { name: "Scrivi a Silvio" });
    fireEvent.focus(campo);
    expect(barra.className).not.toMatch(/max-lg:hidden/); // Il fuoco da solo non basta: senza tastiera non si nasconde niente.
    t.apri();
    expect(barra.className).toMatch(/max-lg:hidden/);
    fireEvent.blur(campo);
    expect(barra.className).toMatch(/max-lg:hidden/);
    await waitFor(() => expect(barra.className).not.toMatch(/max-lg:hidden/));
    t.togli();
  });

  it("alla chiusura il fuoco torna a chi ha aperto il popup", async () => {
    const { s } = servizi();
    function ConPulsante() {
      const [aperto, setAperto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAperto(true)}>Apri il popup</button>
          {aperto && <CreaConSilvioDialog open onOpenChange={setAperto} companyId={AZIENDA} userId={UTENTE} servizi={s} />}
        </>
      );
    }
    avvolgi(<ConPulsante />);
    const pulsante = screen.getByRole("button", { name: "Apri il popup" });
    pulsante.focus();
    fireEvent.click(pulsante);
    const popup = await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(popup));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(pulsante));
  });

  it("Esc mentre si modifica un valore annulla la modifica e non chiude il popup", async () => {
    const onOpenChange = vi.fn();
    const { s } = servizi();
    apri(s, { onOpenChange });
    await pronto();
    fireEvent.click(within(commessa()).getByRole("button", { name: "Modifica «Importo»" }));
    expect(within(commessa()).getByLabelText("Importo")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(commessa()).queryByLabelText("Importo")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("gli avvisi stanno sotto, chiusi; nelle fonti uno solo in più si dice al singolare", async () => {
    const avvisi = ["Primo avviso", "Secondo avviso", "Terzo avviso", "Quarto avviso"];
    const { s } = servizi({}, [base({}, { avvisi })]);
    apri(s);
    await pronto();
    expect(await within(commessa()).findByText(/Altre \d+ cose, se vuoi guardarle/)).toBeInTheDocument();
    expect(within(fontiColonna()).getByText("e un altro avviso")).toBeInTheDocument();
  });
});

describe("Le correzioni d'esperienza del 2/11: a schermo", () => {
  const conTante = () => base({
    fasi: FASI,
    persone: { "persone.squadra": { valore: [{ employee_id: "e1", nome: "Mario Prova", fase: "Demolizioni", stato: "attenzione", avviso: "è in ferie" }], fiducia: 0.5, stato: "proposta" as const } },
  }, { avvisi: ["Pagina 7 illeggibile"] });

  it("1: la persona non libera sta sotto il titolo chiuso, non alla pari del cliente", async () => {
    const { s } = servizi({}, [conTante()]);
    apri(s);
    await pronto();
    const decidere = within(commessa()).getByRole("region", { name: /Niente di urgente|Da decidere/ });
    const altre = decidere.querySelector("details[data-silvio-altre]") as HTMLDetailsElement;
    expect(altre).not.toBeNull();
    expect(altre.open).toBe(false);
    expect(within(altre).getByText("Mario Prova")).toBeInTheDocument();
    expect(within(altre).getByText(/Pagina 7 illeggibile/)).toBeInTheDocument();
    expect(within(altre).getByText(/Altre \d+ cose, se vuoi guardarle/)).toBeInTheDocument();
  });

  it("1: un conflitto resta in evidenza, fuori dal gruppo chiuso", async () => {
    const altro: Frammento = { fonte: { tipo: "contratto", id: "c1", etichetta: "Contratto.pdf" }, aree: { economia: { "economia.total_amount": { valore: 49000, fiducia: 1, stato: "fatto" } } } };
    const { s } = servizi({}, [conTante(), altro]);
    apri(s);
    await pronto();
    const decidere = await within(commessa()).findByRole("region", { name: /Da decidere/ });
    const frase = within(decidere).getByText(/i documenti non sono d'accordo/);
    expect(frase.closest("details")).toBeNull();
  });

  it("2: il riepilogo in testa porta al dato, anche in «Controlla»; senza permesso niente importi", async () => {
    const { s } = servizi({}, [base({ fasi: FASI })]);
    const { unmount } = apri(s);
    await pronto();
    const riepilogo = within(commessa()).getByRole("region", { name: "Da controllare" });
    expect(within(riepilogo).getByRole("button", { name: /^importo 48\.500\s€: / })).toBeInTheDocument();
    expect(within(riepilogo).getByRole("button", { name: /^dal 7 gen: / })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Controlla" }));
    expect(within(await screen.findByRole("region", { name: "Da controllare" })).getByRole("button", { name: /^importo 48\.500\s€: / })).toBeInTheDocument();
    unmount();

    permessi.canViewOrderAmounts = false;
    const niente = servizi({}, [base({ fasi: FASI })]);
    apri(niente.s);
    await pronto();
    const senza = within(commessa()).getByRole("region", { name: "Da controllare" });
    expect(senza.textContent).not.toMatch(/48\.500|importo|IVA|rate/i);
    expect(within(senza).getByRole("button", { name: /^dal 7 gen: / })).toBeInTheDocument();
  });

  it("3: da una foto l'importo ha «Va bene» in evidenza, e il popup dice perché", async () => {
    const f = base({ economia: { "economia.total_amount": { valore: 48500, fiducia: 0.6, stato: "proposta", daConfermare: true, nota: "Letto da un'immagine: controlla. Entra nella commessa solo se premi «Va bene»." } } });
    const { s } = servizi({}, [f]);
    apri(s);
    await pronto();
    const decidere = await within(commessa()).findByRole("region", { name: /Da decidere/ });
    expect(within(decidere).getAllByText(/Letto da un'immagine.*«Va bene»/).length).toBeGreaterThan(0);
    fireEvent.click(within(decidere).getByRole("button", { name: "Va bene" }));
    await waitFor(() => expect(within(commessa()).getByRole("button", { name: /^importo 48\.500\s€: scritto da te/ })).toBeInTheDocument());
  });

  it("4: salvare una bozza nuova conserva il lavoro lasciato nelle altre", async () => {
    const { s, db } = servizi({}, [base()], { bozze: [{ id: "vecchia" }] });
    apri(s);
    await pronto();
    await screen.findByText("bozza salvata ✓", {}, { timeout: 3000 });
    expect(db.inserite).toHaveLength(1);
    expect(db.cancellate).toEqual([]);
  });

  it("5: «il totale è 15.000» non chiede anche «Va bene»; un'altra cifra sì", async () => {
    const { s } = servizi({ chat: vi.fn(async () => ({ testo: "", costoEur: 0, strumenti: [{ nome: "cambia_valore" as const, argomenti: { chiave: "economia.total_amount", valore: 15000 } }] })) } as Partial<ServiziSilvioCommessa>);
    apri(s);
    await pronto();
    await inChat("il totale è 15.000");
    const riga = (await within(commessa()).findByText("15.000 €")).closest("li")!;
    expect(within(riga).queryByRole("button", { name: "Va bene" })).toBeNull();
  });

  it("6: la scadenza passata si legge «da fare subito», non «entro»", async () => {
    const f = base({ sicurezza: { "sicurezza.adempimenti": { valore: [{ titolo: "CILA", scadenza: "2020-10-26" }], fiducia: 1, stato: "fatto" } } });
    const { s } = servizi({}, [f]);
    apri(s);
    await pronto();
    expect(within(commessa()).getByText(/Da fare subito: CILA, era da fare entro il 26 ott/)).toBeInTheDocument();
    expect(within(commessa()).queryByText(/entro 26 ott/)).toBeNull();
  });

  it("7: nata da un testo, senza una fase da confermare, il popup dice che finisce in «Contratto Firmato»", async () => {
    const testo = base({}, { fonte: { tipo: "testo", etichetta: "testo scritto" } });
    const { s } = servizi({ statiCommessa: vi.fn(async () => [{ name: "Contratto Firmato", position: 0, is_default: true, is_support_phase: false }]) } as Partial<ServiziSilvioCommessa>, [testo]);
    apri(s);
    await pronto();
    expect((await screen.findAllByText(/«Contratto Firmato» anche senza firma/)).length).toBeGreaterThan(0);
  });
});
