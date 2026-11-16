/**
 * Una funzione dentro un indice serve a chiunque scriva su quella tabella (16/11/2026).
 *
 * `20290331130000` ha creato `private.cg_nome_norm` con l'EXECUTE al solo `authenticated` e
 * ci ha messo sopra un indice su `fatture_ricevute`. L'espressione di un indice si calcola a
 * ogni INSERT coi permessi di chi scrive: dal 15/11 ogni scrittura del `service_role` è morta
 * con «permission denied for function cg_nome_norm» — 403 — e le fatture ricevute non sono
 * più entrate da nessuna strada automatica (SDI, Openapi, OCR, allegati email). In silenzio.
 *
 * Qui si controlla che ogni funzione usata dentro un indice abbia l'EXECUTE anche per il
 * servizio. Il test guarda i file delle migrazioni: è la stessa fonte che crea indici e grant.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARTELLA = join(__dirname, "../../../supabase/migrations");

/** Le funzioni nominate dentro un `create index` (schema.funzione(). */
function funzioniNegliIndici(sql: string): string[] {
  const fuori = new Set<string>();
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index[\s\S]*?;/gi)) {
    // Via il nome della tabella («on public.fatture_ricevute»): non è una funzione.
    const corpo = m[0].replace(/\bon\s+(?:only\s+)?(?:private|public)\.[a-z0-9_]+/gi, " ");
    for (const f of corpo.matchAll(/\b(private|public)\.([a-z0-9_]+)\s*\(/gi)) {
      fuori.add(`${f[1].toLowerCase()}.${f[2].toLowerCase()}`);
    }
  }
  return [...fuori];
}

describe("gli indici e i permessi", () => {
  it("una funzione chiusa e usata dentro un indice resta eseguibile dal servizio", () => {
    const file = readdirSync(CARTELLA).filter((f) => f.endsWith(".sql"));
    const tutto = file.map((f) => readFileSync(join(CARTELLA, f), "utf8"));
    const usate = new Set<string>();
    for (const sql of tutto) for (const f of funzioniNegliIndici(sql)) usate.add(f);

    const senzaGrant = [...usate].filter((nome) => {
      const punto = nome.replace(".", "\\.");
      // Solo le funzioni a cui qualcuno ha tolto il permesso di serie: le altre sono
      // eseguibili da tutti e l'indice non ferma nessuno.
      const chiusa = new RegExp(`revoke\\s+(all|execute)[^;]*?on\\s+function\\s+${punto}\\s*\\(`, "is");
      if (!tutto.some((sql) => chiusa.test(sql))) return false;
      const grant = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${punto}\\s*\\([^)]*\\)[^;]*?(service_role|to\\s+public)`, "is");
      return !tutto.some((sql) => grant.test(sql));
    });

    expect(senzaGrant, "Queste funzioni stanno dentro un indice ma il servizio non può eseguirle: ogni INSERT fatto dal service_role fallirà con «permission denied for function»").toEqual([]);
  });
});
