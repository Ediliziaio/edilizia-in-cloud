/**
 * Niente di nuovo senza permesso (03/11/2026).
 *
 * L'analisi dei permessi ha trovato pagine e file aperti a chiunque fosse loggato, perché
 * nascevano senza che nessuno decidesse chi doveva vederli. Qui la decisione diventa
 * obbligatoria: una pagina o una tabella nuova senza permesso fa fallire i test.
 * Se è davvero per tutti, va scritto: nell'elenco qui sotto o con un commento in migrazione.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROTTE = readFileSync("src/routes/companyRoutes.tsx", "utf8");
const CARTELLA = "supabase/migrations";
/** Da qui in poi valgono le regole: il pregresso si sistema a gruppi, con il piano permessi. */
const PRIMA_MIGRAZIONE_CONTROLLATA = "20281118090000";

/** Pagine aperte a tutti gli utenti dell'azienda, di proposito. */
const ROTTE_PER_TUTTI = new Set([
  "/azienda/*", "onboarding/vertical", "upgrade", "preview-demo", "mio-profilo", "notifiche", "crediti",
  "abbonamento", "impostazioni", "silvio-ai", "chat", "attivita",
  // Si protegge da sola, scheda per scheda (src/lib/manodopera/schede.ts).
  "manodopera",
  // Solo rimandi: la pagina di arrivo ha il suo permesso.
  "commesse/:id", "commesse/:id/diario", "commesse/:id/modifica", "interventi/:id", "interventi/:id/chiudi",
  "fatturazione", "fatturazione/:id", "acquisti-da-fare",
  // Ritorni dai login esterni.
  "impostazioni/integrazioni/email-callback", "impostazioni/integrazioni/calendar-callback",
  "impostazioni/integrazioni/gbp-callback", "impostazioni/integrazioni/google-ads-callback",
  "impostazioni/integrazioni/fic-callback",
]);

function rotteSenzaPermesso(sorgente: string): string[] {
  const trovate: string[] = [];
  for (const m of sorgente.matchAll(/<Route\b([\s\S]*?)(\/>|>\s*\n)/g)) {
    const corpo = m[1];
    const percorso = corpo.match(/path="([^"]+)"/)?.[1];
    if (!percorso || !corpo.includes("element=")) continue;
    if (/Navigate|withCompanyPermission|RequireCompanyPermission|ProtectedRoute/.test(corpo)) continue;
    trovate.push(percorso);
  }
  return trovate;
}

function migrazioniNuove(): { nome: string; testo: string }[] {
  return readdirSync(CARTELLA)
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= PRIMA_MIGRAZIONE_CONTROLLATA)
    .map((nome) => ({ nome, testo: readFileSync(join(CARTELLA, nome), "utf8") }));
}

describe("le novità nascono con un permesso", () => {
  it("ogni pagina dell'azienda ha un permesso o è scritta tra quelle per tutti", () => {
    const scoperte = rotteSenzaPermesso(ROTTE).filter((r) => !ROTTE_PER_TUTTI.has(r));
    expect(scoperte).toEqual([]);
  });

  it("riconosce una pagina nuova senza permesso", () => {
    expect(rotteSenzaPermesso(`<Route path="nuova" element={<Pagina />} />\n`)).toEqual(["nuova"]);
    expect(rotteSenzaPermesso(`<Route path="ok" element={withCompanyPermission("canViewOrders", <Pagina />)} />\n`)).toEqual([]);
  });

  it("nessun archivio di file aperto a chiunque sia loggato", () => {
    for (const { nome, testo } of migrazioniNuove()) {
      for (const m of testo.matchAll(/create policy[\s\S]*?on storage\.objects[\s\S]*?;/gi)) {
        expect(m[0], `${nome}: regola sui file senza controllo dell'azienda`).not.toMatch(/auth\.uid\(\)\s+is\s+not\s+null\s*\)?\s*\)?\s*;/i);
      }
    }
  });

  it("ogni tabella aziendale nuova dichiara chi la vede", () => {
    for (const { nome, testo } of migrazioniNuove()) {
      for (const m of testo.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
        if (!/\bcompany_id\b/.test(m[2])) continue;
        const dichiarata = new RegExp(`permesso\\s+${m[1]}:`, "i").test(testo);
        const controllata = /has_permission|puo_vedere_finanza|e_amministratore_di|aziende_con_permesso/.test(testo);
        expect(dichiarata || controllata, `${nome}: la tabella ${m[1]} non dice chi può vederla`).toBe(true);
      }
    }
  });

  it("nessuna vista nuova salta le regole di chi la legge", () => {
    for (const { nome, testo } of migrazioniNuove()) {
      for (const m of testo.matchAll(/create (?:or replace )?view\s+(?:public\.)?(\w+)([\s\S]*?)\bas\b/gi)) {
        expect(/security_invoker/i.test(m[2]), `${nome}: la vista ${m[1]} deve avere security_invoker`).toBe(true);
      }
    }
  });
});
