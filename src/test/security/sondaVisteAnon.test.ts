import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Una sonda che mentiva.
 *
 * Avevo passato in rassegna le viste leggibili dal ruolo anon e concluso che non
 * ne rispondeva nessuna. Era falso, e la colpa era della sonda: raccoglieva i
 * risultati in una tabella temporanea senza averla concessa ad anon, e ogni
 * inserimento falliva per permessi dentro un `exception when others then null`.
 * Il ciclo interrogava le viste, otteneva le righe, e le buttava via. Zero
 * risultati voleva dire «non ho potuto scrivere niente», non «non c'è niente».
 *
 * Rifatta con il grant al posto giusto, rispondono quattro viste:
 *   public_appointment_slots ....... 41 righe, la usa PublicBooking.tsx
 *   ai_personas_public ............. 18, catalogo senza dati d'azienda
 *   public_calendar_owner_prefs .... 2, solo user_id e block_busy_slots
 *   v_silvio_agent_mission_health .. 1 riga di zeri -- questa non ci doveva stare
 *
 * Dopo la revoca: 3, e sono le tre pubbliche per progetto.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("una_sonda_che_mentiva"));
if (!nome) throw new Error("migrazione una_sonda_che_mentiva non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("l'errore della sonda è scritto, non nascosto", () => {
  it("dice qual era il difetto", () => {
    expect(sql).toMatch(/tabella temporanea non concessa ad anon/);
    expect(sql).toMatch(/exception-when-others-then-null/);
  });

  it("dice cosa significava davvero quello zero", () => {
    expect(sql).toMatch(/Zero risultati significava "non ho potuto scrivere niente"/);
  });
});

describe("la vista di troppo", () => {
  it("ad anon viene revocata", () => {
    expect(sql).toMatch(/revoke select on public\.v_silvio_agent_mission_health from anon/);
  });

  it("il motivo non è «per sicurezza», è preciso", () => {
    expect(sql).toMatch(/aggregato senza GROUP BY/);
    expect(sql).toMatch(/una riga la\s*\n--\s*restituisce sempre/);
  });

  it("il commento sulla vista resta a spiegarlo a chi passerà dopo", () => {
    expect(sql).toMatch(/comment on view public\.v_silvio_agent_mission_health/);
    expect(sql).toMatch(/Solo per le pagine \/admin autenticate/);
  });

  it("le tre pubbliche per progetto restano, e sono nominate", () => {
    for (const v of ["public_appointment_slots", "ai_personas_public", "public_calendar_owner_prefs"]) {
      expect(sql).toMatch(new RegExp(v));
    }
    expect(sql).not.toMatch(/revoke select on public\.public_appointment_slots/);
    expect(sql).not.toMatch(/revoke select on public\.ai_personas_public/);
    expect(sql).not.toMatch(/revoke select on public\.public_calendar_owner_prefs/);
  });
});
