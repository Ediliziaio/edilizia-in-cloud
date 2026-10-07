// src/test/logic/rateDateDaEventiMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007180000_rate_date_da_eventi.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$(\\w*)\\$;`))![0];
const INTERNE = [
  "sal_matura(text, text)", "rate_aggiorna_date(uuid)", "sal_stampa_maturazione()", "rata_data_da_evento()",
  "trg_rate_date_da_commessa()", "trg_rate_date_da_documento()", "trg_rate_date_da_preventivo()",
];

describe("migrazione rate_date_da_eventi", () => {
  it("è rilanciabile, non aspetta i lock e aggiunge solo colonne con un default che non cambia niente", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("add column if not exists sal_matura_quando text not null default 'emesso'");
    expect(codice).toContain("alter table public.sal_records add column if not exists maturato_il date;");
    expect(codice).toContain("check (sal_matura_quando in ('emesso', 'approvato'))");
  });

  it("la rata «al SAL» legge i verbali di sal_records (la schermata), non la tabella vecchia vuota", () => {
    const f = funzione("data_attesa_rata");
    expect(f).toContain("FROM public.sal_records sl");
    expect(f).toContain("min(sl.maturato_il)");
    expect(f).not.toContain("public.sal ");
    // stessa firma di prima: le viste e le funzioni che la usano non si toccano
    expect(f).toContain("p_numero integer default null::integer");
  });

  it("un verbale matura quando lo dice l'azienda: «emesso» (appena non è bozza) o «approvato» (approvato o firmato)", () => {
    expect(funzione("sal_matura")).toMatch(/then p_stato in \('approvato', 'firmato'\)\s+else p_stato <> 'bozza' end/);
    const t = funzione("sal_stampa_maturazione");
    expect(t).toMatch(/new\.maturato_il := null;/);
    // tra due stati maturati la data non si sposta
    expect(t).toMatch(/new\.maturato_il := coalesce\(old\.maturato_il, new\.maturato_il, current_date\);/);
    expect(codice).toMatch(/before insert or update of stato on public\.sal_records/);
  });

  it("una rata a evento non incassata ha la data del suo evento; quelle a data fissa e quelle incassate non si toccano", () => {
    const f = funzione("rata_data_da_evento");
    expect(f).toMatch(/if new\.trigger_evento = 'data_fissa' or new\.is_paid then\s+return new;/);
    expect(f).toContain("new.expected_date := public.data_attesa_rata(");
    expect(codice).toMatch(/before insert or update of trigger_evento, trigger_status_id, trigger_numero, is_paid, expected_date, order_id\s+on public\.order_installments/);
    const r = funzione("rate_aggiorna_date");
    expect(r).toMatch(/i\.trigger_evento <> 'data_fissa' and not i\.is_paid/);
    // scrive solo dove il valore cambia: niente scritture (e niente giri di trigger) per niente
    expect(r).toMatch(/i\.expected_date is distinct from d\.data/);
  });

  it("le fonti degli eventi muovono le rate: commessa, verbali, spedizioni, fatture, stati, firma del preventivo", () => {
    for (const t of [
      "after update of warehouse_arrival_date, work_start_date, work_end_date, expected_date on public.orders",
      "after insert or delete or update of stato, maturato_il, numero_sal, order_id on public.sal_records",
      "after insert or delete or update of arrived_at, order_id on public.shipments_to_site",
      "after insert or delete or update of issue_date, document_type, order_id on public.invoices",
      "after insert or delete on public.order_status_history",
      "after update of signed_at on public.quotes",
    ]) expect(codice).toContain(t);
  });

  it("le funzioni interne e di trigger non sono eseguibili dal browser", () => {
    for (const f of INTERNE) expect(codice).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    for (const f of INTERNE) expect(codice).not.toContain(`grant execute on function public.${f}`);
  });

  it("la scelta dell'azienda si cambia col permesso delle impostazioni e ricalcola i suoi verbali", () => {
    const f = funzione("pagamenti_impostazioni_salva");
    expect(f).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_settings_orders', p_company_id\)/);
    expect(f).toMatch(/v_regola <> all \(array\['emesso', 'approvato'\]\)/);
    expect(f).toMatch(/where s\.company_id = p_company_id/);
    expect(codice).toContain("grant execute on function public.pagamenti_impostazioni_salva(uuid, jsonb) to authenticated;");
  });

  it("riallinea i dati già in casa: i verbali non in bozza hanno maturato, le rate a evento prendono la loro data", () => {
    expect(codice).toContain("update public.sal_records set maturato_il = data_emissione where maturato_il is null and stato <> 'bozza';");
    expect(codice).toMatch(/select public\.rate_aggiorna_date\(x\.order_id\)\s+from \(select distinct order_id from public\.order_installments where trigger_evento <> 'data_fissa' and not is_paid\) x;/);
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
