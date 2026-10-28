/// <reference types="node" />
/**
 * Il canale WhatsApp fermo si dice subito (27/10/2026).
 *
 * Il Bagno Group: dal 1° ottobre Meta respingeva ogni messaggio ai lead con «problema di pagamento sull'account»
 * (131042). 77 messaggi mai partiti in 26 giorni, nessuna risposta dai clienti, nessun appuntamento fissato
 * dall'assistente — e nessun avviso a nessuno: il motivo stava solo in whatsapp_messages.delivery_error.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODICI_CANALE_FERMO, MOTIVO_SALVATO, canaleFermo, codiceDalMotivoSalvato, cosaFarePerRipartire } from "../../../supabase/functions/_shared/whatsappCanaleFermo.ts";
import { codiceMancataConsegna, motivoMancataConsegna } from "../../../supabase/functions/whatsapp-webhook/esitoConsegna.ts";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("quali errori fermano il canale", () => {
  it("131042 (pagamento) è il caso di Il Bagno Group: canale fermo", () => {
    expect(canaleFermo(131042)).toBe(true);
    expect(CODICI_CANALE_FERMO[131042]).toContain("pagamento");
  });
  it("account bloccato e numero non registrato fermano il canale", () => {
    for (const c of [368, 131031, 131045, 131048]) expect(canaleFermo(c), String(c)).toBe(true);
  });
  it("il rifiuto del singolo destinatario NON è un allarme", () => {
    // Numero non su WhatsApp, fuori dalle 24 ore, cliente che ha bloccato, troppi messaggi a quel numero, modello.
    for (const c of [131026, 131047, 131050, 131056, 132001, 132015]) expect(canaleFermo(c), String(c)).toBe(false);
    expect(canaleFermo(null)).toBe(false);
  });
  it("il codice si legge dalla risposta di Meta, e il motivo resta in italiano", () => {
    const errori = [{ code: 131042, title: "Business eligibility payment issue" }];
    expect(codiceMancataConsegna(errori)).toBe(131042);
    expect(motivoMancataConsegna(errori)).toBe("problema di pagamento sull'account Meta");
    expect(codiceMancataConsegna(null)).toBeNull();
    expect(codiceMancataConsegna([{ title: "senza codice" }])).toBeNull();
  });
});

describe("il webhook avvisa quando il canale si ferma", () => {
  const router = leggi("supabase/functions/whatsapp-webhook/router.ts");
  it("solo sui messaggi falliti, e solo per i codici del canale", () => {
    expect(router).toContain('if (status.status === "failed" && aggiornati?.length)');
    expect(router).toContain("if (canaleFermo(codice) && riga.company_id)");
    expect(router).toContain("segnalaCanaleWhatsAppFermo(supabase,");
  });
  it("l'azienda la si ricava dalla riga aggiornata, non da una lettura in più", () => {
    expect(router).toContain('.select("company_id, from_phone")');
  });
});

describe("l'avviso arriva all'azienda e a noi", () => {
  const allarme = leggi("supabase/functions/_shared/allarmeWhatsApp.ts");
  const sql = (() => {
    const dir = join(process.cwd(), "supabase/migrations");
    const f = readdirSync(dir).find((x) => x.endsWith("_avviso_whatsapp_canale_fermo.sql"));
    expect(f, "migrazione avviso_whatsapp_canale_fermo").toBeTruthy();
    return readFileSync(join(dir, f!), "utf8");
  })();

  it("campanella agli amministratori dell'azienda, una volta ogni 24 ore", () => {
    expect(sql).toContain("insert into public.notifications");
    expect(sql).toMatch(/role = 'company_admin'::public\.app_role/);
    expect(sql).toMatch(/n\.type = 'whatsapp_canale_fermo'\s*\n\s*and n\.created_at > now\(\) - interval '24 hours'/);
  });
  it("email all'azienda anche col credito a zero: è un guasto, non una campagna", () => {
    expect(allarme).toContain("skipCredits: true");
    expect(allarme).toMatch(/subject: "URGENTE — I messaggi WhatsApp non partono più"/);
  });
  it("email anche a noi, con azienda, numero e codice", () => {
    expect(allarme).toContain('tipo: "whatsapp_account_bloccato"');
    // I tipi che iniziano per whatsapp_ vanno per email al titolare (avvisoEmail.vaPerEmail).
    expect(allarme).toContain('["Errore Meta", String(p.codice)]');
    expect(allarme).toContain('["Cosa deve fare il cliente", cosaFare]');
  });
  it("ogni guasto dice cosa fare per ripartire", () => {
    const puro = leggi("supabase/functions/_shared/whatsappCanaleFermo.ts");
    for (const c of Object.keys(CODICI_CANALE_FERMO)) expect(cosaFarePerRipartire(Number(c)).length, c).toBeGreaterThan(30);
    expect(puro).toContain("business.facebook.com");
  });
  it("l'avviso non può far fallire il webhook, e la funzione è chiusa a chiave", () => {
    expect(allarme).toMatch(/catch \(e\) \{\s*console\.error\("\[allarmeWhatsApp\]/);
    expect(sql).toContain("revoke all on function public.avvisa_whatsapp_account_bloccato(uuid, text, text, integer) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.avvisa_whatsapp_account_bloccato(uuid, text, text, integer) to service_role;");
    expect(sql).toContain("set local lock_timeout = '3s';");
  });
});

describe("riconoscere un canale già fermo dai messaggi respinti nei giorni scorsi", () => {
  it("dal testo salvato in delivery_error si risale al codice", () => {
    // Il caso di Il Bagno Group, come sta scritto nel database.
    expect(codiceDalMotivoSalvato("problema di pagamento sull'account Meta")).toBe(131042);
    expect(codiceDalMotivoSalvato("l'account WhatsApp Business è bloccato")).toBe(131031);
  });
  it("i rifiuti del singolo destinatario non si riconoscono come canale fermo", () => {
    expect(codiceDalMotivoSalvato("il numero non è su WhatsApp o non può ricevere il messaggio")).toBeNull();
    expect(codiceDalMotivoSalvato("")).toBeNull();
    expect(codiceDalMotivoSalvato(null)).toBeNull();
  });
  it("i testi restano quelli che il webhook salva davvero (altrimenti non si riconoscono più)", () => {
    const esito = leggi("supabase/functions/whatsapp-webhook/esitoConsegna.ts");
    for (const [codice, testo] of Object.entries(MOTIVO_SALVATO)) {
      expect(esito, `MOTIVI[${codice}]`).toContain(`${codice}: "${testo}"`);
    }
  });
});

describe("il giro che cerca i canali fermi", () => {
  const fn = leggi("supabase/functions/whatsapp-canale-controllo/index.ts");
  it("guarda solo i messaggi in uscita respinti, e una volta sola per azienda", () => {
    expect(fn).toContain('.eq("direction", "outbound").eq("delivery_status", "failed")');
    expect(fn).toContain("if (!riga.company_id || perAzienda.has(riga.company_id)) continue;");
    expect(fn).toContain("if (canaleFermo(codice))");
  });
  it("si apre solo col segreto dei cron", () => {
    expect(fn).toContain("if (!cronSecretValido(req)) return errorResponse(\"Non autorizzato\", 401, corsH);");
  });
  it("si può puntare su una sola azienda, per avvisarla subito", () => {
    expect(fn).toContain('if (corpo.company_id) q = q.eq("company_id", corpo.company_id);');
  });
});
