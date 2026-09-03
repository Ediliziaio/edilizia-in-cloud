/**
 * Ondata 0.2 — prova permanente: una fattura emessa non si tocca più.
 *
 * Statiche (sempre): la regola esiste, è sul server, e l'elenco dei campi
 * ancora scrivibili è quello ricavato dai writer reali — non uno più largo.
 *
 * Dal vivo (opt-in, con SUPABASE_URL + SUPABASE_ANON_KEY + EIC_TEST_EMAIL +
 * EIC_TEST_PASSWORD): prende una fattura già emessa dell'azienda dell'utente e
 * prova a riscriverne numero e totale. Non modifica nulla: il punto della prova
 * è che il tentativo venga respinto.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRAZIONI = resolve(__dirname, "../../../supabase/migrations");
const sql = (() => {
  const nome = readdirSync(MIGRAZIONI).find((f) => f.includes("fattura_emessa_immutabile"));
  if (!nome) throw new Error("migrazione fattura_emessa_immutabile non trovata");
  return readFileSync(resolve(MIGRAZIONI, nome), "utf8");
})();

// Ogni campo qui ha un padrone noto, elencato nella migrazione. Aggiungerne uno
// senza un writer reale che lo richieda apre un buco fiscale: per questo il
// confronto è esatto e non "contiene".
const CAMPI_ANCORA_SCRIVIBILI = [
  "anagrafica_id", "ddt_fattura_id", "ddt_fatturato", "deleted_at",
  "documento_correlato_id", "importo_pagato", "note_interne", "ordine_id",
  "pagato_at", "pdf_url", "sdi_data_consegna", "sdi_errori", "sdi_file_p7m_url",
  "sdi_file_xml_url", "sdi_firmato", "sdi_id_trasmissione", "sdi_notifica_tipo",
  "sdi_ricevuta_url", "sdi_stato", "stato", "trasmissione", "updated_at",
].sort();

const CAMPI_CHE_DEVONO_RESTARE_BLOCCATI = [
  "numero", "numero_progressivo", "anno", "serie", "data_emissione", "tipo",
  "righe", "riepilogo_iva", "imponibile_totale", "iva_totale",
  "totale_documento", "totale_da_pagare", "subtotale", "cliente_snapshot",
  "ritenuta_importo", "cassa_importo", "bollo_importo", "scadenze_pagamento",
  "allegati", "company_id",
];

const elencoCampi = (): string[] => {
  const corpo = sql
    .split("FUNCTION public.documento_fiscale_campi_modificabili()")[1]
    .split("$function$;")[0];
  return [...corpo.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
};

describe("0.2 · la regola vive sul server", () => {
  it("un trigger BEFORE UPDATE OR DELETE protegge ogni percorso, non solo l'interfaccia", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_documenti_fiscali_proteggi_emessi\s+BEFORE UPDATE OR DELETE ON public\.documenti_fiscali\s+FOR EACH ROW/,
    );
  });

  it("solo i documenti fiscali sono bloccati: preventivo e proforma restano rivedibili", () => {
    const corpo = sql
      .split("FUNCTION public.documento_fiscale_e_immutabile(")[1]
      .split("$function$;")[0];
    for (const t of ["fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "ddt"]) {
      expect(corpo, `${t} dovrebbe essere immutabile`).toContain(`'${t}'`);
    }
    expect(corpo).not.toContain("'preventivo'");
    expect(corpo).not.toContain("'proforma'");
    expect(corpo).toMatch(/p_stato IS DISTINCT FROM 'bozza'/);
  });

  it("i campi ancora scrivibili sono esattamente quelli con un writer reale", () => {
    expect(elencoCampi()).toEqual(CAMPI_ANCORA_SCRIVIBILI);
  });

  it("nessun campo fiscale è finito per sbaglio fra quelli scrivibili", () => {
    const consentiti = new Set(elencoCampi());
    for (const c of CAMPI_CHE_DEVONO_RESTARE_BLOCCATI) {
      expect(consentiti.has(c), `${c} non deve essere modificabile dopo l'emissione`).toBe(false);
    }
  });

  it("non si può rientrare in bozza per riscrivere il documento da lì", () => {
    expect(sql).toMatch(/NEW\.stato = 'bozza' AND OLD\.stato IS DISTINCT FROM 'bozza'/);
  });

  it("la cancellazione fisica di un documento fiscale chiuso è rifiutata", () => {
    const corpo = sql.split("IF TG_OP = 'DELETE' THEN")[1].split("RETURN OLD;")[0];
    expect(corpo).toContain("RAISE EXCEPTION");
    expect(corpo).toContain("documento_fiscale_e_immutabile");
  });
});

describe("0.2 · lo storico è affidabile", () => {
  it("l'attore viene da auth.uid(), non da un parametro del client", () => {
    expect(sql).toMatch(/eseguito_da\s+uuid DEFAULT auth\.uid\(\)/);
    expect(sql).not.toMatch(/p_changed_by|p_eseguito_da/);
  });

  it("registra il ruolo di chi chiama, non quello della SECURITY DEFINER", () => {
    expect(sql).toMatch(/request\.jwt\.claim\.role/);
  });

  it("dal client si legge e basta: nessuna policy di scrittura", () => {
    expect(sql).toMatch(/CREATE POLICY doc_fisc_storico_lettura[\s\S]*FOR SELECT/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.documenti_fiscali_storico FROM anon, authenticated/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)[\s\S]{0,80}documenti_fiscali_storico/);
  });

  it("un tentativo respinto lascia comunque traccia: il rifiuto è catturato in un sotto-blocco", () => {
    const rpc = sql.split("FUNCTION public.documento_fiscale_aggiorna(")[1];
    expect(rpc).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(rpc).toMatch(/'rifiutata'/);
    expect(rpc).toMatch(/'ok', false/);
  });

  it("la patch non può spostare il documento in un'altra azienda", () => {
    const rpc = sql.split("FUNCTION public.documento_fiscale_aggiorna(")[1];
    expect(rpc).toMatch(/ARRAY\['id','company_id'\]/);
  });

  it("le chiavi della patch passano dal catalogo e da %I: niente SQL iniettabile", () => {
    const rpc = sql.split("FUNCTION public.documento_fiscale_aggiorna(")[1];
    expect(rpc).toContain("FROM pg_attribute a");
    expect(rpc).toMatch(/format\('%I', k\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.EIC_TEST_EMAIL ?? "";
const PASSWORD = process.env.EIC_TEST_PASSWORD ?? "";
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE.length > 40 && Boolean(EMAIL && PASSWORD);

describe.runIf(ATTIVA)("0.2 · prova end-to-end su una fattura vera", () => {
  const entra = async () => {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`login fallito: ${JSON.stringify(j).slice(0, 200)}`);
    return j.access_token as string;
  };
  const testate = (tok: string) => ({
    apikey: CHIAVE,
    Authorization: `Bearer ${tok}`,
    "Content-Type": "application/json",
  });

  it("numero e totale di una fattura emessa non si riscrivono, e il tentativo resta", async () => {
    const tok = await entra();
    const h = testate(tok);

    const lista = await (
      await fetch(
        `${URL_BASE}/rest/v1/documenti_fiscali?select=id,numero,totale_documento,stato,tipo` +
          `&tipo=eq.fattura&stato=neq.bozza&limit=1`,
        { headers: h },
      )
    ).json();
    if (!Array.isArray(lista) || lista.length === 0) {
      // Nessuna fattura emessa su cui provare: meglio dirlo che fingere un verde.
      expect.unreachable("nessuna fattura emessa disponibile per la prova");
    }
    const doc = lista[0];

    // 1. la via diretta: PostgREST
    const patch = await fetch(`${URL_BASE}/rest/v1/documenti_fiscali?id=eq.${doc.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ numero: "FALSA-99", totale_documento: 1 }),
    });
    expect(patch.status, "la PATCH diretta doveva essere respinta").toBe(403);
    expect(await patch.text()).toContain("non si possono modificare");

    // 2. la via che lascia traccia
    const rpc = await (
      await fetch(`${URL_BASE}/rest/v1/rpc/documento_fiscale_aggiorna`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          p_documento_id: doc.id,
          p_patch: { numero: "FALSA-99", totale_documento: 1 },
        }),
      })
    ).json();
    expect(rpc.ok).toBe(false);
    expect(rpc.motivo).toContain("non si possono modificare");

    // 3. il documento non si è mosso
    const dopo = await (
      await fetch(
        `${URL_BASE}/rest/v1/documenti_fiscali?id=eq.${doc.id}&select=numero,totale_documento`,
        { headers: h },
      )
    ).json();
    expect(dopo[0].numero).toBe(doc.numero);
    expect(Number(dopo[0].totale_documento)).toBe(Number(doc.totale_documento));

    // 4. il tentativo compare nello storico, con chi e cosa
    const storico = await (
      await fetch(
        `${URL_BASE}/rest/v1/documenti_fiscali_storico?documento_id=eq.${doc.id}` +
          `&esito=eq.rifiutata&select=campi,eseguito_da,ruolo_db,motivo&order=avvenuto_il.desc&limit=1`,
        { headers: h },
      )
    ).json();
    expect(storico.length, "il tentativo respinto non è finito nello storico").toBe(1);
    expect(storico[0].campi.sort()).toEqual(["numero", "totale_documento"]);
    expect(storico[0].eseguito_da).toBeTruthy();
    expect(storico[0].ruolo_db).toBe("authenticated");
  }, 60_000);

  it("lo storico non è scrivibile dal client", async () => {
    const h = testate(await entra());
    const r = await fetch(`${URL_BASE}/rest/v1/documenti_fiscali_storico`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        documento_id: "00000000-0000-0000-0000-000000000000",
        company_id: "00000000-0000-0000-0000-000000000000",
        operazione: "update",
        esito: "applicata",
      }),
    });
    expect([401, 403]).toContain(r.status);
  }, 30_000);
});

describe.runIf(!ATTIVA)("0.2 · prova end-to-end", () => {
  it("saltata: servono SUPABASE_URL, SUPABASE_ANON_KEY, EIC_TEST_EMAIL, EIC_TEST_PASSWORD", () => {
    expect(ATTIVA).toBe(false);
  });
});
