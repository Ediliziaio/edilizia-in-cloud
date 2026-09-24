/**
 * Fatture verso lo SDI (24/09/2026): gli esiti si registrano, la fattura
 * scartata si corregge, l'esito lo scrive solo il sistema.
 *
 * Prova statica sulla migrazione. La prova dal vivo è stata fatta il 24/09 in
 * una transazione annullata, su una copia di una fattura vera: consegna con
 * identificativo accettata, «NS» scritto a mano da un utente respinto,
 * scartata corretta (cliente e note) ma non rinumerata né ridatata, incassata
 * e scartata rimandabile, rifiutata dall'ente no, storno che torna a
 * «consegnata».
 */
import { describe, expect, it } from "vitest";
import sql from "../../../supabase/migrations/20280924235959_fatture_sdi_esiti_e_scarti.sql?raw";

const funzione = (nome: string) => {
  const corpo = sql.split(`FUNCTION public.${nome}(`)[1];
  if (!corpo) throw new Error(`${nome} non trovata`);
  return corpo.split("$function$;")[0];
};

describe("l'esito dello SDI si registra", () => {
  it("sdi_identificativo è fra i campi scrivibili dopo l'emissione", () => {
    expect(funzione("documento_fiscale_campi_modificabili")).toContain("'sdi_identificativo'");
  });
});

describe("l'esito lo scrive solo il sistema", () => {
  const trigger = funzione("documenti_fiscali_proteggi_emessi");

  it("un utente (o anon) non cambia stato SDI, identificativi e consegna", () => {
    expect(trigger).toMatch(/auth\.role\(\), ''\) IN \('authenticated', 'anon'\)/);
    for (const c of ["sdi_stato", "sdi_id_trasmissione", "sdi_identificativo", "sdi_notifica_tipo", "sdi_data_consegna"]) {
      expect(trigger).toContain(`NEW.${c} IS DISTINCT FROM OLD.${c}`);
    }
  });

  it("il controllo vale anche sulle bozze: viene prima dell'uscita per i documenti non bloccati", () => {
    const guardia = trigger.indexOf("auth.role()");
    const uscita = trigger.indexOf("IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN");
    expect(guardia).toBeGreaterThan(0);
    expect(guardia).toBeLessThan(uscita);
  });
});

describe("la fattura scartata si corregge, con lo stesso numero e la stessa data", () => {
  const trigger = funzione("documenti_fiscali_proteggi_emessi");

  it("vale solo per lo scarto dello SDI (NS), non per annullate e stornate", () => {
    expect(trigger).toMatch(/upper\(coalesce\(OLD\.sdi_stato, ''\)\) = 'NS'/);
    expect(trigger).toMatch(/OLD\.stato NOT IN \('annullata', 'stornata'\)/);
  });

  it("numero, serie, data, tipo e azienda restano fermi", () => {
    const fissi = trigger.split("v_fissi_scartata text[] := ARRAY[")[1].split("]")[0];
    for (const c of ["numero", "numero_progressivo", "anno", "serie", "data_emissione", "tipo", "company_id", "id"]) {
      expect(fissi).toContain(`'${c}'`);
    }
  });

  it("e il rifiuto lo dice con parole giuste, non «emetti una nota di credito»", () => {
    expect(trigger).toMatch(/scartata dallo SDI: si corregge e si rimanda con lo stesso numero e la stessa data/);
  });

  it("lo storico delle modifiche resta com'era", () => {
    expect(trigger).toContain("INSERT INTO public.documenti_fiscali_storico");
  });
});

describe("chi si ritrasmette", () => {
  const claim = funzione("claim_documento_per_invio");

  it("consegnata, mancata consegna, accettata o rifiutata dall'ente: mai", () => {
    expect(claim).toMatch(/v_sdi_stato IN \('AT', 'RC', 'MC', 'DT', 'EC', 'EC01', 'EC02'\)/);
  });

  it("incassata e scartata: sì", () => {
    expect(claim).toMatch(/\(v_mai_trasmessa OR v_scartata\) AND v_stato IN \('pagata', 'parzialmente_pagata'\)/);
  });

  it("la guardia anti cross-tenant è rimasta", () => {
    expect(claim).toContain("user_can_access_company");
  });
});

describe("tolto l'incasso, lo stato torna quello dell'invio", () => {
  it("lo storno e il trigger dei movimenti usano la stessa regola", () => {
    expect(funzione("storna_incasso_atomico")).toContain("stato_documento_da_sdi(v_sdi_stato, v_sdi_id)");
    expect(funzione("update_fattura_stato_on_movimento")).toContain("stato_documento_da_sdi(v_sdi_stato, v_sdi_id)");
  });

  it("un incasso durante l'invio non tocca lo stato «in_invio»", () => {
    expect(funzione("update_fattura_stato_on_movimento")).toMatch(/stato NOT IN \('annullata','rifiutata','bozza','in_invio'\)/);
  });

  it("la regola interna non è chiamabile da fuori", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.stato_documento_da_sdi\(text, text\) FROM PUBLIC, anon, authenticated;/);
  });
});
