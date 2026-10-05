import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  destinatariBriefing,
  STATI_SENZA_ACCESSO,
  type PreferenzaBriefing,
} from "../../../supabase/functions/silvio-daily-briefing/destinatari";

/**
 * Il briefing mattutino di Silvio partiva per ogni utente con la preferenza
 * accesa, anche delle aziende sospese: sul Test Lab (sospeso, 382 utenti) erano
 * ~30 messaggi al giorno scritti per nessuno, 4,3 $ in 14 giorni, il 31% della
 * spesa AI del mese (05/10/2026). Un'azienda che non può usare Silvio non deve
 * riceverlo; e un guasto nella lettura degli stati non deve spegnere il
 * briefing di tutti i clienti.
 */

const OGGI = new Date("2026-10-05T05:32:00.000Z");

const pref = (user_id: string, company_id: string | null, last_briefing_at: string | null = null): PreferenzaBriefing => ({
  user_id,
  company_id,
  last_briefing_at,
});

const stati = (o: Record<string, string | null>) => new Map(Object.entries(o));

describe("Il briefing non parte per le aziende che non possono usare Silvio", () => {
  it("salta sospese, scadute e cessate; tiene attive, in prova e gratuite", () => {
    const prefs = [
      pref("u1", "azienda-attiva"),
      pref("u2", "azienda-prova"),
      pref("u3", "azienda-gratis"),
      pref("u4", "azienda-sospesa"),
      pref("u5", "azienda-scaduta"),
      pref("u6", "azienda-cessata"),
      pref("u7", "azienda-cancelled"),
    ];
    const r = destinatariBriefing(
      prefs,
      stati({
        "azienda-attiva": "active",
        "azienda-prova": "trial",
        "azienda-gratis": "free",
        "azienda-sospesa": "suspended",
        "azienda-scaduta": "expired",
        "azienda-cessata": "canceled",
        "azienda-cancelled": "cancelled",
      }),
      OGGI,
    );
    expect(r.targets.map((t) => t.user_id)).toEqual(["u1", "u2", "u3"]);
    expect(r.saltatiPerStato).toBe(4);
  });

  it("il caso vero: 382 utenti di un'azienda sospesa non ricevono niente, i clienti sì", () => {
    const testLab = Array.from({ length: 382 }, (_, i) => pref(`tl-${i}`, "test-lab"));
    const clienti = [pref("c1", "cliente-a"), pref("c2", "cliente-b")];
    const r = destinatariBriefing([...testLab, ...clienti], stati({ "test-lab": "suspended", "cliente-a": "active", "cliente-b": "free" }), OGGI);
    expect(r.targets).toHaveLength(2);
    expect(r.saltatiPerStato).toBe(382);
  });

  it("se gli stati non si sono potuti leggere (null) non filtra niente: meglio un briefing in più che nessuno", () => {
    const r = destinatariBriefing([pref("u1", "a"), pref("u2", "b")], null, OGGI);
    expect(r.targets.map((t) => t.user_id)).toEqual(["u1", "u2"]);
    expect(r.saltatiPerStato).toBe(0);
  });

  it("un'azienda che nella mappa non c'è, o con stato vuoto, resta tra i destinatari", () => {
    const r = destinatariBriefing([pref("u1", "sconosciuta"), pref("u2", "senza-stato")], stati({ "senza-stato": null }), OGGI);
    expect(r.targets).toHaveLength(2);
  });

  it("le regole di prima restano: niente azienda = niente briefing; già mandato oggi = non si ripete", () => {
    const r = destinatariBriefing(
      [
        pref("senza-azienda", null),
        pref("gia-oggi", "a", "2026-10-05T04:00:00.000Z"),
        pref("ieri", "a", "2026-10-04T05:32:00.000Z"),
        pref("mai", "a", null),
      ],
      stati({ a: "active" }),
      OGGI,
    );
    expect(r.targets.map((t) => t.user_id)).toEqual(["ieri", "mai"]);
    expect(r.saltatiPerStato).toBe(0);
  });

  it("gli stati bloccati sono gli stessi che l'app già considera bloccati (non una seconda lista che si allontana)", () => {
    const fonte = readFileSync(resolve(process.cwd(), "src/hooks/usePaymentMethodGate.ts"), "utf8");
    const m = fonte.match(/BLOCKED_STATUSES\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(m, "BLOCKED_STATUSES non trovato in usePaymentMethodGate.ts").toBeTruthy();
    const dellApp = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    expect([...STATI_SENZA_ACCESSO].sort()).toEqual(dellApp);
  });
});

describe("La funzione usa il filtro solo nel giro del cron", () => {
  const fonte = readFileSync(resolve(process.cwd(), "supabase/functions/silvio-daily-briefing/index.ts"), "utf8");

  it("nel modo all_companies legge gli stati delle aziende e passa da destinatariBriefing", () => {
    const blocco = fonte.slice(fonte.indexOf('mode === "all_companies"'), fonte.indexOf("if (targets.length === 0)"));
    expect(blocco).toContain('.from("companies").select("id, status")');
    expect(blocco).toContain("destinatariBriefing(preferenze, statoAzienda,");
  });

  it("i briefing chiesti a mano (utente, azienda) non passano dal filtro", () => {
    const manuali = fonte.slice(fonte.indexOf('mode === "user" && body.user_id'), fonte.indexOf('mode === "all_companies"'));
    expect(manuali).not.toContain("destinatariBriefing");
  });

  it("dice quanti ne ha saltati, nella risposta e nel log", () => {
    expect(fonte).toContain("skipped_by_status: saltatiPerStato");
    expect(fonte).toContain("utenti saltati: azienda sospesa, scaduta o cessata");
  });
});
