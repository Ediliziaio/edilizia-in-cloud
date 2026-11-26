// Annullare una fattura emessa ma mai uscita (26/11/2026, Impresa Vulcano).
//
// Vulcano aveva emesso la 1/242 senza mandarla allo SDI: niente trasmissione, niente
// incassi. Per l'Agenzia non esiste, quindi una nota di credito non c'entra — e il
// cestino la rifiutava, lasciando il numero 242 bruciato in cima alla serie.
//
// Qui si controlla la regola del browser (chi vede «Elimina» e «Annulla fattura») e che
// la migrazione apra la stessa porta nel database, senza aprirne altre.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { documentoEliminabile, emessaMaiUscita } from "@/lib/fatturazione/correggibile";
import type { DocumentoDaCorreggere } from "@/lib/fatturazione/correggibile";

const MIGRAZIONE = "supabase/migrations/20290611100000_annulla_fattura_mai_uscita.sql";
const sql = readFileSync(MIGRAZIONE, "utf8");

const maiUscita: DocumentoDaCorreggere = {
  tipo: "fattura",
  stato: "emessa",
  sdi_id_trasmissione: null,
  sdi_stato: null,
  sdi_identificativo: null,
  importo_pagato: 0,
  pagato_at: null,
};

describe("documentoEliminabile", () => {
  it("accetta la bozza, la già annullata e la emessa mai uscita", () => {
    expect(documentoEliminabile({ tipo: "fattura", stato: "bozza" })).toBe(true);
    expect(documentoEliminabile({ tipo: "fattura", stato: "annullata" })).toBe(true);
    expect(documentoEliminabile(maiUscita)).toBe(true);
    expect(emessaMaiUscita(maiUscita)).toBe(true);
  });

  it("rifiuta una fattura che è davvero uscita", () => {
    // Trasmessa allo SDI
    expect(documentoEliminabile({ ...maiUscita, sdi_id_trasmissione: "6b00500a85" })).toBe(false);
    // Un esito dallo SDI, qualunque sia
    expect(documentoEliminabile({ ...maiUscita, sdi_stato: "RC" })).toBe(false);
    expect(documentoEliminabile({ ...maiUscita, sdi_identificativo: "18710729790" })).toBe(false);
    // Incassata, in tutto o in parte
    expect(documentoEliminabile({ ...maiUscita, importo_pagato: 100 })).toBe(false);
    expect(documentoEliminabile({ ...maiUscita, pagato_at: "2026-11-25" })).toBe(false);
    // Stati più avanti dell'emissione
    for (const stato of ["inviata_sdi", "consegnata", "accettata", "pagata", "parzialmente_pagata", "stornata"]) {
      expect(documentoEliminabile({ ...maiUscita, stato })).toBe(false);
    }
  });

  it("non apre il cestino a un DDT né a un preventivo emesso", () => {
    expect(documentoEliminabile({ ...maiUscita, tipo: "ddt" })).toBe(false);
    expect(documentoEliminabile({ ...maiUscita, tipo: "proforma" })).toBe(false);
    expect(documentoEliminabile({ ...maiUscita, tipo: "preventivo" })).toBe(false);
  });
});

describe("la migrazione", () => {
  it("tiene la regola «mai uscita» in un posto solo, letto da guardiano ed eliminazione", () => {
    expect(sql).toContain("create or replace function public.documento_fattura_mai_uscita");
    expect(sql).toContain("v_mai_uscita := public.documento_fattura_mai_uscita(OLD);");
    expect(sql).toContain("v_mai_uscita := public.documento_fattura_mai_uscita(v_doc);");
  });

  it("al guardiano apre solo il numero, e solo dentro l'annullamento", () => {
    expect(sql).toContain("v_consentiti := v_consentiti || 'numero'::text;");
    expect(sql).toContain("coalesce(current_setting('fatturazione.annullamento', true), '') = 'on'");
    expect(sql).toContain("AND NEW.stato = 'annullata'");
    expect(sql).toContain("AND NEW.numero LIKE 'Bozza %'");
  });

  it("una emessa uscita davvero resta da stornare con nota di credito", () => {
    expect(sql).toContain("if v_doc.stato <> 'bozza' and v_doc.stato <> 'annullata' and not v_mai_uscita then");
    expect(sql).toContain("I documenti emessi non possono essere eliminati. Emetti una nota di credito per stornare la fattura.");
  });

  it("si ferma se c'è contabilità appesa alla fattura", () => {
    for (const tabella of [
      "public.movimenti_cassa_native",
      "public.order_installments",
      "public.prima_nota_entries",
      "public.bank_reconciliations",
      "public.appalto_sal",
      "public.generale_fatture",
      "public.ritenute_bonifici",
      "public.archivio_sostitutivo",
    ]) {
      expect(sql).toContain(tabella);
    }
    expect(sql).toContain("prima si staccano quei collegamenti, poi si annulla");
  });

  it("il numero torna alla serie e la funzione resta chiusa ad anon", () => {
    expect(sql).toContain("numero = 'Bozza ' || upper(left(replace(id::text, '-', ''), 8))");
    expect(sql).toContain("set ultimo_numero_fattura = v_massimo");
    expect(sql).toMatch(/revoke all on function public\.documento_fattura_mai_uscita\(public\.documenti_fiscali\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.documento_elimina_bozza\(uuid\) from public, anon;/);
  });

  it("si rifiuta di correre se guardiano o eliminazione sono cambiati da sotto", () => {
    expect(sql).toContain("md5(v_trig) <> '14f44d5a858a2cc872b496522d43c6f2'");
    expect(sql).toContain("md5(v_eli) <> '2995cc9268616d6eefcc559c32a0ee70'");
  });
});
