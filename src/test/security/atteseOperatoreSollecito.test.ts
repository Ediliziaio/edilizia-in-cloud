/// <reference types="node" />
/**
 * Chi chiede una persona non deve aspettare un mese (27/10/2026).
 *
 * Il Bagno Group: Raffaela Campitiello ha scritto «devo parlare con qualcuno» il 29 settembre. L'assistente ha
 * passato la scheda in «Intervento operatore» e mandato la campanella; nessuno l'ha richiamata per 28 giorni, e
 * con lei altre tre persone (la più vecchia da 43 giorni). Ora, ogni giorno, chi amministra l'azienda riceve
 * l'elenco per email, non solo una campanella che nessuno guarda.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sql = (() => {
  const dir = join(process.cwd(), "supabase/migrations");
  const f = readdirSync(dir).find((x) => x.endsWith("_attese_operatore_sollecito.sql"));
  expect(f, "migrazione attese_operatore_sollecito").toBeTruthy();
  return readFileSync(join(dir, f!), "utf8");
})();
const fn = leggi("supabase/functions/attese-operatore-sollecito/index.ts");

describe("chi conta come «in attesa»", () => {
  it("la fase scelta dall'azienda nell'agente, non la pausa del bot", () => {
    // Un bot in pausa può essere una scelta (BeMade ne ha decine): si guarda il CRM.
    expect(sql).toContain("a.tools_config->'lead_whatsapp'->>'fase_operatore_id'");
    expect(sql).not.toContain("bot_in_pausa");
  });
  it("chi ha già ricevuto risposta non è più in attesa", () => {
    expect(sql).toMatch(/not exists \(\s*select 1 from whatsapp_messages m[\s\S]*?m\.direction = 'outbound' and m\.created_at > o\.stage_changed_at/);
  });
  it("solo dopo qualche ora, e mai le schede nel cestino", () => {
    expect(sql).toContain("o.stage_changed_at < now() - make_interval(hours => greatest(1, coalesce(p_ore, 4)))");
    expect(sql).toContain("o.deleted_at is null");
  });
});

describe("l'avviso", () => {
  it("campanella una volta al giorno per azienda", () => {
    expect(sql).toMatch(/n\.type = 'attesa_operatore'\s*\n\s*and n\.created_at > now\(\) - interval '24 hours'/);
  });
  it("email agli amministratori con nomi, telefoni e da quanto aspettano", () => {
    expect(fn).toContain("aspetta ${daQuando(Number(p.giorni) || 0)}");
    expect(fn).toContain("p.telefono");
    expect(sql).toMatch(/role = 'company_admin'::public\.app_role/);
  });
  it("parte anche col credito email a zero: è un avviso di servizio", () => {
    expect(fn).toContain("skipCredits: true");
  });
  it("l'email non si manda se la campanella dice che è già stato fatto oggi", () => {
    expect(fn).toContain("if (!esito?.avvisato) continue;");
  });
  it("i nomi dei clienti finiscono in HTML senza poterlo rompere", () => {
    expect(fn).toContain("const esc = (s: string) =>");
    expect(fn).toContain("${esc(p.chi)}");
  });
  it("si apre solo col segreto dei cron e si può puntare su una sola azienda", () => {
    expect(fn).toContain("if (!cronSecretValido(req)) return errorResponse(\"Non autorizzato\", 401, corsH);");
    expect(fn).toContain("p_company_id: corpo.company_id ?? null");
  });
  it("le funzioni del database sono chiuse a chiave", () => {
    expect(sql).toContain("revoke all on function public.attese_operatore_da_sollecitare(uuid, integer) from public, anon;");
    expect(sql).toContain("revoke all on function public.avvisa_attese_operatore(uuid, integer, integer) from public, anon, authenticated;");
  });
});

describe("come si legge l'attesa", () => {
  it("«da oggi», «da ieri», «da N giorni»", () => {
    expect(fn).toContain('if (giorni <= 0) return "da oggi";');
    expect(fn).toContain('if (giorni === 1) return "da ieri";');
    expect(fn).toContain("return `da ${giorni} giorni`;");
  });
  it("singolare e plurale", () => {
    expect(fn).toContain('riga.quante === 1 ? "Una persona aspetta" : `${riga.quante} persone aspettano`');
  });
});
