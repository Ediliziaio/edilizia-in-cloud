import { describe, expect, it } from "vitest";
import { codiceNormalizzato, indirizzoCantiereDalContratto, paroleDelNome, trovaClienteDaContratto, type ClienteAnagrafica } from "@/lib/clienti/clienteDaContratto";

const clienti: ClienteAnagrafica[] = [
  { id: "f45", first_name: "Famiglia DEMO 2026 45", last_name: "", email: "cliente-2026-44@demo.invalid" },
  { id: "f4", first_name: "Famiglia DEMO 2026 4", last_name: "", email: null },
  { id: "rossi", first_name: "Mario", last_name: "Rossi", email: "mario@rossi.it", fiscal_code: "RSSMRA80A01F205X" },
  { id: "edil", first_name: "Edil Nord", last_name: "S.r.l.", business_name: "Edil Nord S.r.l.", vat_number: "IT01234567890" },
  { id: "bianchi1", first_name: "Luca", last_name: "Bianchi", email: "senza@no-email.ediliziaincloud.local" },
  { id: "bianchi2", first_name: "Luca", last_name: "Bianchi", email: "senza@no-email.ediliziaincloud.local" },
];
const trova = (c: Parameters<typeof trovaClienteDaContratto>[0]) => trovaClienteDaContratto(c, clienti);

describe("il cliente del contratto si aggancia all'anagrafica (14/11/2026)", () => {
  it("il nome con la città dopo la virgola, in maiuscolo o con parole in altro ordine", () => {
    expect(trova({ nome_completo: "Famiglia DEMO 2026 45, Sesto San Giovanni" })).toMatchObject({ esito: "trovato", cliente: { id: "f45" }, per: "nome" });
    expect(trova({ nome_completo: "FAMIGLIA demo 2026 45" })).toMatchObject({ esito: "trovato", cliente: { id: "f45" } });
    expect(trova({ nome_completo: "Rossi Mario" })).toMatchObject({ esito: "trovato", cliente: { id: "rossi" } });
  });

  it("senza titoli: «Sig. Mario Rossi», «Dott.ssa»", () => {
    expect(trova({ nome_completo: "Sig. Mario Rossi" })).toMatchObject({ esito: "trovato", cliente: { id: "rossi" } });
    expect(paroleDelNome("Dott.ssa Anna Verdi")).toBe("anna verdi");
  });

  it("un nome simile ma diverso non si aggancia («…45» non è «…4»)", () => {
    expect(trova({ nome_completo: "Famiglia DEMO 2026 46" })).toEqual({ esito: "nessuno" });
  });

  it("il codice fiscale o la partita IVA valgono prima del nome, con o senza IT davanti", () => {
    expect(trova({ nome_completo: "Nome scritto male", codice_fiscale: "rssmra80a01f205x" })).toMatchObject({ esito: "trovato", cliente: { id: "rossi" }, per: "codice" });
    expect(trova({ nome_completo: "Edil Nord", partita_iva: "01234567890" })).toMatchObject({ esito: "trovato", cliente: { id: "edil" }, per: "codice" });
    expect(codiceNormalizzato("IT 012 345 678 90")).toBe("01234567890");
  });

  it("l'email aggancia, il segnaposto di chi non l'ha data no", () => {
    expect(trova({ nome_completo: "M. Rossi", email: " Mario@Rossi.it " })).toMatchObject({ esito: "trovato", cliente: { id: "rossi" }, per: "email" });
    expect(trova({ nome_completo: "Altro", email: "senza@no-email.ediliziaincloud.local" })).toEqual({ esito: "nessuno" });
  });

  it("la ragione sociale vale come nome", () => {
    expect(trova({ nome_completo: "EDIL NORD S.R.L." })).toMatchObject({ esito: "trovato", cliente: { id: "edil" } });
  });

  it("due clienti con lo stesso nome: non si sceglie a caso", () => {
    const r = trova({ nome_completo: "Bianchi Luca" });
    expect(r.esito).toBe("ambiguo");
    expect(r.esito === "ambiguo" && r.candidati.map((c) => c.id)).toEqual(["bianchi1", "bianchi2"]);
  });
});

describe("il lettore AI copia il nome intero, numeri compresi (14/11/2026)", () => {
  it("il prompt del contratto dice di non togliere i numeri dal nome e di mettere la città nell'indirizzo", async () => {
    const { readFileSync } = await import("node:fs");
    const prompt = readFileSync("supabase/functions/generic-doc-ai-extract/index.ts", "utf8");
    expect(prompt).toContain("COPIATO COM'E' SCRITTO");
    expect(prompt).toContain("il numero NON e' un civico");
    expect(prompt).toContain("che va in 'indirizzo'");
  });
});

describe("indirizzo del cantiere dal contratto, non dall'anagrafica (14/11/2026)", () => {
  it("prima l'indirizzo dei lavori, poi quello scritto accanto al cliente", () => {
    expect(indirizzoCantiereDalContratto({ indirizzo_cantiere: " Via Verdi 1, Lecco ", cliente: { indirizzo: "Via Roma 3, Monza" } })).toBe("Via Verdi 1, Lecco");
    expect(indirizzoCantiereDalContratto({ indirizzo_cantiere: null, cliente: { indirizzo: "Via Roma 3, Monza" } })).toBe("Via Roma 3, Monza");
    expect(indirizzoCantiereDalContratto({ indirizzo_cantiere: "  ", cliente: { indirizzo: null } })).toBeNull();
  });
  it("in «Nuova commessa» il cambio cliente non lo sovrascrive; una modifica a mano sì", async () => {
    const { readFileSync } = await import("node:fs");
    const s = readFileSync("src/pages/azienda/CreateOrder.tsx", "utf8");
    const effetto = s.slice(s.indexOf("Cambio cliente → riparte l'auto-compilazione"), s.indexOf("Codice Commessa progressivo"));
    expect(effetto.indexOf("indirizzoContrattoRef.current")).toBeGreaterThan(-1);
    expect(effetto.indexOf("indirizzoContrattoRef.current")).toBeLessThan(effetto.indexOf("suggestedCantiere)"));
    expect(s).toMatch(/cantiereTouchedRef\.current = true;\s+indirizzoContrattoRef\.current = null;/);
  });
});
