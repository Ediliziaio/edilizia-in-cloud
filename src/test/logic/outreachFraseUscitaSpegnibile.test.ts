import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { componiCorpo, FRASE_USCITA_DEFAULT } from "../../../supabase/functions/_shared/outreach-uscita";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * «Se non ti interessa, rispondi «no» e non ti scrivo più.» la aggiunge il motore
 * a ogni email senza via d'uscita. Il titolare di ThermoDMR (15/09/2026) non la
 * vuole in nessuna email: tolta dai testi, il motore la rimetteva. Ora è un
 * interruttore del brand.
 */
describe("Frase «rispondi no» spegnibile per brand", () => {
  it("la colonna nasce accesa: gli altri brand non cambiano", () => {
    const m = leggi("supabase/migrations/20280917080000_outreach_frase_uscita_spegnibile.sql");
    expect(m).toContain("ADD COLUMN IF NOT EXISTS frase_uscita_automatica boolean NOT NULL DEFAULT true");
  });

  it("il dispatcher la legge e, spenta, non aggiunge la frase", () => {
    const d = leggi("supabase/functions/outreach-dispatch/index.ts");
    expect(d).toContain("stile_umano,frase_uscita,frase_uscita_automatica");
    expect(d).toContain("brand?.frase_uscita_automatica !== false");
  });

  it("senza frase automatica l'email finisce con la firma", () => {
    const { html } = componiCorpo({ corpo: "Ciao Marco", aggiungiUscita: false, firma: "Filippo" });
    expect(html).toBe("Ciao Marco<br><br>Filippo");
    expect(html).not.toContain(FRASE_USCITA_DEFAULT);
  });

  it("l'interruttore è nella card del brand", () => {
    const ui = leggi("src/components/admin/outreach/OutreachBrands.tsx");
    expect(ui).toContain("frase_uscita_automatica: fu");
    expect(ui).toContain("frase «rispondi no» in fondo");
  });
});
