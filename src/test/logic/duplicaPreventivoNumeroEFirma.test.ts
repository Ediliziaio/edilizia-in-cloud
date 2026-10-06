/**
 * Duplica preventivo: la copia ha un numero VERO e non porta niente della firma.
 *
 *  - Se la RPC del numero fallisce la copia non nasce: prima ripiegava su
 *    «OFF-<anno>-001», un numero che esiste quasi sempre già (e se il primo era
 *    stato purgato, lo riusava in silenzio).
 *  - Il preventivo firmato dal link legacy porta la prova di firma in
 *    custom_field_values.prova_firma (nome, IP, impronta del documento): la
 *    copia, che è una bozza non firmata, non deve averla. Così come lo sconto
 *    autorizzato dall'admin: l'approvazione non passa alla copia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Chiamata = { tabella: string; op: string; dati?: unknown };
const stato = vi.hoisted(() => ({
  chiamate: [] as Array<{ tabella: string; op: string; dati?: unknown }>,
  numero: { data: "OFF-2026-077" as string | null, error: null as { message: string } | null },
  originale: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    let op = "select";
    let dati: unknown;
    const q: Record<string, unknown> = {};
    const esito = (): { data: unknown; error: { message: string } | null } => {
      if (tabella === "quotes" && op === "select") return { data: stato.originale, error: null };
      if (tabella === "quotes" && op === "insert") return { data: { id: "copia-1" }, error: null };
      if (tabella === "quote_items") return {
        data: [{ id: "r1", parent_item_id: null, item_type: "product", name: "Finestra", quantity: 2, unit_price: 500, unit_of_measure: "pz" }],
        error: null,
      };
      if (tabella === "quote_pdf_attachments" && op === "select") return { data: [], error: null };
      return { data: null, error: null };
    };
    for (const m of ["select", "eq", "order", "is", "in", "limit"]) q[m] = () => q;
    q.insert = (d: unknown) => { op = "insert"; dati = d; stato.chiamate.push({ tabella, op, dati: d }); return q; };
    q.single = async () => esito();
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(esito()).then(resolve);
    void dati;
    return q;
  };
  return {
    supabase: {
      from: costruisci,
      auth: { getUser: async () => ({ data: { user: { id: "utente-1" } } }) },
      rpc: async (nome: string, args: unknown) => {
        stato.chiamate.push({ tabella: "rpc", op: nome, dati: args });
        if (nome === "generate_quote_number") return stato.numero;
        return { data: { ok: true }, error: null as { message: string } | null };
      },
    },
  };
});

import { costruisciCopiaQuote, duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";

const firmato = {
  id: "q-1", company_id: "c-1", title: "Bagno Rossi", status: "accettata", quote_number: "OFF-2026-042",
  client_name: "Mario Rossi", total: 1220, signed_at: "2026-08-03T10:00:00Z", signed_by_name: "Mario Rossi", signed_by_ip: "10.0.0.1",
  signature_token: "tok", approval_status: "approved", sconto_richiesto_pct: 12, sconto_autorizzato_pct: 10, discount_percent: 10,
  custom_field_values: {
    cantiere_zona: "Nord",
    prova_firma: { firmato_da: "Mario Rossi", ip: "10.0.0.1", impronta_documento: "abc123", consensi: [{ chiave: "recesso", accettato: true }] },
  },
};

beforeEach(() => {
  stato.chiamate.length = 0;
  stato.numero = { data: "OFF-2026-077", error: null };
  stato.originale = structuredClone(firmato);
});

const inserimentiQuote = () => stato.chiamate.filter((c: Chiamata) => c.tabella === "quotes" && c.op === "insert");

describe("duplicaPreventivo: il numero", () => {
  it("la copia prende il numero della RPC", async () => {
    const esito = await duplicaPreventivo("q-1", "c-1", { comeRevisione: false });
    expect(esito.id).toBe("copia-1");
    expect((inserimentiQuote()[0].dati as Record<string, unknown>).quote_number).toBe("OFF-2026-077");
  });

  it("se la RPC del numero dà errore, la copia non nasce e l'errore si dice", async () => {
    stato.numero = { data: null, error: { message: "Accesso negato" } };
    await expect(duplicaPreventivo("q-1", "c-1", { comeRevisione: false })).rejects.toThrow(/Accesso negato/);
    expect(inserimentiQuote()).toHaveLength(0);
  });

  it("se la RPC risponde senza numero, la copia non nasce: niente «OFF-<anno>-001» inventato", async () => {
    stato.numero = { data: null, error: null };
    await expect(duplicaPreventivo("q-1", "c-1", { comeRevisione: false })).rejects.toThrow(/numero/i);
    expect(inserimentiQuote()).toHaveLength(0);
    expect(stato.chiamate.some((c: Chiamata) => c.op === "save_quote_items_atomic")).toBe(false);
  });
});

describe("costruisciCopiaQuote: niente firma, niente approvazione", () => {
  it("la prova di firma e lo sconto autorizzato non passano alla copia; gli altri campi sì", () => {
    const copia = costruisciCopiaQuote(firmato, { comeRevisione: false });
    expect(copia.custom_field_values).toEqual({ cantiere_zona: "Nord" });
    expect(copia).not.toHaveProperty("sconto_autorizzato_pct");
    expect(copia).not.toHaveProperty("sconto_richiesto_pct");
    expect(copia).not.toHaveProperty("signed_by_ip");
    expect(copia).not.toHaveProperty("signed_by_name");
    expect(copia.discount_percent).toBe(10);
    expect(copia.status).toBe("bozza");
  });

  it("l'originale resta com'è (nessuna modifica sul posto)", () => {
    const copia = costruisciCopiaQuote(firmato, { comeRevisione: true, numeroRevisione: 2 });
    expect(copia.parent_quote_id).toBe("q-1");
    expect((firmato.custom_field_values as Record<string, unknown>).prova_firma).toBeDefined();
    expect(firmato.sconto_autorizzato_pct).toBe(10);
  });

  it("senza campi personalizzati, o con una prova sola, la copia non porta un oggetto vuoto inventato", () => {
    expect(costruisciCopiaQuote({ id: "x", custom_field_values: null }, { comeRevisione: false }).custom_field_values ?? null).toBeNull();
    expect(costruisciCopiaQuote({ id: "x", custom_field_values: { prova_firma: { a: 1 } } }, { comeRevisione: false }).custom_field_values).toEqual({});
  });

  it("la copia passa dalla stessa strada dei salvataggi: righe via save_quote_items_atomic con la gerarchia", async () => {
    await duplicaPreventivo("q-1", "c-1", { comeRevisione: false });
    const copiaRighe = stato.chiamate.find((c: Chiamata) => c.op === "save_quote_items_atomic");
    expect(copiaRighe).toBeTruthy();
    expect((copiaRighe!.dati as { p_quote_id: string }).p_quote_id).toBe("copia-1");
    const inserita = inserimentiQuote()[0].dati as Record<string, unknown>;
    expect(inserita).not.toHaveProperty("signature_token");
    expect(inserita).not.toHaveProperty("signed_at");
    expect(inserita.created_by).toBe("utente-1");
  });
});
