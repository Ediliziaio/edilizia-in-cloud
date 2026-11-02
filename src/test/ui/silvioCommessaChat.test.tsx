/**
 * Il popup «Crea con Silvio», fase 3, con servizi finti e provider AI finto:
 * - la chat: «sposta tutto di una settimana e togli la ditta» cambia la bozza in una
 *   risposta, la modifica resta segnata a destra, e Cmd+Z o «annulla» la toglie tutta;
 * - i crediti si guardano prima: senza crediti la chat non parte;
 * - in «Completa» i valori chiusi si rifiutano;
 * - la ⓘ apre il documento alla pagina citata (pdf.js finto);
 * - le porte: allegati di un'email, contratto dell'app, link della chat.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";
import { frammentiPerCompletare } from "@/lib/silvio-commessa/lettori/commessa";

const pdfjs = vi.hoisted(() => ({ pagineChieste: [] as number[] }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 9,
      destroy: () => {},
      getPage: async (n: number) => {
        pdfjs.pagineChieste.push(n);
        return {
          getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale, transform: [scale, 0, 0, -scale, 0, 842 * scale] }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: async () => ({
            items: n === 4
              ? [{ str: "Art. 5 — Corrispettivo", transform: [10, 0, 0, 10, 50, 700], width: 120, height: 10 },
                { str: "L'appaltatore riceve il corrispettivo di € 48.500,00", transform: [10, 0, 0, 10, 50, 680], width: 260, height: 10 }]
              : [{ str: "Altro", transform: [10, 0, 0, 10, 50, 700], width: 30, height: 10 }],
          }),
        };
      },
    }),
  }),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrderAmounts: true, canViewMargins: true, canViewCosts: true }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const PREVENTIVO = "q0000000-0000-4000-a000-000000000142";
const COMMESSA = "0a000000-0000-4000-a000-000000000034";

const dalPreventivo: Frammento = {
  fonte: { tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" },
  aree: {
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 47900, fiducia: 1, stato: "fatto" } },
    fasi: {
      "fasi.order_work_phases": {
        valore: [{ name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11" }, { name: "Impianti", start_date: "2026-11-12", end_date: "2026-11-18" }],
        fiducia: 1, stato: "fatto",
      },
      "fasi.work_start_date": { valore: "2026-11-09", fiducia: 1, stato: "fatto" },
    },
    ditte: { "ditte.assegnate": { valore: [{ name: "Idraulica Bianchi" }], fiducia: 0.9, stato: "proposta" } },
  },
};

const CITAZIONE = "corrispettivo di € 48.500,00";
const contrattoPdf = new File(["%PDF-1.7"], "Contratto.pdf", { type: "application/pdf" });
const dalContratto: Frammento = {
  fonte: { tipo: "contratto", id: `${AZIENDA}/${UTENTE}/commessa-1-Contratto.pdf`, etichetta: "Contratto.pdf" },
  aree: {
    economia: {
      "economia.total_amount": {
        valore: 48500, fiducia: 0.95, stato: "fatto",
        fonte: { tipo: "contratto", id: `${AZIENDA}/${UTENTE}/commessa-1-Contratto.pdf`, etichetta: "Contratto.pdf", dove: "pagina 4", citazione: CITAZIONE },
      },
    },
  },
  costoEur: 0.012,
};

function dbFinto() {
  const rpc = vi.fn(async () => ({ data: 0, error: null }));
  const query = () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "insert", "update", "eq", "neq", "gt", "order", "limit"]) q[k] = () => q;
    const riga = async () => ({ data: { id: "b1", stato: "bozza", fonti: [] as unknown[], piano: {}, storia: [] as unknown[] }, error: null as unknown });
    q.single = riga;
    q.maybeSingle = riga;
    return q;
  };
  return { rpc, from: () => query(), storage: { from: () => ({}) } };
}

function servizi(over: Partial<ServiziSilvioCommessa> = {}): ServiziSilvioCommessa {
  return {
    elencaPreventivi: vi.fn(async () => []),
    elencaComputi: vi.fn(async () => []),
    frammentiPreventivo: vi.fn(async () => [dalPreventivo]),
    frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" },
      frammenti: [dalContratto], idFonte: dalContratto.fonte.id!,
    })),
    leggiTesto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo" }, frammenti: [],
    })),
    leggiRemoto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" }, frammenti: [dalContratto],
    })),
    registraCorrezioni: vi.fn(async () => {}),
    frammentiCommessa: vi.fn(async () => []),
    elencaAllegati: vi.fn(async () => []),
    scaricaAllegato: vi.fn(async () => new File([], "vuoto")),
    frammentoContratto: vi.fn(async () => dalContratto),
    scaricaCaricato: vi.fn(async () => contrattoPdf),
    apriDocumento: vi.fn(async () => "https://finto/firmato"),
    chat: vi.fn(async () => ({ testo: "", strumenti: [], costoEur: 0 })),
    saldoAI: vi.fn(async () => ({ saldoEur: 5, bloccato: false })),
    trascrivi: vi.fn(async () => "sposta tutto di una settimana"),
    // Fase 4: senza dati dell'azienda non si propone niente.
    contestoRisorse: vi.fn(async () => { throw new Error("non in questo test"); }),
    richiesteOfferta: vi.fn(async () => []),
    leggiOfferta: vi.fn(async () => ({ offerta: {}, quantita: {} })),
    db: dbFinto() as unknown as ClientBozze,
    ...over,
  };
}

function apri(s: ServiziSilvioCommessa, props: Partial<Parameters<typeof CreaConSilvioDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s}
          iniziale={{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const commessa = () => screen.getByRole("tabpanel", { name: "La commessa" });
const chat = () => screen.getByRole("log", { name: "Messaggi con Silvio" });
const riga = (chiave: string) => document.querySelector<HTMLElement>(`[data-chiave="${chiave}"]`);
const scrivi = (testo: string) => {
  const campo = screen.getByLabelText("Scrivi a Silvio");
  fireEvent.change(campo, { target: { value: testo } });
  fireEvent.keyDown(campo, { key: "Enter" });
};

describe("La chat sulla bozza", () => {
  it("«sposta tutto di una settimana e togli la ditta» cambia la bozza in una risposta; Cmd+Z la toglie tutta", async () => {
    const s = servizi({
      chat: vi.fn(async () => ({
        testo: "", costoEur: 0.002,
        strumenti: [{ nome: "sposta_date" as const, argomenti: { settimane: 1 } }, { nome: "togli" as const, argomenti: { chiave: "ditte.assegnate" } }],
      })),
    });
    apri(s);
    await within(commessa()).findByRole("region", { name: "Ditte e subappalti" });
    expect(riga("fasi.work_start_date")!.textContent).toMatch(/9 nov/);

    scrivi("sposta tutto di una settimana e togli la ditta");
    expect(await within(chat()).findByText("Ho spostato le date avanti di 5 giorni lavorativi (1 settimana). Ho tolto «Ditte».")).toBeInTheDocument();
    expect(within(chat()).getByText("sposta tutto di una settimana e togli la ditta")).toBeInTheDocument();

    const richiesta = vi.mocked(s.chat).mock.calls[0][0];
    expect(richiesta).toMatchObject({ companyId: AZIENDA, messaggio: "sposta tutto di una settimana e togli la ditta" });
    expect(richiesta.contesto.variabili.some((v) => v.chiave === "ditte.assegnate")).toBe(true);
    expect(s.saldoAI).toHaveBeenCalledWith(AZIENDA);

    // A destra subito, e segnato finché non lo guardi.
    expect(riga("fasi.work_start_date")!.textContent).toMatch(/16 nov/);
    expect(riga("fasi.work_start_date")!.textContent).toMatch(/cambiato in chat/);
    expect(within(commessa()).queryByRole("region", { name: "Ditte e subappalti" })).not.toBeInTheDocument();
    fireEvent.click(riga("fasi.work_start_date")!);
    expect(riga("fasi.work_start_date")!.textContent).not.toMatch(/cambiato in chat/);
    // Il costo della chat entra nella barra.
    expect(screen.getByText(/costo AI 0,002 €/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "z", metaKey: true });
    expect(riga("fasi.work_start_date")!.textContent).toMatch(/9 nov/);
    expect(within(commessa()).getByRole("region", { name: "Ditte e subappalti" })).toBeInTheDocument();
  });

  it("«annulla» in chat si fa senza AI e senza costo", async () => {
    const s = servizi({
      chat: vi.fn(async () => ({ testo: "", costoEur: 0, strumenti: [{ nome: "cambia_valore" as const, argomenti: { chiave: "economia.vat_rate", valore: 10 } }] })),
    });
    apri(s);
    await within(commessa()).findByRole("region", { name: "Economia" });
    scrivi("IVA al 10");
    await within(chat()).findByText("Ti propongo 10 % per «IVA»: entra nella commessa se lo confermi nella bozza.");
    expect(riga("economia.vat_rate")).not.toBeNull();

    scrivi("annulla");
    expect(await within(chat()).findByText(/ho rimesso com'era/)).toBeInTheDocument();
    expect(s.chat).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(riga("economia.vat_rate")?.textContent ?? "").not.toMatch(/10 %/));
  });

  it("senza crediti la chat non parte, e lo dice", async () => {
    const s = servizi({ saldoAI: vi.fn(async () => ({ saldoEur: 0, bloccato: false })) });
    apri(s);
    await within(commessa()).findByRole("region", { name: "Economia" });
    scrivi("togli la ditta");
    expect(await within(chat()).findByText(/I crediti AI non bastano/)).toBeInTheDocument();
    expect(s.chat).not.toHaveBeenCalled();
    // Il messaggio resta nel campo, da rimandare.
    expect(screen.getByLabelText("Scrivi a Silvio")).toHaveValue("togli la ditta");
  });

  it("in «Completa» i valori che la commessa ha già si rifiutano, il resto si scrive", async () => {
    const s = servizi({
      frammentiCommessa: vi.fn(async () => frammentiPerCompletare({ order: { id: COMMESSA, order_code: "ORD-2026-034", total_amount: 30000, description: "Lavori" } })),
      chat: vi.fn(async () => ({
        testo: "", costoEur: 0,
        strumenti: [
          { nome: "cambia_valore" as const, argomenti: { chiave: "economia.total_amount", valore: 32000 } },
          { nome: "cambia_valore" as const, argomenti: { chiave: "economia.vat_rate", valore: 10 } },
        ],
      })),
    });
    apri(s, { orderId: COMMESSA, etichettaCommessa: "ORD-2026-034", iniziale: null });
    await within(chat()).findByText(/ci sono già/);
    scrivi("importo 32.000 e IVA al 10");
    expect(await within(chat()).findByText(/«Importo» è già nella commessa: Silvio non lo cambia\..*Ti propongo 10 % per «IVA»/)).toBeInTheDocument();
    expect(riga("economia.total_amount")!.textContent).toMatch(/30\.000/);
    expect(riga("economia.vat_rate")!.textContent).toMatch(/10/);
  });
});

describe("La ⓘ apre il documento", () => {
  it("alla pagina citata, col testo evidenziato", async () => {
    pdfjs.pagineChieste = [];
    const s = servizi({ frammentiPreventivo: vi.fn(async () => []) });
    apri(s, { iniziale: { tipo: "file", file: contrattoPdf } });
    fireEvent.click(await screen.findByRole("button", { name: "Leggi il documento" }));
    const economia = await within(commessa()).findByRole("region", { name: "Economia" });
    await within(economia).findByText(/48\.500/);
    fireEvent.click(within(economia).getByRole("button", { name: "Da dove viene «Importo»" }));
    fireEvent.click(within(economia).getByRole("button", { name: "Apri il documento a pagina 4" }));

    const visore = await screen.findByRole("dialog", { name: "Contratto.pdf" });
    expect(await within(visore).findByText("Pagina 4 di 9")).toBeInTheDocument();
    expect(within(visore).getByText(`«${CITAZIONE}»`)).toBeInTheDocument();
    expect(visore.querySelector("[data-pagina]")!.getAttribute("data-pagina")).toBe("4");
    await waitFor(() => expect(visore.querySelectorAll("span.bg-amber-300\\/45").length).toBe(1));
    expect(pdfjs.pagineChieste).toEqual([4]);
    expect(within(visore).queryByText(/non si trova uguale/)).not.toBeInTheDocument();

    fireEvent.click(within(visore).getByRole("button", { name: /Dopo/ }));
    expect(await within(visore).findByText("Pagina 5 di 9")).toBeInTheDocument();
  });
});

describe("Le porte del popup", () => {
  it("gli allegati di un'email: letti dove stanno, già confermati dal pulsante con la stima", async () => {
    const s = servizi();
    const documento = { tipo: "allegato_email" as const, email_id: "0c000000-0000-4000-a000-000000000001", indice: 0 };
    apri(s, { iniziale: [{ tipo: "documento", documento, nome: "Contratto.pdf", mime: "application/pdf", confermata: true }] });
    await waitFor(() => expect(s.leggiRemoto).toHaveBeenCalledWith(documento, { nome: "Contratto.pdf", mime: "application/pdf" }, expect.objectContaining({ companyId: AZIENDA })));
    expect(s.leggiFile).not.toHaveBeenCalled();
    expect(await within(commessa()).findByText(/48\.500/)).toBeInTheDocument();
  });

  it("un contratto dell'app: a regole, senza costo, e in «Completa» si aggiunge alla commessa", async () => {
    const s = servizi({ frammentiCommessa: vi.fn(async () => frammentiPerCompletare({ order: { id: COMMESSA, order_code: "ORD-2026-034" } })) });
    apri(s, { orderId: COMMESSA, iniziale: [{ tipo: "contratto", id: "c0000000-0000-4000-a000-000000000007" }] });
    await waitFor(() => expect(s.frammentoContratto).toHaveBeenCalledWith("c0000000-0000-4000-a000-000000000007"));
    expect(s.frammentiCommessa).toHaveBeenCalledWith(COMMESSA);
    expect(s.saldoAI).not.toHaveBeenCalled();
    expect(await within(commessa()).findByText(/48\.500/)).toBeInTheDocument();
  });

  it("il link della chat (un file già caricato): la stima prima, poi letto da dove sta, senza ricaricarlo", async () => {
    const s = servizi({ frammentiPreventivo: vi.fn(async () => []) });
    const path = `${AZIENDA}/${UTENTE}/1-Contratto.pdf`;
    apri(s, { iniziale: [{ tipo: "caricato", path, nome: "Contratto.pdf", mime: "application/pdf" }] });
    const conferma = await screen.findByRole("group", { name: "Letture da confermare" });
    expect(s.leggiFile).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(conferma).getByRole("button", { name: "Leggi il documento" })); });
    await waitFor(() => expect(s.leggiFile).toHaveBeenCalledWith(contrattoPdf, expect.objectContaining({ origine: { percorso: path } })));
    expect(s.scaricaCaricato).toHaveBeenCalledWith(path, "Contratto.pdf", "application/pdf");
  });
});

describe("Difetti trovati in revisione (01/11/2026)", () => {
  it("due invii di fila mentre si controllano i crediti fanno partire la chat una volta sola", async () => {
    let paga!: (v: { saldoEur: number; bloccato: boolean }) => void;
    const s = servizi({
      saldoAI: vi.fn(() => new Promise<{ saldoEur: number; bloccato: boolean }>((r) => { paga = r; })),
      chat: vi.fn(async () => ({ testo: "", costoEur: 0, strumenti: [{ nome: "cambia_valore" as const, argomenti: { chiave: "economia.vat_rate", valore: 10 } }] })),
    });
    apri(s);
    await within(commessa()).findByRole("region", { name: "Economia" });
    scrivi("IVA al 10");
    scrivi("IVA al 10");
    // Il messaggio si vede subito, con Silvio al lavoro.
    expect(within(chat()).getByText("IVA al 10")).toBeInTheDocument();
    expect(screen.getByText(/Silvio sta cambiando la bozza/)).toBeInTheDocument();
    await act(async () => { paga({ saldoEur: 5, bloccato: false }); });
    await within(chat()).findByText("Ti propongo 10 % per «IVA»: entra nella commessa se lo confermi nella bozza.");
    expect(s.chat).toHaveBeenCalledTimes(1);
  });

  it("chiudere mentre Silvio legge chiede conferma; «Aspetta» lascia il popup aperto", async () => {
    const chiudi = vi.fn();
    const s = servizi({ frammentiPreventivo: vi.fn(() => new Promise<Frammento[]>(() => {})) });
    apri(s, { onOpenChange: chiudi });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(await screen.findByText("Silvio sta ancora leggendo")).toBeInTheDocument();
    expect(chiudi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aspetta" }));
    expect(chiudi).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getAllByRole("dialog")[0], { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Chiudi lo stesso" }));
    expect(chiudi).toHaveBeenCalledWith(false);
  });
});

