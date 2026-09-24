/**
 * Il numero della fattura si assegna all'emissione (migrazione 20280924235950).
 *
 * Art. 21 c. 2 lett. b DPR 633/72: numero progressivo e univoco. Il numero
 * nasceva con la bozza: una bozza eliminata lasciava un buco nella serie
 * trasmessa allo SDI, e bozze emesse fuori ordine davano numeri più alti con
 * date più vecchie. Collaudato su dati veri in transazione annullata il
 * 24/09/2026; qui si tiene ferma la forma delle regole.
 */
import { describe, expect, it } from "vitest";
import sql from "../../../supabase/migrations/20280924235950_numero_fattura_all_emissione.sql?raw";

const funzione = (n: string) => {
  const inizio = sql.indexOf(`create or replace function public.${n}`);
  return sql.slice(inizio, sql.indexOf("$function$;", inizio));
};

describe("numero della fattura all'emissione", () => {
  it("la bozza di un documento fiscale nasce senza numero e sempre in bozza", () => {
    const crea = funzione("documento_crea");
    expect(crea).toMatch(/v_numero := 'Bozza ' \|\|/);
    expect(crea).toMatch(/v_stato := 'bozza'/);
    expect(crea).toMatch(/c_fiscali text\[\] := array\['fattura','fattura_pa','nota_credito','nota_debito',\s*'autofattura','fattura_riepilogativa'\]/);
  });

  it("l'emissione rifiuta la data futura e la data fuori ordine rispetto alle fatture già emesse", () => {
    const emetti = funzione("documento_emetti");
    expect(emetti).toMatch(/if v_data > v_oggi then/);
    expect(emetti).toMatch(/numero_progressivo < v_prog and data_emissione > v_data/);
    expect(emetti).toMatch(/numero_progressivo > v_prog and data_emissione < v_data/);
    // Giorno italiano, non UTC: tra mezzanotte e le due il giorno UTC è quello prima.
    expect(emetti).toMatch(/now\(\) at time zone 'Europe\/Rome'/);
  });

  it("chiusa ad anon, aperta agli utenti", () => {
    expect(sql).toMatch(/revoke all on function public\.documento_emetti\(uuid\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.documento_emetti\(uuid\) to authenticated;/);
  });

  it("nota di debito e fattura differita nella serie delle fatture, non nel ramo «DOC»", () => {
    expect(funzione("genera_numero_documento_native")).toMatch(/WHEN 'fattura', 'fattura_pa', 'autofattura', 'nota_debito', 'fattura_riepilogativa'/);
  });

  it("il trigger non lascia emettere né rinumerare una bozza fuori da documento_emetti", () => {
    const trigger = funzione("documenti_fiscali_proteggi_emessi");
    expect(trigger).toMatch(/current_setting\('fatturazione\.emissione', true\)/);
    expect(trigger).toMatch(/NEW\.stato NOT IN \('bozza', 'annullata'\)/);
    expect(trigger).toMatch(/NEW\.numero IS DISTINCT FROM OLD\.numero/);
  });
});
