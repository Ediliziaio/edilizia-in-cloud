/**
 * Rata della commessa, fattura interna e bonifico: un incasso solo, visto da
 * tutte e tre le parti (25/09/2026).
 *
 * Prova statica su migrazioni, funzione notturna e Tesoreria. La prova dal
 * vivo è stata fatta il 25/09 in transazioni annullate, su copie di una
 * fattura e di un bonifico dell'azienda demo: rata incassata → fattura pagata
 * con movimento, prima nota e scadenza; fattura pagata → rata incassata alla
 * data dell'incasso; bonifico abbinato → fattura e rata incassate alla data
 * del bonifico, prima nota col bonifico; scollegato → tutto da incassare e
 * bonifico libero; incasso tolto dal registro → bonifico libero anche lui.
 */
import { describe, expect, it } from "vitest";
import rate from "../../../supabase/migrations/20280925020000_rate_commessa_e_fatture_allineate.sql?raw";
import annullata from "../../../supabase/migrations/20280925020100_rata_libera_se_fattura_annullata.sql?raw";
import bonifico from "../../../supabase/migrations/20280925020200_bonifico_su_fattura_interna.sql?raw";
import notturna from "../../../supabase/functions/bank-auto-reconcile/index.ts?raw";
import tesoreria from "@/components/tesoreria/BankReconciliation.tsx?raw";
import modificaCommessa from "@/pages/azienda/EditOrder.tsx?raw";
import creaFattura from "@/components/orders/CreaFatturaDialog.tsx?raw";

const funzione = (sql: string, nome: string) => {
  const corpo = sql.split(`FUNCTION public.${nome}(`)[1];
  if (!corpo) throw new Error(`${nome} non trovata`);
  return corpo.split("$function$;")[0];
};

describe("rata e fattura interna si seguono", () => {
  it("la rata incassata registra l'incasso sulla fattura, con i soldi veri", () => {
    expect(funzione(rate, "incassa_fattura_da_rata")).toContain("registra_incasso_atomico(");
    expect(rate).toMatch(/CREATE TRIGGER trg_allinea_fattura_da_rata[\s\S]*ON public\.order_installments/);
  });

  it("la fattura pagata segna la rata incassata, e dopo la scadenza della fattura", () => {
    expect(rate).toMatch(/CREATE TRIGGER trg_sync_rata_da_fattura[\s\S]*ON public\.documenti_fiscali/);
    // I trigger AFTER scattano in ordine di nome: la scadenza esiste già.
    expect("trg_sync_rata_da_fattura" > "trg_scadenza_da_documento_fiscale").toBe(true);
  });

  it("una rata legata non riceve un secondo incasso in prima nota", () => {
    expect(funzione(rate, "prima_nota_rata_con_fattura")).toContain("RAISE EXCEPTION");
  });

  it("i trigger non si chiamano da fuori; legare e slegare solo da utenti autenticati", () => {
    for (const f of ["incassa_fattura_da_rata(uuid)", "allinea_fattura_da_rata()", "allinea_rata_da_fattura()", "prima_nota_rata_con_fattura()"]) {
      expect(rate).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
    expect(rate).toContain("REVOKE ALL ON FUNCTION public.collega_rata_fattura(uuid, uuid) FROM PUBLIC, anon;");
    expect(rate).toContain("GRANT EXECUTE ON FUNCTION public.collega_rata_fattura(uuid, uuid) TO authenticated, service_role;");
  });

  it("salvare la commessa aggiorna le rate al loro posto: i legami restano", () => {
    const sostituisci = funzione(rate, "order_rate_sostituisci");
    expect(sostituisci).toContain("UPDATE public.order_installments oi SET");
    expect(sostituisci).toContain("fattura_pagata");
    expect(modificaCommessa).toMatch(/\.\.\.\(i\.id \? \{ id: i\.id \} : \{\}\)/);
  });

  it("la fattura creata dalla rata si lega a lei", () => {
    expect(creaFattura).toContain('"collega_rata_fattura"');
  });

  it("una fattura annullata lascia la rata libera per quella giusta", () => {
    const allinea = funzione(annullata, "allinea_rata_da_fattura");
    expect(allinea).toMatch(/NEW\.stato = 'annullata' OR NEW\.deleted_at IS NOT NULL[\s\S]*SET documento_fiscale_id = NULL/);
  });
});

describe("il bonifico abbinato è l'incasso della fattura interna", () => {
  const riconcilia = funzione(bonifico, "riconcilia_bonifico_fattura");
  const scollega = funzione(bonifico, "scollega_bonifico_fattura");
  const storna = funzione(bonifico, "storna_incasso_atomico");

  it("registra l'incasso vero, alla data del bonifico, e la prima nota porta il bonifico", () => {
    expect(riconcilia).toContain("registra_incasso_atomico(");
    expect(riconcilia).toContain("coalesce(t.booking_date,");
    // sync-prima-nota salta i bonifici già citati: niente doppio incasso in cassa.
    expect(riconcilia).toContain("UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE movimento_id = v_mov;");
  });

  it("un bonifico già abbinato, un addebito o una bozza si rifiutano", () => {
    expect(riconcilia).toContain("Questo movimento bancario è già abbinato.");
    expect(riconcilia).toContain("t.transaction_type <> 'credit'");
    expect(riconcilia).toMatch(/d\.stato IN \('bozza', 'annullata', 'stornata', 'in_invio'\)/);
  });

  it("scollegare storna l'incasso; toglierlo dal registro libera il bonifico", () => {
    expect(scollega).toContain("PERFORM public.storna_incasso_atomico(rc.company_id, rc.movimento_id);");
    expect(storna).toMatch(/UPDATE bank_reconciliations SET unmatched_at = now\(\)\s+WHERE movimento_id = p_movimento_id/);
    expect(storna).toContain("reconciliation_status = 'pending'");
  });

  it("dall'app solo la propria azienda; mai da anon", () => {
    expect(riconcilia).toContain("user_can_access_company(t.company_id)");
    expect(scollega).toContain("user_can_access_company(rc.company_id)");
    expect(bonifico).toContain("REVOKE ALL ON FUNCTION public.riconcilia_bonifico_fattura(uuid, uuid, text, integer) FROM PUBLIC, anon;");
    expect(bonifico).toContain("REVOKE ALL ON FUNCTION public.scollega_bonifico_fattura(uuid) FROM PUBLIC, anon;");
  });
});

describe("l'abbinamento notturno vede anche le fatture interne", () => {
  it("le cerca in documenti_fiscali e le incassa con riconcilia_bonifico_fattura", () => {
    expect(notturna).toContain('.from("documenti_fiscali")');
    expect(notturna).toContain('supabase.rpc("riconcilia_bonifico_fattura"');
  });

  it("il pagamento prende la data del bonifico, non quella del giro", () => {
    const entrate = notturna.split("// ── ENTRATE")[1];
    expect(entrate).toMatch(/\.select\("id, amount, booking_date,/);
  });

  it("le uscite non dipendono più dalle entrate: vengono prima dei loro «continue»", () => {
    const uscite = notturna.indexOf("// ── USCITE");
    const entrate = notturna.indexOf("// ── ENTRATE");
    expect(uscite).toBeGreaterThan(0);
    expect(entrate).toBeGreaterThan(uscite);
  });
});

describe("in Tesoreria la riconciliazione di una fattura interna si scollega con lo storno", () => {
  it("prima del ramo delle scadenze fornitori, che toccherebbe la scadenza a mano", () => {
    const storno = tesoreria.indexOf("if (eRiconciliazioneFatturaInterna(rec))");
    const scadenza = tesoreria.indexOf("if (!invId && rec.scadenza_id)");
    expect(storno).toBeGreaterThan(0);
    expect(storno).toBeLessThan(scadenza);
    expect(tesoreria).toContain('supabase.rpc("scollega_bonifico_fattura"');
  });

  it("l'abbinamento a mano passa dalla stessa RPC della notte", () => {
    expect(tesoreria).toContain('supabase.rpc("riconcilia_bonifico_fattura"');
    expect(tesoreria).toContain("if (eFatturaInterna(inv)) return confirmMatchInterna(tx, inv, matchType);");
  });
});
