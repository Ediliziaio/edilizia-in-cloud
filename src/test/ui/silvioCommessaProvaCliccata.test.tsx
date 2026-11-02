/**
 * I difetti trovati cliccando il popup «Crea con Silvio» come una persona (2/11/2026), con file
 * veri e AI finta: qui quelli che si vedono solo col popup in mano. Dati di prova inventati.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";

const CAPO = "a0000000-0000-4000-a000-0000000000c1";
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrderAmounts: true, canViewMargins: true, canViewCosts: true }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [{ id: "a0000000-0000-4000-a000-0000000000c1", first_name: "Carlo", last_name: "Capoferri", email: "c@esempio.it" }] }),
}));
vi.mock("@/hooks/useCompanyCustomers", () => ({
  useCompanyCustomers: () => ({ data: [{ id: "c0000000-0000-4000-a000-000000000001", first_name: "Luisa", last_name: "Marchetto", email: "luisa@esempio.it" }] }),
}));
vi.mock("@/hooks/useSediAnalytics", () => ({ useSediList: () => ({ data: [{ id: "5ede0000-0000-4000-a000-000000000001", nome: "Sede di Monza" }] }) }));
vi.mock("@/hooks/useVoiceInput", () => ({ useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }) }));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const FASI = [{ name: "Ponteggio", start_date: "2026-11-16", end_date: "2026-11-18" }, { name: "Manto", start_date: "2026-11-19", end_date: "2026-12-21" }];

const dalContratto: Frammento = {
  fonte: { tipo: "contratto", id: "contratto.pdf", etichetta: "contratto.pdf" },
  aree: {
    identita: { "identita.description": { valore: "Rifacimento del tetto", fiducia: 0.9, stato: "fatto" } },
    cliente: { "cliente.nome": { valore: { client_name: "Luisa Marchetto" }, fiducia: 0.9, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 48000, fiducia: 0.9, stato: "fatto" }, "economia.vat_rate": { valore: 10, fiducia: 0.9, stato: "fatto" } },
    fasi: { "fasi.order_work_phases": { valore: FASI, fiducia: 0.9, stato: "fatto" }, "fasi.work_start_date": { valore: "2026-11-16", fiducia: 0.9, stato: "fatto" } },
  },
};
const dalCapitolato: Frammento = {
  fonte: { tipo: "documento", id: "capitolato.pdf", etichetta: "capitolato.pdf" },
  aree: { identita: { "identita.description": { valore: "Rifacimento del tetto", fiducia: 0.9, stato: "fatto" } } },
};
const dalModello: Frammento = {
  fonte: { tipo: "modello", id: "modello:tetti", etichetta: "modello «tetto»" },
  aree: {
    fasi: {
      "fasi.order_work_phases": { valore: [{ name: "Ponteggio e sicurezza", giorni: 2 }], fiducia: 0.4, stato: "proposta" },
      "fasi.work_end_date": { valore: "2026-12-09", fiducia: 0.3, stato: "proposta" },
      "fasi.expected_date": { valore: "2026-12-09", fiducia: 0.3, stato: "proposta" },
    },
  },
  avvisi: ["manca la misura: durate a 100 mq"],
};
const esito = (frammenti: Frammento[]): EsitoLettura => ({
  riconosciuto: { lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: false, motivo: "documento" }, frammenti,
});

/** Un db in memoria: la riga della bozza resta, così si chiude e si riprende. */
function dbFinto() {
  const righe: Record<string, unknown>[] = [];
  const query = () => {
    let op = "select";
    let dati: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "gt", "order", "limit"]) q[k] = () => q;
    q.insert = (r: Record<string, unknown>) => { op = "insert"; dati = r; return q; };
    q.update = (r: Record<string, unknown>) => { op = "update"; dati = r; return q; };
    q.delete = () => { op = "delete"; return q; };
    const fine = async () => {
      if (op === "insert") { const r = JSON.parse(JSON.stringify({ id: "b1", stato: "bozza", created_by: UTENTE, modo: "crea", updated_at: "2026-11-02T10:00:00Z", storia: [], fonti: [], ...dati })); righe.push(r); return { data: r, error: null as unknown }; }
      if (op === "update") { Object.assign(righe[0] ?? {}, JSON.parse(JSON.stringify(dati))); return { data: righe[0] ?? null, error: null as unknown }; }
      return { data: righe[0] ?? null, error: null as unknown };
    };
    q.single = fine;
    q.maybeSingle = fine;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: righe.map((r) => ({ ...r })), error: null as unknown }).then(ok);
    return q;
  };
  return {
    righe,
    rpc: vi.fn(async () => ({ data: 0, error: null as unknown })),
    from: () => query(),
    storage: { from: () => ({ download: async () => ({ data: null as unknown, error: { message: "no" } }), upload: async () => ({ data: null as unknown, error: null as unknown }), remove: async () => ({ data: null as unknown, error: null as unknown }) }) },
  };
}

function servizi(over: Partial<ServiziSilvioCommessa> = {}) {
  const db = dbFinto();
  const s: ServiziSilvioCommessa = {
    elencaPreventivi: vi.fn(async () => []), elencaComputi: vi.fn(async () => []), frammentiPreventivo: vi.fn(async () => []), frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async () => esito([dalContratto])), leggiTesto: vi.fn(async () => esito([])), leggiRemoto: vi.fn(async () => esito([])),
    registraCorrezioni: vi.fn(async () => {}), frammentiCommessa: vi.fn(async () => []), elencaAllegati: vi.fn(async () => []),
    scaricaAllegato: vi.fn(async () => new File([], "vuoto")), frammentoContratto: vi.fn(async (): Promise<Frammento> => ({ fonte: { tipo: "contratto", etichetta: "c" }, aree: {} })),
    scaricaCaricato: vi.fn(async () => new File([], "vuoto")), apriDocumento: vi.fn(async () => ""),
    chat: vi.fn(async () => ({ testo: "", strumenti: [], costoEur: 0 })), saldoAI: vi.fn(async () => ({ saldoEur: null, bloccato: false })), trascrivi: vi.fn(async () => ""),
    contestoRisorse: vi.fn(async () => { throw new Error("non in questo test"); }), richiesteOfferta: vi.fn(async () => []), leggiOfferta: vi.fn(async () => ({ offerta: {}, quantita: {} })),
    db: db as unknown as ClientBozze, ...over,
  };
  return { s, db };
}

function apri(s: ServiziSilvioCommessa) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s} />
    </MemoryRouter></QueryClientProvider>,
  );
}

const pdf = (nome: string) => new File(["%PDF-1.4"], nome, { type: "application/pdf" });
const carica = (...file: File[]) => fireEvent.change(screen.getByLabelText("Scegli i file da far leggere a Silvio"), { target: { files: file } });
const chat = () => screen.getByRole("log", { name: "Messaggi con Silvio" });
const commessa = () => screen.getByRole("tabpanel", { name: "La commessa" });
const fonti = () => screen.getByRole("list", { name: "Fonti caricate" });
const riga = (chiave: string) => commessa().querySelector(`[data-chiave="${chiave}"]`) as HTMLElement;
async function leggi(...file: File[]) {
  carica(...file);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Leggi (il documento|i documenti)$/ })); });
}

describe("Il modello non si mette contro i documenti", () => {
  it("un capitolato senza fasi, letto dopo un contratto con le fasi, non porta fine lavori e consegna dal modello", async () => {
    const leggiFile = vi.fn(async (f: File) => esito(f.name === "contratto.pdf" ? [dalContratto] : [dalCapitolato, dalModello]));
    const { s } = servizi({ leggiFile });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
    await leggi(pdf("capitolato.pdf"));
    await within(chat()).findByText(/capitolato\.pdf/);
    await waitFor(() => expect(within(riga("fasi.order_work_phases")).getByText(/2 fasi/)).toBeInTheDocument());
    expect(within(riga("fasi.work_end_date")).queryByText(/9 dic/)).toBeNull();
    expect(within(riga("fasi.expected_date")).queryByText(/9 dic/)).toBeNull();
    expect(commessa()).not.toHaveTextContent(/manca la misura/);
  });

  it("anche se il capitolato finisce prima: arrivate le fasi vere, quello che aveva messo il modello va via", async () => {
    const leggiFile = vi.fn(async (f: File) => esito(f.name === "contratto.pdf" ? [dalContratto] : [dalCapitolato, dalModello]));
    const { s } = servizi({ leggiFile });
    apri(s);
    await leggi(pdf("capitolato.pdf"));
    await waitFor(() => expect(within(riga("fasi.work_end_date")).getByText(/9 dic/)).toBeInTheDocument());
    await leggi(pdf("contratto.pdf"));
    await waitFor(() => expect(within(riga("fasi.order_work_phases")).getByText(/2 fasi/)).toBeInTheDocument());
    expect(within(riga("fasi.work_end_date")).queryByText(/9 dic/)).toBeNull();
    expect(within(riga("fasi.expected_date")).queryByText(/9 dic/)).toBeNull();
    expect(commessa()).not.toHaveTextContent(/manca la misura/);
    expect(within(fonti()).getByText("capitolato.pdf")).toBeInTheDocument();
  });

  it("la riga «Fine lavori» dice la data che la commessa prende dalle fasi, non «manca»", async () => {
    const { s } = servizi();
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await waitFor(() => expect(within(riga("fasi.work_end_date")).getByText(/21 dic 2026/)).toBeInTheDocument());
    expect(within(riga("fasi.work_end_date")).getByText(/segue le fasi/)).toBeInTheDocument();
  });
});

describe("«Controlla» parla di persone, non di codici", () => {
  it("il capomastro si legge per nome", async () => {
    const dalContrattoECapo: Frammento = { ...dalContratto, aree: { ...dalContratto.aree, persone: { "persone.capomastro": { valore: CAPO, fiducia: 1, stato: "fatto" } } } };
    const { s } = servizi({ leggiFile: vi.fn(async () => esito([dalContrattoECapo])) });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
    fireEvent.click(screen.getByRole("button", { name: "Controlla" }));
    const persone = screen.getByRole("region", { name: "Persone" });
    expect(within(persone).getByText("Carlo Capoferri")).toBeInTheDocument();
    expect(persone).not.toHaveTextContent(CAPO);
  });
});

describe("La sede si legge per nome", () => {
  it("nella riga e in «Controlla», non il codice", async () => {
    const SEDE = "5ede0000-0000-4000-a000-000000000001";
    const conSede: Frammento = { ...dalContratto, aree: { ...dalContratto.aree, identita: { ...dalContratto.aree.identita, "identita.sede_id": { valore: SEDE, fiducia: 1, stato: "fatto" } } } };
    const { s } = servizi({ leggiFile: vi.fn(async () => esito([conSede])) });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
    expect(riga("identita.sede_id")).toHaveTextContent("Sede di Monza");
    expect(riga("identita.sede_id")).not.toHaveTextContent(SEDE);
    fireEvent.click(screen.getByRole("button", { name: "Controlla" }));
    const identita = screen.getByRole("region", { name: "Identità" });
    expect(within(identita).getByText("Sede di Monza")).toBeInTheDocument();
    expect(identita).not.toHaveTextContent(SEDE);
  });
});

describe("Il cliente che non si ritrova", () => {
  it("la riga non promette di cercarlo alla creazione, e Silvio lo chiede in chat", async () => {
    const nuovo: Frammento = { ...dalContratto, aree: { ...dalContratto.aree, cliente: { "cliente.nome": { valore: { client_name: "Arnaldo Bressanin" }, fiducia: 0.9, stato: "fatto" } } } };
    const { s } = servizi({ leggiFile: vi.fn(async () => esito([nuovo])) });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/«Arnaldo Bressanin» non è ancora nel gestionale/);
    expect(within(chat()).getByRole("button", { name: "Scegli o crea il cliente" })).toBeInTheDocument();
    expect(riga("cliente.customer_id")).not.toHaveTextContent(/alla creazione lo cerco/);
    expect(riga("cliente.customer_id")).toHaveTextContent(/sceglilo o crealo/);
  });
});

describe("«Cosa manca?»", () => {
  it("con solo un dato da chiedere la frase non resta a metà («Prima di creare: .»)", async () => {
    const nuovo: Frammento = { ...dalContratto, aree: { ...dalContratto.aree, cliente: { "cliente.nome": { valore: { client_name: "Arnaldo Bressanin" }, fiducia: 0.9, stato: "fatto" } } } };
    const { s } = servizi({ leggiFile: vi.fn(async () => esito([nuovo])) });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/non è ancora nel gestionale/);
    fireEvent.click(screen.getByRole("button", { name: "Cosa manca?" }));
    const risposta = within(chat()).getByText(/Prima di creare/);
    expect(risposta.textContent).toMatch(/Prima di creare: 2 dati da chiedere\./);
  });
});

describe("La chat dopo un annulla", () => {
  const conStrumento = (chiave: string, valore: unknown) => vi.fn(async () => ({ testo: "", strumenti: [{ nome: "cambia_valore", argomenti: { chiave, valore } }], costoEur: 0 }));
  const scrivi = async (t: string) => {
    fireEvent.change(screen.getByLabelText("Scrivi a Silvio"), { target: { value: t } });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText("Scrivi a Silvio"), { key: "Enter" }); });
    await act(async () => { await Promise.resolve(); });
  };

  it("togli il segno «cambiato in chat» e il pulsante Annulla della modifica che non c'è più", async () => {
    const chatFinta = vi.fn()
      .mockResolvedValueOnce({ testo: "", strumenti: [{ nome: "cambia_valore", argomenti: { chiave: "identita.description", valore: "Tetto A" } }], costoEur: 0 })
      .mockResolvedValueOnce({ testo: "", strumenti: [{ nome: "cambia_valore", argomenti: { chiave: "identita.work_description", valore: "Tetto B" } }], costoEur: 0 });
    const { s } = servizi({ chat: chatFinta });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
    await scrivi("cambia il titolo");
    await waitFor(() => expect(riga("identita.description")).toHaveTextContent(/cambiato in chat/));
    await scrivi("cambia la descrizione");
    await waitFor(() => expect(riga("identita.work_description")).toHaveTextContent(/cambiato in chat/));
    expect(within(chat()).getAllByRole("button", { name: "Annulla" })).toHaveLength(1);
    const ultimaRisposta = within(chat()).getAllByRole("button", { name: "Annulla" })[0].closest("div.rounded-2xl") as HTMLElement;
    await scrivi("annulla");
    await within(chat()).findByText(/ho rimesso com'era/);
    expect(riga("identita.work_description")).not.toHaveTextContent(/cambiato in chat/);
    // Il pulsante resta solo sulla risposta che l'annulla toglierebbe davvero: quella di prima.
    expect(within(ultimaRisposta).queryByRole("button", { name: "Annulla" })).toBeNull();
    expect(within(chat()).getAllByRole("button", { name: "Annulla" })).toHaveLength(1);
  });

  it("una modifica a mano dopo la risposta: Annulla non sta più sulla risposta, che non toglierebbe lei", async () => {
    const { s } = servizi({ chat: conStrumento("identita.description", "Tetto A") });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
    await scrivi("cambia il titolo");
    await waitFor(() => expect(within(chat()).getAllByRole("button", { name: "Annulla" })).toHaveLength(1));
    fireEvent.click(within(riga("economia.total_amount")).getByRole("button", { name: /Modifica/ }));
    fireEvent.change(within(riga("economia.total_amount")).getByRole("textbox"), { target: { value: "47000" } });
    fireEvent.click(within(riga("economia.total_amount")).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(within(chat()).queryAllByRole("button", { name: "Annulla" })).toHaveLength(0));
  });
});

describe("File che non si leggono, e crediti", () => {
  it("un file che non si legge si dice in chat, col motivo: sul telefono si parte da lì", async () => {
    const { s } = servizi();
    apri(s);
    carica(new File(["PK"], "archivio-foto.zip", { type: "application/zip" }));
    expect(await within(chat()).findByText(/«archivio-foto\.zip».*formato non letto/)).toBeInTheDocument();
    expect(within(chat()).queryByText(/mentre leggo/)).toBeNull();
    expect(s.leggiFile).not.toHaveBeenCalled();
  });

  it("un file oltre i 20 MB si ferma subito: niente stima, niente caricamento, niente Riprova", async () => {
    const { s } = servizi();
    apri(s);
    const grosso = pdf("contratto-enorme.pdf");
    Object.defineProperty(grosso, "size", { value: 26 * 1024 * 1024 });
    carica(grosso);
    expect(await within(chat()).findByText(/«contratto-enorme\.pdf».*troppo grande.*20 MB/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Leggi il documento/ })).toBeNull();
    expect(within(fonti()).queryByRole("button", { name: "Riprova" })).toBeNull();
    expect(s.leggiFile).not.toHaveBeenCalled();
  });

  it("l'errore di lettura ha il punto prima di «Il resto va avanti»", async () => {
    const { s } = servizi({ leggiFile: vi.fn(async () => { throw new Error("Lettura AI non riuscita: riprova tra poco"); }) });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    expect(await within(chat()).findByText(/riprova tra poco\. Il resto va avanti/)).toBeInTheDocument();
  });

  it("dopo la ricarica «Riprova» funziona subito: il saldo basso non si ricorda per 30 secondi", async () => {
    const saldoAI = vi.fn().mockResolvedValueOnce({ saldoEur: 0, bloccato: false }).mockResolvedValue({ saldoEur: 5, bloccato: false });
    const { s } = servizi({ saldoAI });
    apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/I crediti AI non bastano/);
    expect(s.leggiFile).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(fonti()).getByRole("button", { name: "Riprova" })); });
    await waitFor(() => expect(s.leggiFile).toHaveBeenCalledTimes(1));
    await within(chat()).findByText(/Da contratto\.pdf ho preso/);
  });
});

describe("Prima di aver letto non si chiede quello che il documento può dire", () => {
  it("con un documento che aspetta il via: niente «Per chi è il lavoro?», niente dati che mancano", async () => {
    const { s } = servizi();
    apri(s);
    carica(pdf("contratto.pdf"));
    await within(chat()).findByText(/Leggo contratto\.pdf\?/);
    expect(within(chat()).queryByText(/Per chi è il lavoro/)).toBeNull();
    expect(screen.queryByText(/Da decidere: .*dati che mancano/)).toBeNull();
  });
});

describe("La bozza ripresa", () => {
  it("le proposte di Silvio non diventano una «fonte» da togliere", async () => {
    const contesto = {
      oggi: "2026-11-02", dipendenti: [{ id: "e1", nome: "Mario Verdi", attivo: true }], storicoDipendenti: [{ employee_id: "e1", fase: "Ponteggio" }], impegniDipendenti: [], assenze: [],
      staff: [{ id: CAPO, nome: "Carlo Capoferri" }], capomastri: [], ditte: [], storicoDitte: [], documentiDitte: [], mezzi: [], storicoMezzi: [], impegniMezzi: [], fornitori: [], storicoAcquisti: [],
    };
    const { s, db } = servizi({ contestoRisorse: vi.fn(async () => contesto as never) });
    const { unmount } = apri(s);
    await leggi(pdf("contratto.pdf"));
    await within(chat()).findByText(/Ti propongo/);
    unmount();
    await waitFor(() => expect(db.righe.length).toBe(1));
    await waitFor(() => expect(JSON.stringify(db.righe[0].piano)).toMatch(/silvio-risorse/));
    apri(s);
    fireEvent.click(await screen.findByRole("button", { name: "Riprendi la commessa" }));
    await within(fonti()).findByText("contratto.pdf");
    expect(within(fonti()).queryByText(/Silvio: squadra/)).toBeNull();
  });
});
