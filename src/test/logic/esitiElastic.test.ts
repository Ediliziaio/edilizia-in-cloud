/**
 * Gli esiti delle email Elastic Email arrivano in piattaforma (07/11/2026).
 *
 * Fino a oggi delle 3.255 email Elastic dell'ultimo mese nessuna aveva una
 * consegna, un'apertura, un click o un rimbalzo registrati: il webhook non
 * era mai stato chiamato. Ora elastic-email-esiti legge gli eventi da
 * GET /v4/events e li scrive con email_esiti_registra().
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  esitiDaEventi,
  esitoDaEvento,
  inizioFinestra,
  nuovoCursore,
  rimbalzoDefinitivo,
  SOVRAPPOSIZIONE_MS,
  TIPI_EVENTO_ELASTIC,
} from "../../../supabase/functions/_shared/esitiElastic";

const ROOT = join(__dirname, "../../..");
const ev = (p: Record<string, unknown>) => ({ MsgID: "msg-1", TransactionID: "tx-1", To: "Mario@Esempio.it", EventDate: "2026-11-07T06:00:00Z", ...p });

describe("da evento Elastic a esito", () => {
  it.each([
    ["Sent", "consegnata"],
    ["Open", "aperta"],
    ["Click", "cliccata"],
    ["Complaint", "reclamo"],
    ["Unsubscribe", "disiscrizione"],
  ])("%s → %s", (tipo, atteso) => {
    expect(esitoDaEvento(ev({ EventType: tipo }))?.tipo).toBe(atteso);
  });

  it("l'indirizzo esce in minuscolo e la data in ISO", () => {
    const e = esitoDaEvento(ev({ EventType: "Open" }));
    expect(e).toMatchObject({ email: "mario@esempio.it", quando: "2026-11-07T06:00:00.000Z", msg_id: "msg-1", transaction_id: "tx-1" });
  });

  it("i tentativi ripetuti e gli invii in coda non interessano", () => {
    expect(esitoDaEvento(ev({ EventType: "FailedAttempt" }))).toBeNull();
    expect(esitoDaEvento(ev({ EventType: "Submission" }))).toBeNull();
    expect(esitoDaEvento(ev({ EventType: "TipoNuovo" }))).toBeNull();
  });

  it("senza identificativo non si aggancia a nessun invio: scartato", () => {
    expect(esitoDaEvento(ev({ EventType: "Open", MsgID: "", TransactionID: null }))).toBeNull();
  });

  it("senza data valida: scartato", () => {
    expect(esitoDaEvento(ev({ EventType: "Open", EventDate: "non-una-data" }))).toBeNull();
    expect(esitoDaEvento(ev({ EventType: "Open", EventDate: null }))).toBeNull();
  });

  it("esitiDaEventi tollera una risposta che non è un elenco", () => {
    expect(esitiDaEventi({ Error: "Access denied" })).toEqual([]);
    expect(esitiDaEventi([null, 3, ev({ EventType: "Sent" })])).toHaveLength(1);
  });
});

describe("un rimbalzo blocca l'indirizzo solo se l'indirizzo non esiste", () => {
  // Un blocco sbagliato toglie per sempre un indirizzo buono.
  it("casella inesistente o dominio senza posta → definitivo", () => {
    for (const c of ["NoMailbox", "DNSProblem", "BadEmailAddress", "nomailbox"]) {
      expect(rimbalzoDefinitivo(c), c).toBe(true);
      expect(esitoDaEvento(ev({ EventType: "Bounce", MessageCategory: c }))?.tipo).toBe("rimbalzo_definitivo");
    }
  });

  it("spam, blacklist, casella piena, timeout → non consegnata, senza blocco", () => {
    for (const c of ["Spam", "BlackListed", "AccountProblem", "Timeout", "GreyListed", "Unknown", null]) {
      expect(rimbalzoDefinitivo(c), String(c)).toBe(false);
      expect(esitoDaEvento(ev({ EventType: "Bounce", MessageCategory: c }))?.tipo).toBe("non_consegnata");
    }
  });

  it("il motivo tiene categoria e messaggio, accorciato", () => {
    const e = esitoDaEvento(ev({ EventType: "Bounce", MessageCategory: "NoMailbox", Message: "550 5.1.1 user unknown " + "x".repeat(400) }));
    expect(e?.motivo?.startsWith("NoMailbox: 550 5.1.1 user unknown")).toBe(true);
    expect(e?.motivo?.length).toBeLessThanOrEqual(300);
  });
});

describe("il cursore", () => {
  const primo = new Date("2026-10-08T00:00:00Z");

  it("senza cursore si parte dallo storico", () => {
    expect(inizioFinestra(null, primo)).toEqual(primo);
    expect(inizioFinestra("non-una-data", primo)).toEqual(primo);
  });

  it("col cursore si riparte un po' prima: rileggere è innocuo, perdere no", () => {
    const c = "2026-11-07T06:00:00.000Z";
    expect(inizioFinestra(c, primo).getTime()).toBe(new Date(c).getTime() - SOVRAPPOSIZIONE_MS);
  });

  it("avanza all'evento più recente letto, mai indietro", () => {
    const esiti = esitiDaEventi([ev({ EventType: "Open", EventDate: "2026-11-07T05:00:00Z" }), ev({ EventType: "Sent", EventDate: "2026-11-07T07:00:00Z" })]);
    expect(nuovoCursore(esiti, "2026-11-07T06:00:00Z")).toBe("2026-11-07T07:00:00.000Z");
    expect(nuovoCursore([], "2026-11-07T06:00:00Z")).toBe("2026-11-07T06:00:00Z");
    expect(nuovoCursore(esitiDaEventi([ev({ EventType: "Open", EventDate: "2026-11-01T00:00:00Z" })]), "2026-11-07T06:00:00.000Z")).toBe("2026-11-07T06:00:00.000Z");
  });

  it("si chiedono a Elastic solo i tipi che servono", () => {
    expect([...TIPI_EVENTO_ELASTIC].sort()).toEqual(["Bounce", "Click", "Complaint", "Open", "Sent", "Unsubscribe"]);
  });
});

describe("la funzione e la scrittura", () => {
  const funzione = readFileSync(join(ROOT, "supabase/functions/elastic-email-esiti/index.ts"), "utf8");
  const migrazione = readFileSync(join(ROOT, "supabase/migrations/20281218100000_email_esiti_elastic.sql"), "utf8");

  it("chiamabile solo dal cron o dal service role, e risponde in fretta a pg_net", () => {
    expect(funzione).toContain("if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();");
    expect(funzione).toContain('serveConMetricheRapida("elastic-email-esiti"');
  });

  it("l'anteprima non scrive niente", () => {
    const anteprima = funzione.slice(funzione.indexOf("if (corpo.anteprima === true)"), funzione.indexOf("// ── Diagnosi"));
    expect(anteprima).not.toMatch(/\.rpc\(|\.upsert\(|\.update\(|\.insert\(/);
  });

  it("la diagnosi non tocca gli invii: scrive solo il proprio risultato", () => {
    const diagnosi = funzione.slice(funzione.indexOf("// ── Diagnosi"), funzione.indexOf("// ── Giro normale"));
    expect(diagnosi).not.toMatch(/\.rpc\(|\.update\(|\.insert\(/);
    expect(diagnosi.match(/\.upsert\(/g)?.length).toBe(1);
    expect(diagnosi).toContain('"email_esiti_elastic_diagnosi"');
    // Negli esempi salvati l'indirizzo è coperto.
    expect(diagnosi).toContain('r.recipient.replace(/^[^@]+/, "***")');
  });

  it("i rimborsi del credito valgono solo da quando l'import è partito", () => {
    expect(funzione).toContain("e.quando < rimborsiDal");
    expect(funzione).toContain('"email_esiti_elastic_rimborsi_dal"');
  });

  it("il cursore avanza solo se la pagina è stata scritta, e si salva pagina per pagina", () => {
    expect(funzione).toContain('if (error) { errore = `email_esiti_registra: ${error.message}`; break; }');
    const ciclo = funzione.slice(funzione.indexOf("for (let p = 0; p < PAGINE_MAX"), funzione.indexOf("if (errore) console.error"));
    // Il salvataggio del cursore sta DENTRO il ciclo, dopo la scrittura della pagina.
    expect(ciclo.indexOf("CHIAVE_CURSORE")).toBeGreaterThan(ciclo.indexOf('admin.rpc("email_esiti_registra"'));
  });

  it("il riepilogo somma tutte le pagine, non solo l'ultima", () => {
    expect(funzione).toContain("totale.scritti[k] = (totale.scritti[k] ?? 0) + (Number(v) || 0);");
  });

  it("la funzione SQL è chiusa: solo service role", () => {
    expect(migrazione).toContain("revoke all on function public.email_esiti_registra(jsonb) from public, anon, authenticated;");
    expect(migrazione).toContain("grant execute on function public.email_esiti_registra(jsonb) to service_role;");
  });

  it("tiene il primo istante e non blocca indirizzi che non c'entrano con i nostri invii", () => {
    expect(migrazione).toContain("opened_at       = coalesce(d.opened_at, a.aperta, a.cliccata)");
    expect(migrazione.match(/join public\.email_delivery_log d on d\.provider_id = l\.provider_id and d\.provider = 'elastic_email'/g)?.length).toBe(3);
  });

  it("protetta contro i lock lunghi", () => {
    expect(migrazione).toContain("set local lock_timeout = '3s';");
  });
});
