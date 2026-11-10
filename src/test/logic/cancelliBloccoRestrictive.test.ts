/**
 * I cancelli d'accesso devono essere RESTRICTIVE (10/11/2026).
 *
 * Percorso di destinazione: src/test/logic/cancelliBloccoRestrictive.test.ts
 * (lo sposta la sessione principale quando applica la migrazione).
 *
 * In Postgres le policy PERMISSIVE si sommano in OR, le RESTRICTIVE in AND.
 * Un cancello come «l'utente bloccato non fa niente», scritto `for all` senza
 * `as restrictive`, non vieta: CONCEDE tutto a chiunque non sia bloccato, e
 * annulla le policy per azienda scritte due righe sopra. E' successo tre volte
 * (articoli_native_documenti, warehouse_rincari, cg_rimanenze_lavori) perche'
 * la riga sbagliata sembra identica a quella giusta: manca una parola.
 *
 * Il test riconosce la forma pericolosa — una policy `for all` PERMISSIVE il
 * cui USING e' solo una funzione-cancello negata, senza azienda ne' identita' —
 * e pretende che per ognuna la migrazione di correzione la tolga o la rifaccia
 * RESTRICTIVE. Un cancello nuovo scritto nel modo sbagliato non sarebbe
 * nell'elenco della correzione, e qui diventerebbe rosso.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const DIR = join(ROOT, "supabase/migrations");
const leggi = (f: string) => readFileSync(join(DIR, f), "utf8");

const CORREZIONE = "20290216090000_cancelli_blocco_restrictive.sql";
const correzione = leggi(CORREZIONE);

/**
 * La forma pericolosa non e' «una policy senza company_id scritto dentro»:
 * un'autorizzazione puo' passare da una funzione che guarda un'entita'
 * collegata, ed e' legittima. Il 10/11/2026 la prima versione di questo test
 * segnalava `sal_voci_sottofasi_scrittura`, che invece il soggetto ce l'ha:
 * `puo_modificare_commessa(s.order_id)`, cioe' il permesso su quella commessa.
 *
 * Quello che non va bene e' un `for all` PERMISSIVE il cui USING e' SOLO uno o
 * piu' cancelli negati — «non sei bloccato», «non sei solo-campo» — e nient'
 * altro: non dice chi puo', dice solo chi non puo', e in OR con le policy per
 * azienda le annulla. Si riconosce togliendo i cancelli noti dal corpo: se non
 * resta nessuna condizione, non c'era nessun soggetto.
 */
const CANCELLI = /(utente_bloccato|e_solo_campo|utente_e_cliente_esterno)\s*\(\s*\)/gi;

/**
 * Il soggetto puo' stare anche nel RUOLO, non solo nella condizione: una
 * policy `for all to service_role using (true)` non e' aperta a nessuno che
 * non sia il servizio. Pericolose sono solo quelle concesse a una platea
 * larga — `authenticated`, `public`, o nessun `to`.
 */
function platealarga(corpo: string): boolean {
  const m = corpo.match(/\bto\s+([a-z_][a-z_,\s]*?)\s*(?:using|with\s+check|$)/i);
  if (!m) return true; // nessun `to`: vale per tutti i ruoli
  const ruoli = m[1].split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  return ruoli.some((r) => r === "authenticated" || r === "public");
}

/** Il corpo senza i cancelli negati: se non resta niente, non c'era nessun soggetto. */
function restaQualcosa(corpo: string): boolean {
  const resto = corpo
    // Prima il `to <ruoli>`: il ruolo l'ha gia' guardato platealarga, e se lo
    // si togliesse dopo `using` la parola «authenticated» resterebbe nel
    // corpo e farebbe sembrare che un soggetto ci sia.
    .replace(/\bto\s+[a-z_][a-z_,\s]*?(?=using|with\s+check|$)/gi, " ")
    .replace(/\busing\b|\bwith\s+check\b/gi, " ")
    .replace(CANCELLI, " ")
    .replace(/\bselect\b|\bpublic\b|\bas\b|\band\b|\bor\b|\bnot\b|\btrue\b/gi, " ")
    .replace(/[()\s.,]/g, "");
  return resto.length > 0;
}

type Policy = { file: string; nome: string; tabella: string; restrictive: boolean; corpo: string };

/** Ogni `create policy … for all` dei file di migrazione. */
function policyPerTutto(): Policy[] {
  const re =
    /create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+((?:as\s+restrictive\s+)?)for\s+all\b([^;]*)/gi;
  const tutte: Policy[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql"))) {
    for (const m of leggi(file).matchAll(re)) {
      tutte.push({
        file,
        nome: m[1],
        tabella: m[2],
        restrictive: /restrictive/i.test(m[3]),
        corpo: m[4].replace(/\s+/g, " ").trim(),
      });
    }
  }
  return tutte;
}

/** La forma pericolosa: `for all` PERMISSIVE il cui USING e' solo cancelli negati. */
const cancelliAperti = policyPerTutto().filter(
  (p) => !p.restrictive && platealarga(p.corpo) && !restaQualcosa(p.corpo),
);

describe("Nessun cancello resta PERMISSIVE for all", () => {
  it("ne trova almeno quelli già noti: se l'elenco si svuota, il test non guarda più niente", () => {
    expect(cancelliAperti.length).toBeGreaterThanOrEqual(4);
  });

  it.each(cancelliAperti.map((p) => [`${p.nome} on ${p.tabella} (${p.file})`, p] as const))(
    "%s è tolto o rifatto RESTRICTIVE dalla correzione",
    (_etichetta, p) => {
      const tolta = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${p.nome}\\s+on\\s+public\\.${p.tabella}\\s*;`, "i");
      expect(correzione, `${p.nome} su ${p.tabella} non è nell'elenco della correzione`).toMatch(tolta);

      // Se la correzione la ricrea, deve essere RESTRICTIVE.
      const rifatta = new RegExp(
        `create\\s+policy\\s+${p.nome}\\s+on\\s+public\\.${p.tabella}\\s+((?:as\\s+restrictive\\s+)?)for\\s+all`,
        "i",
      );
      const m = correzione.match(rifatta);
      if (m) expect(m[1], `${p.nome} è ricreata ma non RESTRICTIVE`).toMatch(/restrictive/i);
    },
  );
});

describe("La migrazione di correzione", () => {
  it("rimette i due cancelli di cg_rimanenze_lavori, che non ne avevano nessuno", () => {
    for (const nome of ["blocco_utente_bloccato", "permessi_solo_ufficio"]) {
      expect(correzione).toMatch(
        new RegExp(`create policy ${nome} on public\\.cg_rimanenze_lavori\\s+as restrictive for all to authenticated`),
      );
    }
  });

  it("non introduce essa stessa una PERMISSIVE for all senza soggetto", () => {
    const sue = policyPerTutto().filter((p) => p.file === CORREZIONE && !p.restrictive && platealarga(p.corpo) && !restaQualcosa(p.corpo));
    expect(sue.map((p) => p.nome)).toEqual([]);
  });

  it("è idempotente e non blocca la produzione", () => {
    expect(correzione).toContain("set local lock_timeout = '3s'");
    const drop = correzione.match(/drop policy if exists/g) ?? [];
    const create = correzione.match(/create policy/g) ?? [];
    expect(drop.length).toBeGreaterThanOrEqual(create.length);
  });

  it("si ferma da sola se una delle tre tabelle resta scoperta", () => {
    expect(correzione).toMatch(/raise exception 'su %: restano % policy PERMISSIVE FOR ALL/);
    expect(correzione).toMatch(/raise exception 'su %: manca la RESTRICTIVE del blocco utente/);
  });
});
