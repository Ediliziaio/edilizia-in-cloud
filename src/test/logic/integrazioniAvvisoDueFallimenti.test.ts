/**
 * L'avviso sulle integrazioni conta i controlli falliti, non le ore (14/11/2026).
 *
 * Il 13/11/2026 è arrivata «Integrazione cloudflare in errore da 13 ore». Non
 * era in errore: il sito rispondeva 200 e l'API di Cloudflare pure. Era andato
 * lento UN controllo — 2.691 ms invece dei soliti 250 — e la chiamata a Pages
 * aveva sbattuto sul limite di 5 secondi.
 *
 * Le «13 ore» erano aritmetica, non un guasto: la guardia avvisava se l'ultima
 * risposta sana era più vecchia di 6 ore, ma il controllo gira ogni 12 ore. Un
 * qualunque singolo fallimento superava sempre la soglia, quindi la guardia non
 * ha mai potuto fare il suo mestiere.
 *
 * Qui gira la funzione VERA, letta dal file della migrazione, su PostgreSQL
 * vero: le dipendenze sono finte, la regola no.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;

/** La migrazione viva, cercata per nome: se la rinominano, il test lo dice. */
function migrazione(): string {
  const file = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith("_integrazioni_avviso_due_fallimenti.sql"));
  if (file.length !== 1) throw new Error(`attesa una migrazione, trovate ${file.length}`);
  return readFileSync(`supabase/migrations/${file[0]}`, "utf8");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create schema cron;
    -- Il cron esiste davvero in produzione; qui basta che la rete di sicurezza
    -- della migrazione lo trovi acceso.
    create table cron.job (jobname text, command text, active boolean);
    insert into cron.job values ('integrazioni-avviso-orario','SELECT public.integrazioni_avvisa()', true);

    create table integration_health_log (
      id uuid primary key default gen_random_uuid(),
      integration_name text not null,
      company_id uuid,
      status text,
      response_ms int,
      error_message text,
      checked_at timestamptz not null default now()
    );
    create table integrazioni_avvisi (
      integration_name text,
      avvisato_il timestamptz not null default now(),
      stato text, errore text, guasto_da timestamptz
    );
    create table profiles (id uuid primary key default gen_random_uuid(), email text);
    create table user_roles (user_id uuid, role text);

    -- Le email spedite finiscono qui invece che in posta.
    create table email_spedite (oggetto text, html text, destinatari text[]);
    create function battito_invia_email(p_destinatari text[], p_oggetto text, p_html text)
      returns void language sql as $$
        insert into email_spedite values (p_oggetto, p_html, p_destinatari);
      $$;
  `);
  await db.exec(`
    insert into profiles (id, email) values ('00000000-0000-0000-0000-0000000000a1','titolare@esempio.it');
    insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','super_admin');
  `);
  await db.exec(migrazione());
}, 60000);

afterAll(async () => db?.close());

beforeEach(async () => db.exec("begin"));
afterEach(async () => db.exec("rollback"));

/** Scrive una riga nel registro dei controlli, N ore fa. */
async function controllo(nome: string, stato: string, oreFa: number, errore: string | null = null) {
  await db.query(
    `insert into integration_health_log (integration_name, status, error_message, checked_at)
     values ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
    [nome, stato, errore, String(oreFa)],
  );
}

async function avvisa(): Promise<{ avvisi: number; integrazioni: string[] }> {
  const r = await db.query<{ integrazioni_avvisa: { avvisi: number; integrazioni: string[] } }>(
    "select public.integrazioni_avvisa()",
  );
  return r.rows[0].integrazioni_avvisa;
}

async function emailSpedite() {
  const r = await db.query<{ oggetto: string; html: string }>("select oggetto, html from email_spedite");
  return r.rows;
}

describe("il caso vero: Cloudflare, 13/11/2026", () => {
  beforeEach(async () => {
    // Verde ogni 12 ore per giorni, poi UN controllo storto.
    await controllo("cloudflare", "healthy", 36);
    await controllo("cloudflare", "healthy", 24);
    await controllo("cloudflare", "healthy", 13);
    await controllo("cloudflare", "degraded", 1, "Token valido, ma Cloudflare Pages non risponde: Signal timed out.");
  });

  it("un solo controllo fallito non manda nessuna email", async () => {
    expect(await avvisa()).toEqual({ avvisi: 0, integrazioni: [] });
    expect(await emailSpedite()).toHaveLength(0);
  });

  it("l'ultima risposta sana è di 13 ore prima, e non basta più a far partire l'avviso", async () => {
    const r = await db.query<{ ore: string }>(
      `select round(extract(epoch from (now() - max(checked_at)))/3600)::text ore
         from integration_health_log where integration_name='cloudflare' and status='healthy'`,
    );
    expect(Number(r.rows[0].ore)).toBe(13);
    expect((await avvisa()).avvisi).toBe(0);
  });
});

describe("un guasto vero invece si fa sentire", () => {
  it("al secondo controllo fallito di fila parte una sola email", async () => {
    await controllo("cloudflare", "healthy", 24);
    await controllo("cloudflare", "degraded", 13, "Signal timed out.");
    await controllo("cloudflare", "degraded", 1, "Signal timed out.");
    expect(await avvisa()).toEqual({ avvisi: 1, integrazioni: ["cloudflare"] });
    expect(await emailSpedite()).toHaveLength(1);
  });

  it("l'oggetto dice quanti controlli sono falliti, non quante ore", async () => {
    await controllo("cloudflare", "healthy", 30);
    await controllo("cloudflare", "down", 20, "Il token Cloudflare non è valido (HTTP 401).");
    await controllo("cloudflare", "down", 8, "Il token Cloudflare non è valido (HTTP 401).");
    await controllo("cloudflare", "down", 1, "Il token Cloudflare non è valido (HTTP 401).");
    await avvisa();
    const [mail] = await emailSpedite();
    expect(mail.oggetto).toBe("Integrazione cloudflare: 3 controlli falliti di fila");
    expect(mail.oggetto).not.toMatch(/ore/);
  });

  it("non afferma più che è «di solito un token scaduto»", async () => {
    await controllo("x", "healthy", 24);
    await controllo("x", "degraded", 13, "Signal timed out.");
    await controllo("x", "degraded", 1, "Signal timed out.");
    await avvisa();
    const [mail] = await emailSpedite();
    expect(mail.html).not.toMatch(/di solito è un token scaduto/);
    expect(mail.html).toMatch(/due controlli falliti di fila/);
    expect(mail.html).toMatch(/se parla di timeout, rete o nessuna risposta, di solito è il fornitore/);
  });

  it("una risposta sana in mezzo azzera il conto", async () => {
    await controllo("x", "degraded", 30, "giù");
    await controllo("x", "healthy", 20);
    await controllo("x", "degraded", 1, "giù di nuovo");
    expect((await avvisa()).avvisi).toBe(0);
  });

  it("mai stata sana: due fallimenti bastano lo stesso", async () => {
    await controllo("mai_sana", "down", 13, "giù");
    await controllo("mai_sana", "down", 1, "giù");
    expect((await avvisa()).avvisi).toBe(1);
  });
});

describe("le altre guardie restano in piedi", () => {
  it("un controllo fermo da più di due giorni è spento, non guasto", async () => {
    await controllo("vecchio", "down", 100, "giù");
    await controllo("vecchio", "down", 72, "giù");
    expect((await avvisa()).avvisi).toBe(0);
  });

  it("non si ripete entro 24 ore", async () => {
    await controllo("x", "healthy", 24);
    await controllo("x", "degraded", 13, "giù");
    await controllo("x", "degraded", 1, "giù");
    expect((await avvisa()).avvisi).toBe(1);
    expect((await avvisa()).avvisi).toBe(0);
    expect(await emailSpedite()).toHaveLength(1);
  });

  it("«unconfigured» non è un guasto", async () => {
    await controllo("spenta", "unconfigured", 13);
    await controllo("spenta", "unconfigured", 1);
    expect((await avvisa()).avvisi).toBe(0);
  });

  it("chi è tornato sano non viene avvisato", async () => {
    await controllo("x", "degraded", 25, "giù");
    await controllo("x", "degraded", 13, "giù");
    await controllo("x", "healthy", 1);
    expect((await avvisa()).avvisi).toBe(0);
  });
});
