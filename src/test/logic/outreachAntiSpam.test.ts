import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Le email a freddo: quattro cose che le mandavano in spam, chiuse il
 * 10/09/2026 sull'audit del pool «Agenzia Infissi» ma scritte per qualunque
 * brand — domini, caselle e provider diversi compresi.
 */
describe("I link restano sul dominio di chi scrive", () => {
  const proxy = leggi("functions/l/[[path]].js");
  const dispatch = leggi("supabase/functions/outreach-dispatch/index.ts");
  const migrazione = leggi("supabase/migrations/20280914000004_outreach_link_brand_e_nuovi_al_giorno.sql");

  it("il proxy Pages inoltra solo alle funzioni dei link, non è un relay aperto", () => {
    expect(proxy).toContain('new Set(["email-tracking", "outreach-track-open"])');
    expect(proxy).toContain('return testo("Link non valido.", 404)');
  });

  it("accetta anche il POST della disiscrizione one-click", () => {
    expect(proxy).toContain('request.method === "POST"');
    expect(proxy).toContain('redirect: "manual"');
  });

  it("il dispatcher usa la base del brand, poi la piattaforma, poi supabase", () => {
    expect(migrazione).toContain("ADD COLUMN IF NOT EXISTS tracking_base_url text");
    expect(dispatch).toContain("trackingBasePerBrand(item.brand_id ?? null)}/email-tracking");
    expect(dispatch).toContain("outreachOpenPixelUrl(trackingBasePerBrand(item.brand_id ?? null), item.id)");
    expect(dispatch).not.toContain("${trackingBase}/email-tracking");
  });
});

describe("Il tetto dei nuovi contatti è separato dai follow-up", () => {
  const dispatch = leggi("supabase/functions/outreach-dispatch/index.ts");
  const enroll = leggi("supabase/functions/outreach-enroll/index.ts");
  const singolo = leggi("supabase/functions/outreach-send-single/index.ts");
  const migrazione = leggi("supabase/migrations/20280914000004_outreach_link_brand_e_nuovi_al_giorno.sql");

  it("chi accoda dice se è un primo contatto", () => {
    expect(enroll).toContain("primo_contatto: true");
    expect(singolo).toContain("primo_contatto: true");
    // i follow-up no
    expect(dispatch).toContain("scheduled_for: whenJ,\n    primo_contatto: false,");
    expect(migrazione).toContain("ADD COLUMN IF NOT EXISTS primo_contatto boolean NOT NULL DEFAULT false");
  });

  it("prima i primi contatti col loro tetto, poi i follow-up", () => {
    expect(dispatch).toContain("statoPerPrimiContatti(s, nuoviAlGiorno,");
    expect(dispatch).toContain("const primi = liberi.filter((qid) => queueById.get(qid)?.primo_contatto === true)");
    expect(dispatch).toContain("assignSenders(seguiti, conUsati(brandSendersPronti), today, today)");
  });

  it("follow-up e primi contatti si leggono dalla coda separati: un arretrato di primi non affama i follow-up", () => {
    expect(dispatch).toContain('.eq("status", "queued").eq("channel", "email").eq("primo_contatto", primo)');
    expect(dispatch).toContain("const [seguiti, primi] = await Promise.all([leggi(false), leggi(true)]);");
    expect(dispatch).toContain("queue = [...seguiti, ...primi];");
  });

  it("un brand in pausa non spedisce (lo stato del brand non è più solo un'etichetta)", () => {
    expect(dispatch).toContain('.from("outreach_brands").select("id,status,');
    expect(dispatch).toContain('if (statoBrand === "paused" || statoBrand === "archived") { result.deferred += ids.length; continue; }');
  });

  it("l'arruolamento lavora a ondate, anche da una lista automatica, e non salta la blocklist in silenzio", () => {
    expect(enroll).toContain('.from("marketing_contact_list_members")');
    expect(enroll).toContain("for (let i = 0; i < puliti.length && eligible.length < quanti; i += GRUPPO_MX)");
    expect(enroll).toContain("if (supErr) throw supErr;");
    expect(enroll).toContain("BUDGET_VALUTAZIONE_MS");
  });

  it("la cadenza per casella filtra le caselle prima dell'assegnazione", () => {
    expect(dispatch).toContain("cadenzaCasella({");
    expect(dispatch).toContain("if (!pronte.has(sid)) { result.deferred++; continue; }");
    expect(dispatch).toContain("unaAssegnazionePerCasella(assignments)");
  });

  it("il conteggio dei nuovi di oggi guarda solo i primi contatti spediti", () => {
    expect(dispatch).toContain('.eq("status", "sent").eq("primo_contatto", true)');
  });
});

describe("Il warm-up ha anche il lato ricezione", () => {
  const client = leggi("supabase/functions/_shared/imapSmtpClient.ts");
  const poll = leggi("supabase/functions/outreach-imap-poll/index.ts");

  it("cerca la cartella spam per come la chiama il server (RFC 6154)", () => {
    expect(client).toContain("/\\\\(Junk|Spam)\\b/i");
  });

  it("sposta in INBOX con MOVE, o COPY + Deleted dove MOVE manca; mai cancellazioni in INBOX", () => {
    const corpo = client.slice(client.indexOf("export async function imapCuraWarmup"));
    expect(corpo).toContain("UID MOVE ${uid} INBOX");
    expect(corpo).toContain("UID COPY ${uid} INBOX");
    expect(corpo).toContain("+FLAGS.SILENT (\\\\Seen)");
    // la \\Deleted la mette solo dopo una COPY riuscita, dentro la cartella spam
    expect(corpo.indexOf("UID STORE ${uid} +FLAGS.SILENT (\\\\Deleted)")).toBeGreaterThan(corpo.indexOf("UID COPY ${uid} INBOX"));
  });

  it("il poller la chiama per ogni casella, con le altre caselle del pool", () => {
    expect(poll).toContain("imapCuraWarmup(cfg, altre)");
    // e un messaggio che arriva da una casella del pool non è né bounce né risposta
    expect(poll).toContain('if (poolEmails?.has(mittente)) return "ignorato"');
  });
});
