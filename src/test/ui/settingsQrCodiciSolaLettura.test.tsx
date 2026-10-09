import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SettingsQrCodici from "@/pages/azienda/settings/SettingsQrCodici";

/**
 * Impostazioni → QR & Codici (10/10/2026).
 *
 * - Chi ha «Configurazione Ordini» solo in vista vedeva una pagina VUOTA (`if (!isAdmin) return null`):
 *   ora consulta tutto, non vede i comandi di scrittura e legge perché.
 * - Il titolo lo mette il layout: nella pagina nessun titolo di primo livello, i riquadri sono di secondo.
 * - Le parole sono quelle del mestiere (niente lookup, RPC, token, UUID) e gli errori sono in italiano.
 * - La finestra del QR ha le etichette collegate ai campi e non perde ciò che si è scritto senza chiedere.
 * - Su telefono ogni QR è una scheda; in «Per fornitore» non c'è più la colonna «Formato».
 */

const AZIENDA = "az-1";

const state = vi.hoisted(() => ({
  role: "staff",
  edit: false,
  view: true,
  qrs: [] as Record<string, unknown>[],
  scansioni: [] as Record<string, unknown>[],
  fornitori: [] as Record<string, unknown>[],
  articoli: [] as Record<string, unknown>[],
  righeRicerca: [] as Record<string, unknown>[],
  erroreLettura: null as unknown,
  erroreScrittura: null as unknown,
  erroreRicerca: null as unknown,
  scritture: [] as { table: string; azione: string; valore: unknown }[],
  letture: [] as { table: string; colonne: string }[],
  ricerche: [] as { nome: string; args: unknown }[],
  toastOk: vi.fn(),
  toastErr: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: state.toastOk, error: state.toastErr } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: state.role, effectiveCompany: { id: "az-1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: false,
    isLoading: false,
    canEditSettingsOrders: state.edit,
    canViewSettingsOrders: state.view,
  }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const ok = (dati: unknown) => ({ data: dati, error: null as unknown });
  const conteggio = (n: number) => ({ count: n, error: null as unknown });
  const ko = (errore: unknown) => ({ data: null as unknown, error: errore });
  const costruisci = (table: string) => {
    let testa = false;
    let scrittura = false;
    let conNot = false;
    const filtri: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["neq", "gte", "lte", "in", "is", "order", "limit"]) b[m] = () => b;
    b.eq = (colonna: string, valore: unknown) => { filtri.push(`${colonna}=${String(valore)}`); return b; };
    b.not = () => { conNot = true; return b; };
    b.select = (colonne?: string, opzioni?: { head?: boolean }) => {
      testa = Boolean(opzioni?.head);
      state.letture.push({ table, colonne: colonne ?? "" });
      return b;
    };
    b.insert = (valore: unknown) => { scrittura = true; state.scritture.push({ table, azione: "insert", valore }); return b; };
    b.update = (valore: unknown) => { scrittura = true; state.scritture.push({ table, azione: "update", valore }); return b; };
    b.then = (risolvi: (v: unknown) => unknown, rifiuta?: (e: unknown) => unknown) => {
      let risposta: unknown;
      if (scrittura) risposta = state.erroreScrittura ? ko(state.erroreScrittura) : ok(null);
      else if (table === "company_qr_codes") risposta = state.erroreLettura ? ko(state.erroreLettura) : ok(state.qrs);
      else if (table === "warehouse_stock") {
        risposta = !testa ? ok(state.articoli)
          : conteggio(conNot ? 6 : filtri.includes("tracking_mode=serialized") ? 2 : 10);
      }
      else if (table === "stock_units") risposta = conteggio(filtri.includes("status=available") ? 3 : 4);
      else if (table === "warehouse_scan_events") {
        risposta = !testa ? ok(state.scansioni) : conteggio(filtri.includes("resolution_status=matched") ? 6 : 8);
      }
      else if (table === "suppliers") risposta = ok(state.fornitori);
      else risposta = ok([]);
      return Promise.resolve(risposta).then(risolvi, rifiuta);
    };
    return b;
  };
  return {
    supabase: {
      from: costruisci,
      rpc: (nome: string, args: unknown) => {
        state.ricerche.push({ nome, args });
        return Promise.resolve(state.erroreRicerca ? ko(state.erroreRicerca) : ok(state.righeRicerca));
      },
      auth: { getUser: async () => ({ data: { user: { id: "utente-1" } } }) },
    },
  };
});

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");

const qr = (extra: Record<string, unknown> = {}) => ({
  id: "qr-1",
  company_id: AZIENDA,
  name: "QR cantiere Rossi",
  description: "Cartello di cantiere",
  qr_type: "ordine",
  destination_url: "https://esempio.it/cantiere-rossi",
  linked_entity_type: "order",
  linked_entity_id: "4f6c1f6e-4d2a-4a39-9f64-1b2f0a8f3c11",
  public_token: "abc123",
  access_level: "public",
  status: "active",
  expires_at: null as unknown,
  scan_count: 12,
  last_scanned_at: "2026-10-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
  created_by: "utente-1",
  ...extra,
});

const rigaArticolo = (extra: Record<string, unknown> = {}) => ({
  match_type: "item",
  stock_unit_id: null as unknown,
  stock_item_id: "art-1",
  item_name: "Vite 4x40",
  item_tracking_mode: "fungible",
  supplier_id: "f1",
  supplier_name: "Ferramenta Bianchi",
  ...extra,
});

let cliente: QueryClient;
let alberoCorrente: () => ReactElement;
let utils: ReturnType<typeof render>;

function apri() {
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  alberoCorrente = () => (
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={["/azienda/impostazioni/qr-codici"]}>
        <Routes>
          <Route path="/azienda" element={<p>Cruscotto</p>} />
          <Route path="/azienda/impostazioni/qr-codici" element={<SettingsQrCodici />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  utils = render(alberoCorrente());
  return utils;
}
/** Rilegge i permessi (i mock di sopra cambiano) senza smontare la pagina. */
const ricarica = () => utils.rerender(alberoCorrente());

const vaiAScheda = (nome: string) => {
  fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0, ctrlKey: false });
};
const testoVisibile = () => document.body.textContent ?? "";
const scrivi = (etichetta: string | RegExp, valore: string) => {
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } });
};

beforeAll(() => {
  // Radix misura e scorre gli elementi: jsdom non lo sa fare.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
});

beforeEach(() => {
  Object.assign(state, {
    role: "staff", edit: false, view: true,
    qrs: [qr()], scansioni: [], fornitori: [], articoli: [], righeRicerca: [],
    erroreLettura: null as unknown, erroreScrittura: null as unknown, erroreRicerca: null as unknown,
  });
  state.scritture.length = 0;
  state.letture.length = 0;
  state.ricerche.length = 0;
  state.toastOk.mockClear();
  state.toastErr.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("QR & Codici: chi può solo consultare", () => {
  it("vede i QR e perché non può cambiarli, ma non i comandi di scrittura", async () => {
    apri();
    expect(await screen.findByText("QR cantiere Rossi")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Stai consultando queste impostazioni");
    expect(screen.getByRole("note")).toHaveTextContent("«Configurazione Ordini»");
    expect(screen.queryByRole("button", { name: /^Nuovo QR/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Modifica/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Archivia/ })).toBeNull();
    // Copiare il link, scaricare il QR e aprirlo sono consultazione: restano.
    expect(screen.getByRole("button", { name: "Copia link QR cantiere Rossi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica QR QR cantiere Rossi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri QR QR cantiere Rossi" })).toBeInTheDocument();
  });

  it("senza QR e senza modifica non invita a crearne", async () => {
    state.qrs = [];
    apri();
    expect(await screen.findByText("Nessun QR trovato")).toBeInTheDocument();
    expect(screen.queryByText(/Crea un QR/)).toBeNull();
  });

  it("chi modifica li vede, senza la frase di sola lettura", async () => {
    state.edit = true;
    apri();
    expect(await screen.findByText("QR cantiere Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo QR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifica QR cantiere Rossi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivia QR cantiere Rossi" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("l'amministratore di ruolo modifica anche senza il permesso granulare", async () => {
    state.role = "company_admin";
    state.edit = false;
    state.view = false;
    apri();
    expect(await screen.findByText("QR cantiere Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo QR" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("senza nessun permesso di vista non mostra niente e rimanda al cruscotto", async () => {
    state.view = false;
    apri();
    expect(await screen.findByText("Cruscotto")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("QR cantiere Rossi")).toBeNull();
  });

  it("la prova di una scansione funziona anche in sola lettura: è una ricerca, non scrive", async () => {
    state.righeRicerca = [rigaArticolo()];
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Prova una scansione");
    scrivi("Codice (incolla o digita)", "8001234567890");
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    expect(await screen.findByText("Articolo trovato")).toBeInTheDocument();
    expect(state.ricerche).toEqual([{ nome: "warehouse_scan_lookup", args: { p_code: "8001234567890", p_supplier_id: null } }]);
    expect(state.scritture).toHaveLength(0);
  });

  it("anche la finestra già aperta rifiuta di salvare se nel frattempo il permesso di modifica è sparito", async () => {
    state.edit = true;
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "QR magazzino");
    scrivi(/^Destinazione/, "https://esempio.it/magazzino");
    state.edit = false;
    ricarica();
    fireEvent.click(await screen.findByRole("button", { name: "Crea QR" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("QR non salvato");
    expect(state.toastErr.mock.calls[0][1].description).toContain("Configurazione Ordini");
    expect(state.scritture).toHaveLength(0);
  });
});

describe("QR & Codici: chi modifica modifica come prima", () => {
  beforeEach(() => { state.edit = true; });

  it("crea un QR: scrive nome, link e un codice del link generato", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "  QR magazzino ");
    scrivi(/^Destinazione/, "esempio.it/magazzino");
    fireEvent.click(screen.getByRole("button", { name: "Crea QR" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("QR creato"));
    expect(state.scritture).toHaveLength(1);
    const { table, azione, valore } = state.scritture[0] as { table: string; azione: string; valore: Record<string, unknown> };
    expect(table).toBe("company_qr_codes");
    expect(azione).toBe("insert");
    expect(valore).toMatchObject({
      company_id: AZIENDA, name: "QR magazzino", destination_url: "https://esempio.it/magazzino",
      access_level: "public", status: "active", linked_entity_type: null, linked_entity_id: null, created_by: "utente-1",
    });
    expect(String(valore.public_token)).toHaveLength(32);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("modifica un QR: riparte dai suoi valori e scrive solo su quello", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Modifica QR cantiere Rossi" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Modifica QR");
    expect(screen.getByLabelText(/^Nome del QR/)).toHaveValue("QR cantiere Rossi");
    scrivi(/^Nome del QR/, "QR cantiere Verdi");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("QR aggiornato"));
    expect(state.scritture[0]).toMatchObject({ table: "company_qr_codes", azione: "update", valore: { name: "QR cantiere Verdi" } });
  });

  it("archivia un QR", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Archivia QR cantiere Rossi" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("QR archiviato"));
    expect(state.scritture).toEqual([{ table: "company_qr_codes", azione: "update", valore: { status: "archived" } }]);
  });

  it("un codice dell'elemento collegato che non è un codice vero non arriva al database", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "QR magazzino");
    scrivi(/^Destinazione/, "https://esempio.it/magazzino");
    scrivi("Codice dell'elemento collegato (facoltativo)", "commessa rossi");
    fireEvent.click(screen.getByRole("button", { name: "Crea QR" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][1].description).toBe(
      "Il codice dell'elemento collegato non è valido. Se non ce l'hai, lascia il campo vuoto.",
    );
    expect(state.scritture).toHaveLength(0);
  });
});

describe("QR & Codici: titoli e parole", () => {
  it("nessun titolo di primo livello in nessuna scheda: i riquadri sono di secondo livello", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    for (const scheda of ["QR con link", "Scansioni", "Per fornitore", "Prova una scansione"]) {
      vaiAScheda(scheda);
      await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0));
      expect(screen.queryAllByRole("heading", { level: 1 }), scheda).toHaveLength(0);
      expect(screen.queryAllByRole("heading", { level: 3 }), scheda).toHaveLength(0);
    }
  });

  it("nel file della pagina non c'è nessun titolo di primo livello: lo mette il layout", () => {
    expect(leggi("src/pages/azienda/settings/SettingsQrCodici.tsx")).not.toContain("<h1");
  });

  it("le linguette hanno i nomi nuovi e gli stessi valori di prima", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    const nomi = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(nomi).toEqual(["QR con link", "Scansioni", "Per fornitore", "Prova una scansione"]);
    // I valori interni (usati da chi ha un indirizzo salvato o un test) non cambiano.
    const valori = screen.getAllByRole("tab").map((t) => /trigger-(.+)$/.exec(t.id)?.[1]);
    expect(valori).toEqual(["dinamici", "panoramica", "per-fornitore", "test-scan"]);
  });

  it("in nessuna scheda e nella finestra del QR ci sono parole da sviluppatore", async () => {
    state.edit = true;
    state.scansioni = [
      { id: "s1", created_at: "2026-10-02T08:00:00Z", scanned_code: "8001234567890", scan_type: "lookup", resolution_status: "matched" },
    ];
    state.fornitori = [{ id: "f1", name: "Ferramenta Bianchi", uses_gs1: true }];
    state.righeRicerca = [rigaArticolo(), rigaArticolo({ stock_item_id: "art-2", item_name: "Vite 5x50" })];
    apri();
    await screen.findByText("QR cantiere Rossi");
    const vietate = [/lookup/i, /\bRPC\b/, /UUID/i, /token/i, /dinamic/i, /Test scan/i, /Audit/i, /Entità/i, /match/i, /barcode/i];
    const controlla = (dove: string) => {
      for (const parola of vietate) expect(testoVisibile(), `${dove}: ${parola}`).not.toMatch(parola);
    };
    controlla("QR con link");

    vaiAScheda("Scansioni");
    await screen.findByText("Ultime scansioni");
    controlla("Scansioni");

    vaiAScheda("Per fornitore");
    await screen.findByText("Ferramenta Bianchi");
    controlla("Per fornitore");

    vaiAScheda("Prova una scansione");
    scrivi("Codice (incolla o digita)", "8001234567890");
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    await screen.findByText("Più articoli possibili: l'operatore sceglie");
    controlla("Prova una scansione");

    vaiAScheda("QR con link");
    fireEvent.click(await screen.findByRole("button", { name: "Nuovo QR" }));
    await screen.findByRole("dialog");
    controlla("finestra del QR");
  });

  it("scansioni: il tipo è in italiano e l'esito si chiama «Trovato»", async () => {
    state.scansioni = [
      { id: "s1", created_at: "2026-10-02T08:00:00Z", scanned_code: "8001234567890", scan_type: "lookup", resolution_status: "matched" },
      { id: "s2", created_at: "2026-10-02T09:00:00Z", scanned_code: "111", scan_type: "carico", resolution_status: "unresolved" },
      { id: "s3", created_at: "2026-10-02T10:00:00Z", scanned_code: "222", scan_type: "Altro_Tipo", resolution_status: "rejected" },
    ];
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Scansioni");
    expect(await screen.findByText("Le ultime 50 scansioni (ricerche, carichi, scarichi).")).toBeInTheDocument();
    const righe = (await screen.findAllByRole("row")).slice(1);
    expect(righe.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent).slice(2))).toEqual([
      ["ricerca", "Trovato"],
      ["carico", "Non trovato"],
      ["altro_tipo", "Rifiutato"],
    ]);
    // Le tessere hanno parole del mestiere.
    expect(screen.getByText("Articoli con codice")).toBeInTheDocument();
    expect(screen.getByText("Scansioni 7 giorni")).toBeInTheDocument();
    expect(screen.getByText("75% trovate")).toBeInTheDocument();
    expect(screen.getByText("6 con codice a barre")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("su 4 totali · 2 articoli")).toBeInTheDocument();
  });

  it("prova una scansione: titolo, frase e risultato senza nomi di componenti", async () => {
    state.righeRicerca = [];
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Prova una scansione");
    expect(screen.getByRole("heading", { level: 2, name: "Prova una scansione" })).toBeInTheDocument();
    expect(screen.getByText("Scrivi o scansiona un codice per vedere cosa riconosce il magazzino.")).toBeInTheDocument();
    scrivi("Codice (incolla o digita)", "9990001112223");
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    expect(await screen.findByText("Codice nuovo: si propone di creare l'articolo")).toBeInTheDocument();
    expect(screen.getByText("Si apre la scheda dell'articolo con il codice già inserito.")).toBeInTheDocument();
    expect(screen.getByText("Codice letto")).toBeInTheDocument();
    expect(screen.getByText("Codice usato per la ricerca")).toBeInTheDocument();
    expect(screen.getByText("Cosa fa il magazzino")).toBeInTheDocument();
    expect(testoVisibile()).not.toMatch(/StockItemDialog/);
  });

  it("prova una scansione: pezzo, articolo e più articoli possibili", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Prova una scansione");
    const cerca = async (righe: Record<string, unknown>[], codice: string) => {
      state.righeRicerca = righe;
      scrivi("Codice (incolla o digita)", codice);
      fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    };
    await cerca([rigaArticolo({ match_type: "unit", stock_unit_id: "unita-0001-aaaa" })], "SERIALE-1");
    expect(await screen.findByText("Pezzo trovato")).toBeInTheDocument();
    expect(screen.getByText(/Il sistema procede da solo con questo pezzo:/)).toHaveTextContent("Vite 4x40");

    await cerca([rigaArticolo()], "ARTICOLO-1");
    expect(await screen.findByText("Articolo trovato")).toBeInTheDocument();

    await cerca([rigaArticolo(), rigaArticolo({ stock_item_id: "art-2", item_name: "Vite 5x50" })], "DOPPIO-1");
    expect(await screen.findByText("Più articoli possibili: l'operatore sceglie")).toBeInTheDocument();
    expect(screen.getByText("Vite 5x50")).toBeInTheDocument();
    // Il tipo di corrispondenza grezzo (item, item_ambiguous) non si mostra più.
    expect(screen.queryByText("item")).toBeNull();
    expect(screen.queryByText("item_ambiguous")).toBeNull();
  });

  it("per fornitore: «Usa GS1» c'è, la colonna «Formato» no, e il formato non si legge più", async () => {
    state.fornitori = [{ id: "f1", name: "Ferramenta Bianchi", uses_gs1: true }];
    state.articoli = [
      { id: "a1", supplier_id: "f1", barcode: "8001" },
      { id: "a2", supplier_id: "f1", barcode: null as unknown },
    ];
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Per fornitore");
    expect(await screen.findByText("Ferramenta Bianchi")).toBeInTheDocument();
    expect(screen.getByText("Quanti articoli di ogni fornitore hanno un codice a barre o QR.")).toBeInTheDocument();
    const intestazioni = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(intestazioni).toContain("Usa GS1");
    expect(intestazioni).not.toContain("Formato");
    expect(screen.getByText("50%")).toBeInTheDocument();
    const lettura = state.letture.find((l) => l.table === "suppliers");
    expect(lettura?.colonne).toBe("id, name, uses_gs1");
    expect(lettura?.colonne).not.toContain("default_qr_format");
  });

  it("per fornitore, senza fornitori, dice dove aggiungerli", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Per fornitore");
    expect(await screen.findByText(/Aggiungi i fornitori da Impostazioni → Fornitori\./)).toBeInTheDocument();
  });
});

describe("QR & Codici: la finestra del QR", () => {
  beforeEach(() => { state.edit = true; });

  it("le etichette sono collegate ai campi e la ricerca ha un nome", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    expect(screen.getByRole("textbox", { name: "Cerca tra i QR" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtra per stato" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtra per tipo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    const finestra = within(await screen.findByRole("dialog"));
    expect(finestra.getByLabelText(/^Nome del QR/).tagName).toBe("INPUT");
    expect(finestra.getByLabelText("Tipo di QR")).toHaveAttribute("role", "combobox");
    expect(finestra.getByLabelText(/^Destinazione/).tagName).toBe("INPUT");
    expect(finestra.getByLabelText("Accesso")).toHaveAttribute("role", "combobox");
    expect(finestra.getByLabelText("Stato")).toHaveAttribute("role", "combobox");
    expect(finestra.getByLabelText("Collegato a")).toHaveAttribute("role", "combobox");
    expect(finestra.getByLabelText("Codice dell'elemento collegato (facoltativo)").tagName).toBe("INPUT");
    expect(finestra.getByLabelText("Scadenza (facoltativa)")).toHaveAttribute("type", "datetime-local");
    expect(finestra.getByLabelText("Descrizione (facoltativa)").tagName).toBe("TEXTAREA");
  });

  it("dice a parole cosa fa, con il testo d'aiuto sotto il codice e un esempio di percorso che esiste", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    const finestra = within(await screen.findByRole("dialog"));
    expect(finestra.getByText("Nuovo QR con link")).toBeInTheDocument();
    expect(finestra.getByText("Scegli dove porta il QR, chi può aprirlo e fino a quando. Il link si crea da solo.")).toBeInTheDocument();
    expect(finestra.getByText("Serve solo se un tecnico ti ha dato il codice interno di una commessa o di un cliente.")).toBeInTheDocument();
    const codice = finestra.getByLabelText("Codice dell'elemento collegato (facoltativo)");
    expect(codice).toHaveAttribute("placeholder", "Lascia vuoto se non serve");
    expect(codice).toHaveAccessibleDescription("Serve solo se un tecnico ti ha dato il codice interno di una commessa o di un cliente.");
    // Il percorso interno dell'esempio è quello vero delle commesse (companyRoutes: «ordini/:id»).
    expect(finestra.getByLabelText(/^Destinazione/)).toHaveAttribute("placeholder", "https://... oppure /azienda/ordini/…");
    // Accesso e collegamento si leggono a parole.
    expect(finestra.getByLabelText("Accesso")).toHaveTextContent("Chiunque abbia il link");
    expect(finestra.getByLabelText("Collegato a")).toHaveTextContent("Niente");
  });

  // Le tendine della finestra non si aprono nei test: Radix Select dentro una finestra rimbalza il focus
  // all'infinito in jsdom con la node_modules installata da npm (vedi la nota sui test che non finiscono).
  // Qui si legge cosa mostrano chiuse, su un QR che ha già quei valori.
  it("sul QR che si modifica, tipo, accesso e collegamento si leggono a parole", async () => {
    state.qrs = [qr({ qr_type: "ticket", access_level: "private", linked_entity_type: "job" })];
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Modifica QR cantiere Rossi" }));
    const finestra = within(await screen.findByRole("dialog"));
    expect(finestra.getByLabelText("Tipo di QR")).toHaveTextContent("Richiesta di assistenza");
    expect(finestra.getByLabelText("Accesso")).toHaveTextContent("Solo chi ha fatto l'accesso");
    expect(finestra.getByLabelText("Collegato a")).toHaveTextContent("Cantiere");
  });

  it("il filtro per tipo elenca le parole del mestiere", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filtra per tipo" }), { key: "Enter" });
    const scelte = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(scelte).toEqual([
      "Tutti i tipi", "Link", "Cliente", "Contatto", "Commessa", "Cantiere", "Materiale", "Documento", "Richiesta di assistenza", "Appuntamento",
    ]);
  });

  it("chiudere senza aver cambiato niente non chiede conferma", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("chiudere dopo aver scritto chiede conferma: «Annulla» la rifiuta e la finestra resta, «Esc» la accetta", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "QR magazzino");

    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome del QR/)).toHaveValue("QR magazzino");

    // Anche Esc e il clic fuori passano dalla stessa conferma.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("modificare un QR e poi rimettere gli stessi valori non conta come modifica", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Modifica QR cantiere Rossi" }));
    scrivi(/^Nome del QR/, "Altro nome");
    scrivi(/^Nome del QR/, "QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe("QR & Codici: gli errori sono in italiano", () => {
  it("la lista che non si legge dice cosa fare e non mostra il testo del database", async () => {
    state.erroreLettura = { message: "TypeError: Failed to fetch" };
    apri();
    expect(await screen.findByText("Non riesco a leggere i QR")).toBeInTheDocument();
    expect(screen.getByText("Connessione persa. Controlla la rete e riprova.")).toBeInTheDocument();
    expect(testoVisibile()).not.toMatch(/Failed to fetch|TypeError/);
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("un permesso negato dal database si legge come permesso, non come «row-level security»", async () => {
    state.erroreLettura = { message: 'new row violates row-level security policy for table "company_qr_codes"', code: "42501" };
    apri();
    expect(await screen.findByText("Non hai i permessi per questa operazione. Contatta l'amministratore.")).toBeInTheDocument();
    expect(testoVisibile()).not.toMatch(/row-level/);
  });

  it("un salvataggio rifiutato dal database mostra la frase italiana", async () => {
    state.edit = true;
    state.erroreScrittura = { message: 'duplicate key value violates unique constraint "company_qr_codes_public_token_key"', code: "23505" };
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "QR magazzino");
    scrivi(/^Destinazione/, "https://esempio.it/magazzino");
    fireEvent.click(screen.getByRole("button", { name: "Crea QR" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("QR non salvato");
    expect(state.toastErr.mock.calls[0][1].description).toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
  });

  it("copiare il link dice «Link copiato»; se il browser non lo permette lo dice a parole", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    const scrivere = vi.fn().mockResolvedValue(undefined as unknown);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: scrivere }, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Copia link QR cantiere Rossi" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Link copiato"));
    expect(scrivere).toHaveBeenCalledWith(`${window.location.origin}/qr/abc123`);

    scrivere.mockRejectedValue(new Error("NotAllowedError"));
    fireEvent.click(screen.getByRole("button", { name: "Copia link QR cantiere Rossi" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Link non copiato");
    expect(state.toastErr.mock.calls[0][1].description).toBe("Il browser non ha permesso di copiarlo. Riprova.");
  });

  it("un'archiviazione che fallisce non mostra il testo del database", async () => {
    state.edit = true;
    state.erroreScrittura = { message: "canceling statement due to statement timeout", code: "57014" };
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Archivia QR cantiere Rossi" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("QR non archiviato");
    const descrizione: string = state.toastErr.mock.calls[0][1].description;
    expect(descrizione).toContain("Riprova");
    expect(descrizione).not.toMatch(/statement|timeout/i);
  });

  it("i controlli sul link restano in italiano", async () => {
    state.edit = true;
    apri();
    await screen.findByText("QR cantiere Rossi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo QR" }));
    scrivi(/^Nome del QR/, "QR magazzino");
    scrivi(/^Destinazione/, "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "Crea QR" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][1].description).toBe("Schema URL non consentito (solo https://, mailto:, tel:, /path interno)");
    expect(state.scritture).toHaveLength(0);
  });

  it("una ricerca che fallisce lo dice a parole", async () => {
    state.erroreRicerca = { message: "TypeError: Failed to fetch" };
    apri();
    await screen.findByText("QR cantiere Rossi");
    vaiAScheda("Prova una scansione");
    scrivi("Codice (incolla o digita)", "8001234567890");
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    expect(await screen.findByText("Ricerca non riuscita")).toBeInTheDocument();
    expect(screen.getByText("Connessione persa. Controlla la rete e riprova.")).toBeInTheDocument();
  });
});

describe("QR & Codici: telefono", () => {
  it("ogni QR è una scheda: tabella e righe cambiano forma da «md» in su e le azioni stanno nella scheda", async () => {
    apri();
    await screen.findByText("QR cantiere Rossi");
    const tabella = utils.container.querySelector("table")!;
    expect(tabella).toHaveClass("block", "md:table");
    expect(tabella.querySelector("thead")).toHaveClass("hidden", "md:table-header-group");
    expect(tabella.querySelector("tbody")).toHaveClass("block", "md:table-row-group");
    const riga = tabella.querySelector("tbody tr")!;
    expect(riga).toHaveClass("flex", "flex-wrap", "md:table-row");
    // Nome e link in piccolo, i badge, le scansioni e i pulsanti sono tutti dentro la stessa scheda.
    const scheda = within(riga as HTMLElement);
    expect(scheda.getByText("QR cantiere Rossi")).toBeInTheDocument();
    expect(scheda.getByText("https://esempio.it/cantiere-rossi")).toBeInTheDocument();
    expect(scheda.getByText("Commessa")).toBeInTheDocument();
    expect(scheda.getByText("Chiunque")).toBeInTheDocument();
    expect(scheda.getByText("Attivo")).toBeInTheDocument();
    expect(scheda.getByText("12")).toHaveTextContent("12 scansioni");
    expect(scheda.getByRole("button", { name: "Copia link QR cantiere Rossi" })).toBeInTheDocument();
    // L'ultima scansione resta solo nella tabella larga.
    const celle = riga.querySelectorAll("td");
    expect(celle[5]).toHaveClass("hidden", "md:table-cell");
  });

  it("i badge dicono chi può aprire il QR", async () => {
    state.qrs = [qr(), qr({ id: "qr-2", name: "QR riservato", access_level: "private", qr_type: "ticket" })];
    apri();
    await screen.findByText("QR riservato");
    expect(screen.getByText("Solo con accesso")).toBeInTheDocument();
    expect(screen.getByText("Richiesta di assistenza")).toBeInTheDocument();
  });
});
