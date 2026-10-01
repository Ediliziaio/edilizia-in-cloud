/**
 * Il numero vero della fattura nasce con la bozza (migrazione 20281001150000,
 * 01/10/2026, go-live di Renova): il cliente paga citandolo prima dell'invio
 * allo SDI. Supera «numero all'emissione» (20280924235950).
 *
 * Collaudato su dati veri in una transazione annullata il 01/10/2026: prima
 * bozza FPR 73/26, nota di credito FPR 74/26 nella serie unica, numero a mano
 * già usato rifiutato, bozza vuota rilasciata (il numero torna libero),
 * emissione che tiene il numero, super admin entrato nell'azienda che legge e
 * crea le fatture. Qui si tiene ferma la forma delle regole.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const sql = leggi("supabase/migrations/20281001150000_numero_fattura_sulla_bozza.sql");
const campo = leggi("src/pages/azienda/fatturazione/editor/NumeroDocumentoField.tsx");
const statoEditor = leggi("src/pages/azienda/fatturazione/editor/useEditorState.ts");

const funzione = (n: string) => {
  const inizio = sql.indexOf(`create or replace function public.${n}`);
  return sql.slice(inizio, sql.indexOf("$function$;", inizio));
};

describe("numero della fattura sulla bozza", () => {
  it("la bozza fiscale nasce col numero vero della serie, nella stessa transazione", () => {
    const crea = funzione("documento_crea");
    expect(crea).not.toMatch(/'Bozza ' \|\|/);
    expect(crea).toMatch(/from public\.documento_numero_nella_serie\(p_company_id, v_tipo, v_anno\)/);
    expect(crea).toMatch(/v_stato := 'bozza'/);
  });

  it("la serie non dà mai due volte lo stesso numero, note di credito comprese se la serie è unica", () => {
    const serie = funzione("documento_numero_nella_serie");
    expect(serie).toMatch(/case when v_condivisa then array\['nota_credito'\]/);
    expect(serie).toMatch(/d\.tipo = any \(v_serie\)/);
    expect(serie).toMatch(/errcode = '23505'/);
    // Il contatore segue il numero più alto, mai indietro.
    expect(serie).toMatch(/greatest\(coalesce\(ultimo_numero_fattura, 0\), v_prog\)/);
  });

  it("la funzione interna non la esegue nessun utente", () => {
    expect(sql).toMatch(
      /revoke all on function public\.documento_numero_nella_serie\(uuid, text, integer, integer, uuid\) from public, anon, authenticated;/,
    );
  });

  it("il numero a mano: solo in bozza, con «Fatturazione», passando dal trigger come l'emissione", () => {
    const assegna = funzione("documento_assegna_numero");
    expect(assegna).toMatch(/public\.puo_gestire_documento_fiscale\(v_doc\.company_id, v_doc\.tipo\)/);
    expect(assegna).toMatch(/if v_doc\.stato <> 'bozza' then/);
    expect(assegna).toMatch(/set_config\('fatturazione\.emissione', 'on', true\)/);
    expect(assegna).toMatch(/set_config\('fatturazione\.emissione', 'off', true\)/);
    expect(sql).toMatch(/revoke all on function public\.documento_assegna_numero\(uuid, integer\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.documento_assegna_numero\(uuid, integer\) to authenticated;/);
  });

  it("la nota di credito nella serie unica libera il numero delle fatture", () => {
    const rilascia = funzione("rilascia_numero_documento");
    expect(rilascia).toMatch(/OR \(v_tipo = 'nota_credito' AND v_condivisa\) THEN/);
    expect(rilascia).toMatch(/'nota_debito', 'fattura_riepilogativa'/);
  });

  it("il super admin entrato nell'azienda legge le fatture; l'azienda e il cliente esterno restano filtri", () => {
    const lettura = sql.slice(sql.indexOf("create policy documenti_fiscali_lettura"));
    expect(lettura).toMatch(/company_id = \(select public\.get_my_company_id\(\)\)/);
    expect(lettura).toMatch(/and not \(select public\.utente_e_cliente_esterno\(\)\)/);
    expect(lettura).toMatch(/\(select public\.has_role\(auth\.uid\(\), 'super_admin'::public\.app_role\)\)/);
  });

  it("l'editor mostra e cambia il numero dal database, e il salvataggio non lo scrive mai", () => {
    expect(campo).toContain('"documento_assegna_numero"');
    expect(campo).toContain("p_numero_progressivo");
    const tracciati = statoEditor.slice(
      statoEditor.indexOf("const TRACKED_FIELDS"),
      statoEditor.indexOf("] as const;"),
    );
    expect(tracciati).not.toMatch(/"numero"|"numero_progressivo"|"anno"/);
  });
});
