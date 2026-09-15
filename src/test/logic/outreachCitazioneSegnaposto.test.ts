import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { citazionePrecedente } from "../../../supabase/functions/_shared/outreach-threading";
import { contactToVars, hashSeed, htmlToPlainText, renderTemplate } from "../../../supabase/functions/_shared/outreach-template";

/**
 * Il follow-up cita l'email precedente come una risposta vera. In coda però resta
 * il MODELLO del passo, con i segnaposto: fino al 15/09/2026 i follow-up di
 * ThermoDMR citavano «> Buongiorno {{nome}},» e «serramentisti {{zona}}».
 */
describe("Citazione nel follow-up: il testo come l'ha ricevuto il contatto", () => {
  const modello = "Buongiorno {{nome}},<br><br>ti scrivo perché cerchiamo serramentisti {{zona}} a cui fornire i nostri serramenti in PVC.";
  const contatto = { first_name: "Florin", province: "MI", email: "flo.andriciuc@gmail.com" };
  const precedente = { messageId: "<a@b.it>", subject: "fornitura serramenti pvc", sentAt: "2026-09-15T15:58:11Z", fromName: "Filippo Monti", fromEmail: "filippo@thermodmr.eu" };

  it("citando il modello crudo restano i segnaposto (il difetto)", () => {
    const { testo } = citazionePrecedente({ ...precedente, body: modello }, htmlToPlainText);
    expect(testo).toContain("{{nome}}");
  });

  it("citando il testo riempito con le variabili del contatto non resta nessun segnaposto", () => {
    const body = renderTemplate(modello, contactToVars(contatto), { seed: hashSeed(contatto.email) });
    const { testo } = citazionePrecedente({ ...precedente, body }, htmlToPlainText);
    expect(testo).toContain("> Buongiorno Florin,");
    expect(testo).toContain("serramentisti in provincia di Milano");
    expect(testo).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("il dispatcher riempie il corpo prima di citarlo", () => {
    const d = readFileSync(resolve(process.cwd(), "supabase/functions/outreach-dispatch/index.ts"), "utf8");
    expect(d).toContain('body: renderTemplate(ultimoPrecedente.body ?? "", vars, { seed }),');
  });
});
