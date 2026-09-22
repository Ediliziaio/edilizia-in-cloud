/**
 * Il Bagno Group (21/09/2026): connettere Google Calendar duplicava il
 * calendario personale invece di riusarlo.
 *
 * Il calendario di ogni persona era stato importato con calendar_type='event'
 * per quattro persone (Christian, Katia, William, Giusy) invece di 'personal'.
 * Quando ognuno ha collegato il proprio Google, il codice cercava "un
 * calendario esistente" filtrando su calendar_type='personal': non lo trovava,
 * e ne creava uno SECONDO — stesso Google collegato, stesso proprietario, due
 * calendari attivi e prenotabili per la stessa persona (William: 76 nuovi
 * appuntamenti sul duplicato, 1 rimasto sull'originale).
 *
 * "Esiste già un calendario per questa persona" deve dipendere solo da
 * company_id + owner_id, mai dal tipo scelto per quel calendario.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(
  resolve(process.cwd(), "supabase/functions/google-calendar-auth/index.ts"),
  "utf8",
);

function estraiBlocco(inizio: string, righe: number): string {
  const i = sorgente.indexOf(inizio);
  expect(i, `blocco non trovato: ${inizio}`).toBeGreaterThanOrEqual(0);
  return sorgente.slice(i, i + righe);
}

describe("collegamento Google: un calendario per persona, qualunque sia il tipo", () => {
  it("la ricerca del calendario esistente non filtra più su calendar_type", () => {
    const blocco = estraiBlocco('const { data: existingCal } = await admin', 400);
    expect(blocco).toContain('.eq("company_id", state.companyId)');
    expect(blocco).toContain('.eq("owner_id", state.userId)');
    expect(blocco).not.toContain('.eq("calendar_type", "personal")');
    // Se la persona ha più di un calendario (i quattro duplicati di oggi),
    // si riusa quello attivo, non semplicemente il più vecchio o il primo.
    expect(blocco).toContain('.order("is_active", { ascending: false })');
    expect(blocco).toContain('.order("created_at", { ascending: false })');
  });

  it("la disattivazione al disconnect è simmetrica: stesso criterio, non solo i 'personal'", () => {
    const blocco = estraiBlocco("is_active: false, updated_at: new Date().toISOString()", 250);
    expect(blocco).toContain('.eq("company_id", companyId)');
    expect(blocco).toContain('.eq("owner_id", userId)');
    expect(blocco).not.toContain('.eq("calendar_type", "personal")');
  });
});
