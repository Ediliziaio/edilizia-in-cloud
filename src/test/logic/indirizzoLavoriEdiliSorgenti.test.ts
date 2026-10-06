/**
 * L'indirizzo dei lavori è nel passo Cliente degli otto preventivatori edili, non più in «Immobile» (06/10/2026):
 * il passo Immobile non ha i campi, il PDF rimanda al passo giusto, il badge «completo» non lo conta. Negli otto moduli.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODULI = [
  { slug: "bagni", cart: "Bagni", helpers: () => import("@/pages/azienda/bagni/BagniWizard/helpers") },
  { slug: "tetti", cart: "Tetti", helpers: () => import("@/pages/azienda/tetti/TettiWizard/helpers") },
  { slug: "climatizzazione", cart: "Climatizzazione", helpers: () => import("@/pages/azienda/climatizzazione/ClimatizzazioneWizard/helpers") },
  { slug: "elettrico", cart: "Elettrico", helpers: () => import("@/pages/azienda/elettrico/ElettricoWizard/helpers") },
  { slug: "termoidraulico", cart: "Termoidraulico", helpers: () => import("@/pages/azienda/termoidraulico/TermoidraulicoWizard/helpers") },
  { slug: "pavimenti", cart: "Pavimenti", helpers: () => import("@/pages/azienda/pavimenti/PavimentiWizard/helpers") },
  { slug: "piscine", cart: "Piscine", helpers: () => import("@/pages/azienda/piscine/PiscineWizard/helpers") },
  { slug: "ristrutturazione", cart: "Ristrutturazione", helpers: () => import("@/pages/azienda/ristrutturazione/RistrutturazioneWizard/helpers") },
] as const;

const leggi = (slug: string, cart: string, file: string) =>
  readFileSync(resolve(process.cwd(), `src/pages/azienda/${slug}/${cart}Wizard/${file}`), "utf8");

describe.each(MODULI)("$slug: indirizzo dei lavori nel passo Cliente", ({ slug, cart, helpers }) => {
  it("il passo Immobile non ha più i campi dell'indirizzo del cantiere", () => {
    const immobile = leggi(slug, cart, "StepImmobile.tsx");
    for (const campo of ["cantiere_indirizzo", "cantiere_citta", "cantiere_provincia", "cantiere_cap", "Indirizzo cantiere", "MapPin"]) {
      expect(immobile, campo).not.toContain(campo);
    }
    // Resta quello che è dell'immobile.
    expect(immobile).toContain("Tipo di intervento");
    expect(immobile).toContain("immobile_tipo");
  });

  it("il passo Cliente ha il blocco, e il selettore dei contatti porta con sé l'indirizzo", () => {
    const cliente = leggi(slug, cart, "StepCliente.tsx");
    expect(cliente).toContain("<IndirizzoDeiLavori");
    expect(cliente).toContain("useIndirizzoLavoriEdile(form,");
    expect(cliente).toContain('.select("id, first_name, last_name, email, phone, address, city, province, postal_code")');
    expect(cliente).toContain("indirizzo.dalContatto(c.id,");
  });

  it("la lista di controllo del PDF dice «Indirizzo dei lavori» e rimanda al passo Cliente", () => {
    const pdf = leggi(slug, cart, "StepPdf.tsx");
    expect(pdf).toContain('label: "Indirizzo dei lavori"');
    expect(pdf).toContain("Aggiungilo nello step Cliente");
    expect(pdf).toContain('mancano.push({ etichetta: "indirizzo dei lavori", passo: "cliente" });');
    expect(pdf).not.toContain("Aggiungilo nello step Immobile");
    expect(pdf).not.toMatch(/etichetta: "indirizzo del cantiere"/);
  });

  it("il passo Immobile è completo con il tipo o i dati dell'immobile, non con l'indirizzo", async () => {
    const { stepCompletion } = await helpers();
    const completezza = (progetto: Record<string, unknown>) =>
      (stepCompletion as (p: Record<string, unknown>, c: unknown[]) => Record<string, boolean>)(progetto, []);
    expect(completezza({ cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Torino" }).immobile).toBe(false);
    expect(completezza({ immobile_tipo: "appartamento" }).immobile).toBe(true);
    expect(completezza({ tipo_intervento: "rifacimento_completo" }).immobile).toBe(true);
  });
});
