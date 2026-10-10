/**
 * Fatturazione → «Con Edilizia in Cloud»: la pagina dei dati fiscali.
 *
 * Il «Salva» manda solo colonne che esistono (con un database che rifiuta quelle sconosciute) e dice in italiano com'è
 * andata; senza la scheda dell'azienda la pagina parte dal Profilo aziendale e la crea al primo «Salva», o dice cosa
 * manca; i valori provvisori della prima fattura sono campi da completare; ogni campo e ogni interruttore ha qualcuno
 * che lo legge.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImpostazioniFatturazione from "@/pages/azienda/fatturazione/ImpostazioniFatturazione";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";

/** Le colonne di anagrafica_azienda: un database che rifiuta le altre le segnala con un errore. */
const COLONNE = new Set("id company_id ragione_sociale partita_iva codice_fiscale forma_giuridica indirizzo_via indirizzo_numero_civico indirizzo_cap indirizzo_comune indirizzo_provincia indirizzo_nazione codice_sdi pec codice_rea capitale_sociale numero_iscr_registro_imprese regime_fiscale iban_principale bic_swift intestatario_conto nome_banca logo_url colore_primario font_fattura telefono email sito_web ultimo_numero_fattura ultimo_numero_nc ultimo_numero_ddt ultimo_numero_preventivo prefisso_fattura prefisso_nc prefisso_ddt prefisso_preventivo anno_corrente reset_numeratore_annuale note_fattura_default condizioni_pagamento_default sdi_provider sdi_api_key sdi_configurato created_at updated_at ultimo_numero_proforma sdi_progressivo_anno sdi_progressivo_invio sdi_firma_provider sdi_firma_api_key sdi_firma_username split_payment_pa socio_unico anno_corrente_proforma prefisso_proforma anno_corrente_preventivo durc_expiry_date anno_corrente_fattura bollo_virtuale_auto iva_per_cassa rivalsa_inps ritenuta_acconto_default ritenuta_aliquota_default ritenuta_causale_default ritenuta_tipo_default cassa_previdenziale_default cassa_tipo_default cassa_aliquota_default metodo_pagamento_default termini_pagamento_default testo_intro_default testo_conclusivo_default tipo_documento_default rea_ufficio stato_liquidazione conservazione_ade_aderito_il formato_numero nc_serie_condivisa".split(" "));

/**
 * Le colonne che qualcuno legge: XML FatturaPA, PDF, numerazione, editor delle fatture, invio allo SDI. Un campo
 * della pagina che non è qui non ha effetto.
 */
const CON_LETTORE = new Set("ragione_sociale partita_iva codice_fiscale forma_giuridica pec email telefono sito_web indirizzo_via indirizzo_numero_civico indirizzo_cap indirizzo_comune indirizzo_provincia indirizzo_nazione regime_fiscale rea_ufficio codice_rea capitale_sociale stato_liquidazione durc_expiry_date logo_url colore_primario metodo_pagamento_default iban_principale bic_swift nome_banca intestatario_conto prefisso_fattura ultimo_numero_fattura prefisso_nc ultimo_numero_nc prefisso_ddt ultimo_numero_ddt formato_numero nc_serie_condivisa iva_per_cassa split_payment_pa socio_unico bollo_virtuale_auto conservazione_ade_aderito_il".split(" "));

const stato = vi.hoisted(() => ({
  riga: null as Record<string, unknown> | null,
  profilo: {} as Record<string, unknown>,
  letturaFallita: false,
  esito: "ok" as "ok" | "zero" | "partita-iva" | "database",
  aggiornamenti: [] as Record<string, unknown>[],
  inserimenti: [] as Record<string, unknown>[],
  messaggi: [] as { tipo: string; titolo: string; descrizione: string }[],
  upload: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (titolo: string) => stato.messaggi.push({ tipo: "ok", titolo, descrizione: "" }),
    error: (titolo: string, o?: { description?: string }) => stato.messaggi.push({ tipo: "errore", titolo, descrizione: o?.description ?? "" }),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({
  useAnagraficaAzienda: () => ({ isLoading: false, isError: stato.letturaFallita, data: stato.riga }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: stato.profilo }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => {
  const vuoto = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null as unknown, error: null as unknown }),
        not: async () => ({ count: 0, error: null as unknown }),
      }),
    }),
  });
  const colonnaStrana = (payload: Record<string, unknown>) => Object.keys(payload).find((k) => !COLONNE.has(k));
  const rifiuto = (strana: string) => ({ message: `Could not find the '${strana}' column of 'anagrafica_azienda' in the schema cache`, code: "PGRST204" });
  return {
    supabase: {
      from: (tabella: string) =>
        tabella === "anagrafica_azienda"
          ? {
              update: (payload: Record<string, unknown>) => ({
                eq: () => ({
                  select: async () => {
                    stato.aggiornamenti.push(payload);
                    const strana = colonnaStrana(payload);
                    if (strana) return { data: null as unknown, error: rifiuto(strana) as unknown };
                    if (stato.esito === "zero") return { data: [] as unknown[], error: null as unknown };
                    if (stato.esito === "partita-iva") {
                      return { data: null as unknown, error: { code: "23514", message: 'Partita IVA non valida: "01234567890". Devono essere 11 cifre e l\'ultima è di controllo: ricontrolla il numero.' } as unknown };
                    }
                    if (stato.esito === "database") return { data: null as unknown, error: { code: "XX000", message: "FetchError: Failed to fetch" } as unknown };
                    return { data: [{ id: "ana-1" }] as unknown[], error: null as unknown };
                  },
                }),
              }),
              insert: async (payload: Record<string, unknown>) => {
                stato.inserimenti.push(payload);
                const strana = colonnaStrana(payload);
                return { error: (strana ? rifiuto(strana) : null) as unknown };
              },
            }
          : vuoto(),
      functions: { invoke: async () => ({ data: null as unknown, error: null as unknown }) },
      storage: { from: () => ({ upload: stato.upload, getPublicUrl: () => ({ data: { publicUrl: "https://esempio.it/logo.png" } }) }) },
    },
  };
});

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

const RIGA_COMPLETA = {
  id: "ana-1",
  company_id: "azienda-1",
  ragione_sociale: "Rossi Costruzioni S.r.l.",
  partita_iva: "01234567897",
  codice_fiscale: "01234567897",
  forma_giuridica: "SRL",
  indirizzo_via: "Via Roma 1",
  indirizzo_cap: "00100",
  indirizzo_comune: "Roma",
  indirizzo_provincia: "RM",
  indirizzo_nazione: "IT",
  pec: "rossi@pec.it",
  iban_principale: "IT60X0542811101000000123456",
  prefisso_fattura: "FT",
  ultimo_numero_fattura: 41,
};
const PROFILO_COMPLETO = {
  id: "azienda-1",
  name: "Rossi",
  business_name: "Rossi Costruzioni S.r.l.",
  vat_number: "01234567897",
  fiscal_code: "01234567897",
  legal_address: "Via Roma 1",
  legal_city: "Roma",
  legal_province: "rm",
  legal_postal_code: "00100",
  pec: "rossi@pec.it",
  email: "info@rossi.it",
  phone: "+39 06 1234567",
  website: "https://www.rossi.it",
};

beforeEach(() => {
  stato.riga = { ...RIGA_COMPLETA };
  stato.profilo = { ...PROFILO_COMPLETO };
  stato.letturaFallita = false;
  stato.esito = "ok";
  stato.aggiornamenti = [];
  stato.inserimenti = [];
  stato.messaggi = [];
  stato.upload.mockReset();
});
afterEach(cleanup);

function vai(percorso = "/azienda/impostazioni/fatturazione?tab=nativa") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <ImpostazioniFatturazione />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const salva = () => fireEvent.click(screen.getAllByRole("button", { name: /Salva modifiche|Crea la scheda e salva/ })[0]);
const apriScheda = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });

describe("il «Salva» manda solo colonne che esistono", () => {
  it("cambiare l'IBAN e un interruttore: una modifica sola, tutte colonne vere, «Impostazioni salvate»", async () => {
    vai("/x?sezione=avanzate");
    fireEvent.click(screen.getByRole("switch", { name: "IVA per cassa" }));
    apriScheda("Conto e pagamenti");
    fireEvent.change(await screen.findByLabelText("IBAN"), { target: { value: "IT60 X054 2811 1010 0000 0123 456" } });
    salva();
    await waitFor(() => expect(stato.messaggi.map((m) => m.titolo)).toContain("Impostazioni salvate"));
    expect(stato.aggiornamenti).toHaveLength(1);
    expect(Object.keys(stato.aggiornamenti[0]).filter((k) => !COLONNE.has(k))).toEqual([]);
    expect(stato.aggiornamenti[0]).toMatchObject({ iva_per_cassa: true, iban_principale: "IT60X0542811101000000123456" });
    expect(stato.messaggi.filter((m) => m.tipo === "errore")).toEqual([]);
  });

  it("la scheda IVA e bollo ha i quattro interruttori che le fatture leggono, senza «Moduli attivi»", () => {
    vai("/x?sezione=avanzate");
    expect(screen.queryByText("Moduli Attivi")).toBeNull();
    for (const nome of ["Fatture Estere", "Cassetto SDI", "Scadenzario", "Proforma", "Note di Credito", "DDT", "Preventivi con pipeline"]) {
      expect(screen.queryByText(nome), nome).toBeNull();
    }
    // restano i quattro interruttori che comandano le fatture: IVA per cassa, split payment, socio unico, bollo
    expect(screen.getAllByRole("switch")).toHaveLength(4);
  });

  it("ogni campo che la pagina scrive è una colonna vera e ha qualcuno che la legge", () => {
    const sorgente = readFileSync(resolve(__dirname, "../../pages/azienda/fatturazione/ImpostazioniFatturazione.tsx"), "utf8");
    const scritte = new Set([
      ...[...sorgente.matchAll(/updateField\("([a-z_]+)"/g)].map((m) => m[1]),
      // la numerazione sceglie il campo dalla riga: prefix: "…", numero: "…"
      ...[...sorgente.matchAll(/(?:prefix|numero): "([a-z_]+)"/g)].map((m) => m[1]),
    ]);
    expect(scritte.size).toBeGreaterThan(25);
    expect([...scritte].filter((c) => !COLONNE.has(c)), "colonne che non esistono").toEqual([]);
    expect([...scritte].filter((c) => !CON_LETTORE.has(c)), "campi che nessuno legge").toEqual([]);
  });

  it("un errore del database si legge in italiano: la partita IVA sbagliata dice cosa non va", async () => {
    stato.esito = "partita-iva";
    vai();
    fireEvent.change(screen.getByLabelText("Partita IVA"), { target: { value: "01234567890" } });
    salva();
    await waitFor(() => expect(stato.messaggi.some((m) => m.tipo === "errore")).toBe(true));
    const errore = stato.messaggi.find((m) => m.tipo === "errore")!;
    expect(errore.titolo).toBe("Salvataggio non riuscito");
    expect(errore.descrizione).toMatch(/^Partita IVA non valida/);
  });

  it("un errore tecnico non arriva grezzo: «Failed to fetch» diventa «Connessione persa»", async () => {
    stato.esito = "database";
    vai();
    fireEvent.change(screen.getByLabelText("Sito Web"), { target: { value: "https://nuovo.it" } });
    salva();
    await waitFor(() => expect(stato.messaggi.some((m) => m.tipo === "errore")).toBe(true));
    const errore = stato.messaggi.find((m) => m.tipo === "errore")!;
    expect(errore.descrizione).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(errore.descrizione).not.toMatch(/fetch/i);
  });

  it("se il database non aggiorna nessuna riga non dice «salvato»", async () => {
    stato.esito = "zero";
    vai();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "+39 02 1234567" } });
    salva();
    await waitFor(() => expect(stato.messaggi.some((m) => m.tipo === "errore")).toBe(true));
    expect(stato.messaggi.map((m) => m.titolo)).toEqual(["Non ho salvato niente"]);
    expect(stato.messaggi.some((m) => m.tipo === "ok")).toBe(false);
  });
});

describe("la pagina ha solo impostazioni che le fatture leggono", () => {
  it("scheda Dati fiscali: via ritenuta d'acconto e cassa previdenziale; il DURC non promette avvisi", () => {
    vai("/x?sezione=fiscale");
    expect(screen.queryByText("Ritenuta d'Acconto")).toBeNull();
    expect(screen.queryByText("Cassa Previdenziale")).toBeNull();
    expect(screen.getByLabelText("Regime Fiscale")).toBeInTheDocument();
    expect(screen.getByText("Registro imprese")).toBeInTheDocument();
    expect(screen.getByText("Segna la data di scadenza.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/notifica automaticamente|alert automatici/);
  });

  it("scheda Fattura elettronica: via «Tipologia documento predefinita»", () => {
    vai("/x?sezione=elettronica");
    expect(screen.queryByText(/Tipologia Documento/)).toBeNull();
    expect(screen.getByText("Invio delle fatture allo SDI")).toBeInTheDocument();
  });

  it("scheda Aspetto: via il font e i testi predefiniti; il colore e l'anteprima restano", () => {
    vai("/x?sezione=pdf");
    expect(screen.queryByText("Font")).toBeNull();
    expect(screen.queryByText("Testi Predefiniti")).toBeNull();
    expect(screen.getByText("Colore delle fatture")).toBeInTheDocument();
    expect(screen.getByText("Anteprima")).toBeInTheDocument();
  });

  it("scheda Conto e pagamenti: un solo conto, senza «Nuovo conto» né termini di pagamento", () => {
    vai("/x?sezione=pagamenti");
    expect(screen.queryByRole("button", { name: /Nuovo conto/ })).toBeNull();
    expect(screen.queryByText(/Termini di pagamento/)).toBeNull();
    expect(screen.getByText("Conto corrente")).toBeInTheDocument();
    expect(screen.getByLabelText("IBAN")).toHaveValue("IT60X0542811101000000123456");
  });

  it("la scheda Numerazione non ha «Aliquote IVA» né «Reset numeratore annuale»", () => {
    vai("/x?sezione=numeratori");
    expect(screen.queryByRole("tab", { name: /Aliquote/ })).toBeNull();
    expect(screen.queryByText(/Nuova aliquota/)).toBeNull();
    expect(screen.queryByText("Reset numeratore annuale")).toBeNull();
    expect(screen.getByText("Fattura")).toBeInTheDocument();
  });

  it("scheda IVA e bollo: via «Rivalsa INPS 4%»", () => {
    vai("/x?sezione=avanzate");
    expect(screen.queryByText(/Rivalsa INPS/)).toBeNull();
    expect(screen.getByText("Bollo da 2 € automatico")).toBeInTheDocument();
  });

  it("le schede hanno nomi da ufficio e sono otto", () => {
    vai();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Azienda", "Dati fiscali", "Fattura elettronica", "Aspetto", "Conto e pagamenti", "Numerazione", "IVA e bollo", "Per il commercialista",
    ]);
  });
});

describe("senza la scheda dell'azienda", () => {
  beforeEach(() => { stato.riga = null; });

  it("lo dice, e parte dai dati del Profilo aziendale", () => {
    vai();
    expect(screen.getByText("La scheda dell'azienda non è ancora stata creata")).toBeInTheDocument();
    expect(screen.getByLabelText("Partita IVA")).toHaveValue("01234567897");
    expect(screen.getByLabelText("Ragione Sociale / Denominazione")).toHaveValue("Rossi Costruzioni S.r.l.");
    expect(screen.getByRole("button", { name: "Crea la scheda e salva" })).toBeEnabled();
  });

  it("al primo «Salva» la crea con i dati del profilo e quelli scelti, e lo dice", async () => {
    vai();
    fireEvent.pointerDown(screen.getByRole("combobox", { name: /Forma Giuridica/ }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: "SRL" }));
    salva();
    await waitFor(() => expect(stato.inserimenti).toHaveLength(1));
    expect(stato.inserimenti[0]).toMatchObject({
      company_id: "azienda-1",
      ragione_sociale: "Rossi Costruzioni S.r.l.",
      partita_iva: "01234567897",
      codice_fiscale: "01234567897",
      forma_giuridica: "SRL",
      indirizzo_via: "Via Roma 1",
      indirizzo_cap: "00100",
      indirizzo_comune: "Roma",
      indirizzo_provincia: "RM",
    });
    await waitFor(() => expect(stato.messaggi.map((m) => m.titolo)).toContain("Scheda dell'azienda creata e salvata"));
    // nessun segnaposto, e solo colonne che esistono
    expect(Object.values(stato.inserimenti[0]).some((v) => v === "Da configurare" || v === "00000000000")).toBe(false);
    expect(Object.keys(stato.inserimenti[0]).filter((k) => !COLONNE.has(k))).toEqual([]);
    expect(stato.aggiornamenti).toEqual([]);
  });

  it("se manca qualcosa che il database vuole, dice cosa e non crea niente", async () => {
    stato.profilo = { ...PROFILO_COMPLETO, legal_postal_code: null, legal_city: "" };
    vai();
    salva(); // manca anche la forma giuridica: la scheda non la sceglie da sola
    await waitFor(() => expect(stato.messaggi.some((m) => m.tipo === "errore")).toBe(true));
    const errore = stato.messaggi.find((m) => m.tipo === "errore")!;
    expect(errore.titolo).toBe("La scheda dell'azienda non si può ancora creare");
    expect(errore.descrizione).toContain("forma giuridica");
    expect(errore.descrizione).toContain("CAP (5 cifre)");
    expect(errore.descrizione).toContain("comune");
    expect(stato.inserimenti).toEqual([]);
    expect(stato.messaggi.some((m) => m.tipo === "ok")).toBe(false);
  });

  it("«Attiva l'invio» resta spento e dice cosa fare", async () => {
    vai("/x?sezione=elettronica");
    expect(await screen.findByRole("button", { name: "Attiva l'invio" })).toBeDisabled();
    expect(screen.getByText(/Prima completa e salva/)).toBeInTheDocument();
    expect(screen.getByText(/\(o email\) nella scheda Azienda/)).toBeInTheDocument();
  });

  it("se la scheda non si riesce a leggere non propone di crearla (potrebbe esserci già)", () => {
    stato.letturaFallita = true;
    vai();
    expect(screen.getByText("Non riesco a leggere i dati dell'azienda")).toBeInTheDocument();
    expect(screen.queryByText("La scheda dell'azienda non è ancora stata creata")).toBeNull();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  });
});

describe("i segnaposto della prima fattura non sono dati dell'azienda", () => {
  beforeEach(() => {
    stato.riga = {
      ...RIGA_COMPLETA,
      ragione_sociale: "Da configurare",
      partita_iva: "00000000000",
      codice_fiscale: "00000000000",
      indirizzo_via: "Da configurare",
      indirizzo_cap: "00000",
      indirizzo_comune: "Da configurare",
      indirizzo_provincia: "XX",
      pec: "rossi@pec.it",
    };
  });

  it("i campi sono vuoti da compilare, con un avviso che dice quali", () => {
    vai();
    expect(screen.getByLabelText("Partita IVA")).toHaveValue("");
    expect(screen.getByLabelText("Ragione Sociale / Denominazione")).toHaveValue("");
    expect(screen.getByLabelText("CAP")).toHaveValue("");
    expect(screen.getByText("Alcuni dati sono ancora provvisori")).toBeInTheDocument();
    expect(screen.getByText(/ragione sociale, partita IVA \(11 cifre\), codice fiscale/)).toBeInTheDocument();
  });

  it("con una partita IVA provvisoria «Attiva l'invio» non si accende, anche se ci sono PEC e ragione sociale", async () => {
    vai("/x?sezione=elettronica");
    expect(await screen.findByRole("button", { name: "Attiva l'invio" })).toBeDisabled();
  });

  it("con i dati veri e una PEC «Attiva l'invio» si accende (la prova che il blocco sopra è per i segnaposto e non sempre)", async () => {
    stato.riga = { ...RIGA_COMPLETA };
    vai("/x?sezione=elettronica");
    expect(await screen.findByRole("button", { name: "Attiva l'invio" })).toBeEnabled();
  });

  it("compilando, si salvano solo i campi cambiati: gli altri restano come sono", async () => {
    vai();
    fireEvent.change(screen.getByLabelText("Partita IVA"), { target: { value: "01234567897" } });
    fireEvent.change(screen.getByLabelText("Ragione Sociale / Denominazione"), { target: { value: "Rossi S.r.l." } });
    salva();
    await waitFor(() => expect(stato.aggiornamenti).toHaveLength(1));
    expect(Object.keys(stato.aggiornamenti[0]).sort()).toEqual(["partita_iva", "ragione_sociale", "updated_at"]);
  });
});

describe("il logo, la testata, l'indirizzo e le modifiche non salvate", () => {
  it("un logo oltre i 2 MB si rifiuta, senza caricarlo", async () => {
    const { container } = vai();
    const grande = new File([new Uint8Array(3 * 1024 * 1024)], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [grande] } });
    await waitFor(() => expect(stato.messaggi.length).toBeGreaterThan(0));
    expect(stato.messaggi[0]).toMatchObject({ tipo: "errore", titolo: "Il logo supera i 2 MB: scegline uno più leggero." });
    expect(stato.upload).not.toHaveBeenCalled();
  });

  it("un logo di misura giusta si carica", async () => {
    stato.upload.mockResolvedValue({ error: null as unknown });
    const { container } = vai();
    const piccolo = new File([new Uint8Array(1024)], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [piccolo] } });
    await waitFor(() => expect(stato.messaggi.map((m) => m.titolo)).toContain("Logo caricato"));
    expect(stato.upload).toHaveBeenCalledTimes(1);
  });

  it("la pagina non ha un titolo suo: c'è già quello della testata (un solo h1)", () => {
    const { container } = vai();
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.queryByText("Impostazioni Fatturazione")).toBeNull();
    expect(screen.queryByText(/aliquote\./)).toBeNull();
  });

  it("l'indirizzo apre la scheda giusta anche a pagina già aperta (la ricerca delle impostazioni lo fa)", async () => {
    function Vai() {
      const naviga = useNavigate();
      return <button onClick={() => naviga("/x?tab=nativa&sezione=pdf")}>vai alla scheda Aspetto</button>;
    }
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/x?tab=nativa"]}>
          <Vai />
          <ImpostazioniFatturazione />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Dati Aziendali")).toBeInTheDocument();
    fireEvent.click(screen.getByText("vai alla scheda Aspetto"));
    expect(await screen.findByText("Colore delle fatture")).toBeInTheDocument();
    expect(screen.queryByText("Dati Aziendali")).toBeNull();
  });

  it("cambiando scheda l'indirizzo la segue: ricaricando si resta dov'eri", () => {
    vai();
    apriScheda("Aspetto");
    expect(screen.getByText("Colore delle fatture")).toBeInTheDocument();
  });

  it("una scheda che non esiste («aliquote», un vecchio indirizzo) apre la prima", () => {
    vai("/x?sezione=aliquote");
    expect(screen.getByText("Dati Aziendali")).toBeInTheDocument();
  });

  it("l'anteprima mostra il numero vero: il prossimo che uscirà", () => {
    vai("/x?sezione=pdf");
    expect(screen.getByText(new RegExp(`N° FT-${new Date().getFullYear()}-0042`))).toBeInTheDocument();
    expect(screen.queryByText(/FT-2026-0001/)).toBeNull();
  });

  it("con modifiche non salvate, uscire chiede conferma", () => {
    vai();
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(confermaNavigazioneImpostazioni()).toBe(true); // niente da perdere: nessuna domanda
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "+39 02 1" } });
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(conferma).toHaveBeenCalledWith("Ci sono modifiche non salvate. Uscire senza salvarle?");
    conferma.mockRestore();
  });
});

describe("le schede con più campi hanno le etichette collegate", () => {
  it("IVA e bollo: ogni interruttore ha il suo nome", () => {
    vai("/x?sezione=avanzate");
    for (const nome of ["IVA per cassa", "Split payment (fatture alla pubblica amministrazione)", "Società con unico socio", "Bollo da 2 € automatico"]) {
      expect(screen.getByRole("switch", { name: nome }), nome).toBeInTheDocument();
    }
    expect(within(document.body).getByText("Spunta se sei una S.r.l. con un solo socio.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SocioUnico/);
  });
  it("Aspetto: i pallini del colore hanno un nome", () => {
    vai("/x?sezione=pdf");
    expect(screen.getByRole("button", { name: "Colore #0ea5e9" })).toBeInTheDocument();
  });
});
