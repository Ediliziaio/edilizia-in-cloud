import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * «Stile umano»: l'email a freddo deve sembrare scritta da una persona dal suo
 * client di posta, non da un sistema. L'involucro lo è già (intestazioni,
 * Message-ID, data, From, HTML). Restavano tre impronte che una persona non
 * lascia mai — List-Unsubscribe, link di disiscrizione tracciato, pixel — e
 * una cosa che una persona fa sempre: citare il messaggio a cui risponde.
 */
describe("Stile umano nel dispatcher", () => {
  const d = leggi("supabase/functions/outreach-dispatch/index.ts");
  const migrazione = leggi("supabase/migrations/20280914000005_outreach_stile_umano.sql");

  it("è una scelta del brand, accesa di default", () => {
    expect(migrazione).toContain("ADD COLUMN IF NOT EXISTS stile_umano boolean NOT NULL DEFAULT true");
    expect(d).toContain("const stileUmano = brand?.stile_umano !== false;");
    expect(d).toContain("tracking_base_url,new_per_day,stile_umano");
  });

  it("niente List-Unsubscribe", () => {
    expect(d).toContain("const unsubHeaders = unsubscribeUrl && !stileUmano");
  });

  it("niente pixel, anche se la sequenza lo chiedesse", () => {
    expect(d).toContain("if (trackOpens && !plainOnly && !stileUmano)");
  });

  it("niente riga automatica dopo la firma: lo schema del brand finisce lì", () => {
    // La riga "rispondimi anche solo «no»…" (con la base giuridica GDPR
    // davanti) la aggiungeva IL DISPATCHER, non il testo del brand — e per un
    // brand con lo schema fisso "poi firma e numero. Nient'altro" (ThermoDMR,
    // 11/09/2026) quella riga extra rompeva proprio lo schema. Il footer per
    // lo stile umano è ora vuoto: l'invito a rispondere resta nel corpo
    // scritto dal brand (dove ogni brand lo dice a modo suo, o non lo dice).
    // La frase resta ancora per i brand NON a stile umano (link tracciato) —
    // qui si verifica solo che lo stile umano non la usi più.
    expect(d).not.toContain("rispondimi anche solo «no» e non ti scrivo più");
    expect(d).toContain('const gdpr = enr && !stileUmano ?');
    expect(d).toMatch(/stileUmano\s*\n\s*\?\s*""/);
  });

  it("chi risponde viene comunque capito: il gestore classifica l'intento e ferma/opt-out", () => {
    // Il meccanismo di opt-out resta "rispondi per uscire", anche senza la
    // riga automatica: ogni email del brand invita già a rispondere per un
    // motivo concreto, e l'ultima di ogni sequenza offre esplicitamente
    // l'opzione "toglimi dalla lista".
    const gestore = leggi("supabase/functions/_shared/outreach-reply-handler.ts");
    expect(gestore).toContain('intent === "not_interested"');
    expect(gestore).toContain('intent === "unsubscribe"');
  });

  it("i follow-up citano il messaggio precedente, nel testo con «> »", () => {
    expect(d).toContain("citazione = citazionePrecedente(");
    expect(d).toContain("html += citazione.html;");
    expect(d).toContain("htmlToPlainText(corpo) + citazione.testo");
    // e per citarlo il testo spedito viene conservato nei precedenti
    expect(d).toContain('.select("message_id,subject,provider_thread_id,sent_at,sender_account_id,body")');
  });

  it("il Reply-To non compare quando è uguale al mittente (già così, e resta così)", () => {
    const pool = leggi("supabase/functions/_shared/outreachMailboxSend.ts");
    expect(pool).toContain('if (msg.replyTo && msg.replyTo.toLowerCase() !== sender.email.toLowerCase()) headers["Reply-To"] = msg.replyTo;');
  });

  it("l'interruttore è nel brand", () => {
    const ui = leggi("src/components/admin/outreach/OutreachBrands.tsx");
    expect(ui).toContain("stile_umano: stileUmano");
    expect(ui).toContain("Stile umano: email che sembrano scritte a mano");
  });
});
