import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.3 — sentinelle sull'effetto dei cron.
 *
 * Provato su produzione:
 *   il primo giro ha segnalato due guasti veri e prodotto 2 notifiche;
 *   il secondo e il terzo giro non hanno ripetuto nulla (0 → 2 → 2 → 2);
 *   lo storico è cresciuto comunque, un giro per volta;
 *   la notifica riporta «check-wa-notifiche — che NON è pianificato in cron.job».
 * Poi notifiche ed esiti di prova sono stati cancellati: zero residuo.
 *
 * I due guasti erano reali e nessuno li vedeva:
 *   4 eventi in wa_notifiche_event_queue fermi dal 2026-07-10;
 *   4 cron disattivati.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const sent = leggi("sentinelle_effetto_dei_cron");
const calendario = leggi("sentinelle_in_calendario_e_recovery");

describe("le sentinelle guardano l'effetto", () => {
  it("ogni controllo ha una condizione «c'è lavoro fermo», non solo «è girato»", () => {
    for (const coda of [
      "automation_queue", "internal_automation_queue",
      "outreach_send_queue", "silvio_action_queue", "wa_notifiche_event_queue",
    ]) {
      expect(sent, `manca il controllo su ${coda}`).toContain(`FROM public.${coda} q`);
    }
    // ogni controllo confronta con una finestra temporale
    const finestre = sent.match(/now\(\) - interval '/g) ?? [];
    expect(finestre.length).toBeGreaterThanOrEqual(5);
  });

  it("una coda vuota non è un allarme", () => {
    const ok = sent.match(/WHEN count\(\*\) = 0 THEN 'ok'/g) ?? [];
    expect(ok.length).toBeGreaterThanOrEqual(5);
  });

  it("distingue «in ritardo» da «cron spento» da «cron assente»", () => {
    for (const esito of ["in_ritardo", "cron_spento", "cron_assente"]) {
      expect(sent).toContain(`'${esito}'`);
    }
  });

  it("un'attesa legittima non conta come guasto", () => {
    expect(sent).toMatch(/'awaiting_approval' è un'attesa legittima/);
    const blocco = sent.slice(sent.indexOf("silvio_action_queue q"));
    expect(blocco).toMatch(/q\.status = 'queued'/);
  });

  it("suona solo alla transizione, non a ogni giro", () => {
    expect(sent).toMatch(/Suona solo quando qualcosa passa da «a posto» a «non a posto»/);
    expect(sent).toMatch(/ORDER BY e\.misurato_at DESC LIMIT 1\), 'ok'\) = 'ok' THEN/);
  });

  it("non esegue SQL preso da una tabella", () => {
    expect(sent).not.toMatch(/EXECUTE\s+\w*sql_/i);
    expect(sent).toMatch(/è una porta aperta/);
  });
});

describe("la campanella ora suona a qualcuno", () => {
  it("i destinatari non richiedono più un'azienda", () => {
    expect(sent).toMatch(/CREATE OR REPLACE FUNCTION public\.destinatari_allarmi_piattaforma/);
    expect(sent).toMatch(/coalesce\(p\.company_id, '00000000-0000-0000-0000-000000000001'::uuid\)/);
    const corpo = sent.slice(sent.indexOf("destinatari_allarmi_piattaforma()\nRETURNS"));
    expect(corpo.slice(0, 600)).not.toMatch(/company_id IS NOT NULL/i);
  });

  it("anche cron_health_check viene ricollegata", () => {
    expect(sent).toMatch(/pg_get_functiondef\('public\.cron_health_check\(\)'::regprocedure\)/);
    expect(sent).toMatch(/La campanella di cron_health_check, ricollegata/);
  });

  it("la sostituzione sul catalogo non può essere muta", () => {
    expect(sent).toMatch(/la sostituzione sarebbe stata muta/);
  });
});

describe("misurato_at distingue due giri", () => {
  it("usa clock_timestamp, non now()", () => {
    expect(sent).toMatch(/misurato_at\s+timestamptz NOT NULL DEFAULT clock_timestamp\(\)/);
    // il commento va a capo: confronto il testo senza gli a-capo
    expect(sent.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /dentro una transazione now\(\) è sempre lo stesso istante/);
  });

  it("la tabella temporanea viene rimossa prima di ricrearla", () => {
    expect(sent).toMatch(/DROP TABLE IF EXISTS _sent;/);
  });
});

describe("calendario", () => {
  it("la sentinella è sfasata rispetto a cron-health-check", () => {
    expect(calendario).toMatch(/'12-59\/15 \* \* \* \*'/);
    expect(calendario).toMatch(/per non pestarsi i piedi/);
  });

  it("whatsapp-ai-recovery viene riacceso con alter_job, non con un UPDATE", () => {
    expect(calendario).toMatch(/cron\.alter_job\(jobid, active := true\)/);
    expect(calendario).not.toMatch(/UPDATE cron\.job/);
  });

  it("è scritto perché riaccenderlo era sicuro", () => {
    expect(calendario.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /nessun messaggio in processing_status='received'/);
  });
});

describe("lo storico non è pubblico", () => {
  it("la tabella ha RLS e una sola policy, per super_admin", () => {
    expect(sent).toMatch(/ALTER TABLE public\.cron_sentinelle_esiti ENABLE ROW LEVEL SECURITY/);
    expect(sent).toMatch(/sentinelle_solo_super_admin/);
    expect(sent).toMatch(/has_role\(\(SELECT auth\.uid\(\)\), 'super_admin'/);
  });

  it("la funzione non è eseguibile da anon", () => {
    expect(sent).toMatch(/REVOKE ALL ON FUNCTION public\.sentinelle_effetti_cron\(\) FROM PUBLIC, anon/);
    expect(sent).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.sentinelle_effetti_cron\(\) TO authenticated/);
  });
});
