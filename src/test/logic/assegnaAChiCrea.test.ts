/**
 * Chi vede solo i suoi assegnati deve poter creare contatti e opportunità.
 *
 * BeMade, 14/09: le operatrici di call center (only_assigned) ricevevano
 * «new row violates row-level security policy» su ogni inserimento, perché
 * l'app rilegge la riga appena creata e la lettura mostra solo le righe
 * assegnate a lei. Il trigger aggancia la riga a chi la crea.
 * E dalla scheda opportunità nome e cognome del contatto non si potevano
 * cambiare: c'erano email e telefono, non il nome.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const migrazione = readFileSync(join(ROOT, "supabase/migrations/20280916700000_assegna_a_chi_crea.sql"), "utf8");
const scheda = readFileSync(join(ROOT, "src/components/opportunities/OpportunityDetailDialog.tsx"), "utf8");

describe("inserimento per chi vede solo i suoi assegnati", () => {
  it("il trigger scatta prima dell'inserimento su contatti e opportunità", () => {
    expect(migrazione).toMatch(/BEFORE INSERT ON public\.marketing_contacts[\s\S]*assegna_a_chi_crea/);
    expect(migrazione).toMatch(/BEFORE INSERT ON public\.marketing_opportunities[\s\S]*assegna_a_chi_crea/);
  });

  it("vale solo con «solo assegnati» attivo e non sovrascrive le scelte del form", () => {
    expect(migrazione).toMatch(/NOT public\.solo_assegnati_attivo\(\)/);
    expect(migrazione).toMatch(/NEW\.call_center_id IS NULL AND public\.has_role\(v_uid, 'call_center'/);
    expect(migrazione).toMatch(/ELSIF NEW\.assigned_to IS NULL/);
  });
});

describe("scheda opportunità: nome e cognome del contatto", () => {
  it("si modificano e vanno nel salvataggio del contatto", () => {
    expect(scheda).toMatch(/value=\{contactFirstName\}/);
    expect(scheda).toMatch(/value=\{contactLastName\}/);
    expect(scheda).toMatch(/first_name: contactFirstName\.trim\(\)/);
    expect(scheda).toMatch(/contactFirstName\.trim\(\) !== \(contact\.first_name \|\| ""\)/);
  });
});
