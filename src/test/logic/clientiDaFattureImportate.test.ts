/**
 * Gli intestatari delle fatture importate finiscono nei Clienti (20/10/2026):
 * un contatto del CRM diventa cliente, e al cliente si fanno le fatture.
 * Clienti con portale spento e account bloccato, mai inviti né contatti CRM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codiceCognome, codiceFiscaleDaFattura, codiceNome, nomeDaIntestatario } from "../../../supabase/functions/_shared/clienteOperativoDaFattura";

const radice = join(__dirname, "../../..");
const MODULO = readFileSync(join(radice, "supabase/functions/_shared/clienteOperativoDaFattura.ts"), "utf8");
const FUNZIONE = readFileSync(join(radice, "supabase/functions/clienti-da-fatture-importate/index.ts"), "utf8");

describe("clienti dalle fatture importate", () => {
  it("il cliente nasce senza portale e con l'account bloccato", () => {
    expect(MODULO).toContain("portal_disabled: true");
    expect(MODULO).toContain("is_blocked: true");
    expect(MODULO).toContain('role: "customer"');
  });

  it("un codice fiscale di 11 cifre è un'azienda, e il CF resta quello della fattura", () => {
    expect(MODULO).toContain("/^\\d{11}$/.test(cfFattura");
    expect(MODULO).toContain("fiscal_code: estero ? null : cfFattura,");
  });

  it("niente email, niente contatti CRM", () => {
    expect(MODULO).not.toMatch(/sendEmail|marketing_contacts/);
    expect(FUNZIONE).not.toMatch(/sendEmail|from\("marketing_contacts"\)/);
  });

  it("riconosce prima, crea solo se manca, e lega l'anagrafica fiscale dopo", () => {
    const prima = MODULO.indexOf("riconcilia(supabase, companyId, fattura.id)");
    const crea = MODULO.indexOf('from("profiles").insert');
    expect(prima).toBeGreaterThan(0);
    expect(crea).toBeGreaterThan(prima);
    expect(MODULO.indexOf("riconcilia(supabase, companyId, fattura.id)", crea)).toBeGreaterThan(crea);
  });

  it("l'anagrafica ha un UUID deterministico senza account: due giri non fanno due clienti", () => {
    expect(MODULO).toContain("emailTecnicaClienteImportato(");
    expect(MODULO).toContain("idAnagraficaCliente(emailAccesso)");
    expect(MODULO).toContain('errProfilo.code === "23505"');
    expect(MODULO).not.toContain("auth.admin.createUser");
  });

  it("un errore non timbra la fattura: si riprova al giro dopo", () => {
    const blocco = FUNZIONE.slice(FUNZIONE.indexOf('if (r.esito === "errore")'));
    expect(blocco.indexOf("continue;")).toBeLessThan(blocco.indexOf("cliente_collegato_at:"));
  });

  it("nome e cognome di una persona dall'intestatario", () => {
    expect(nomeDaIntestatario("ROSSI MARIO")).toEqual({ last_name: "ROSSI", first_name: "MARIO" });
    expect(nomeDaIntestatario("DE LUCA  ANNA MARIA")).toEqual({ last_name: "DE LUCA", first_name: "ANNA MARIA" });
    expect(nomeDaIntestatario("BIANCHI")).toEqual({ first_name: "", last_name: "BIANCHI" });
  });

  it("con il codice fiscale l'ordine giusto lo dice il codice", () => {
    expect(nomeDaIntestatario("Elena Piovano", "PVNLNE91H60L219H")).toEqual({ last_name: "Piovano", first_name: "Elena" });
    expect(nomeDaIntestatario("ROSSI MARIO", "RSSMRA80A01H501U")).toEqual({ last_name: "ROSSI", first_name: "MARIO" });
    expect(codiceNome("Gianfranco")).toBe("GFR");
    expect(codiceCognome("Fo")).toBe("FOX");
  });
});

/**
 * La fattura che si riprovava ogni 5 minuti (23-24/10/2026).
 *
 * Un gestionale aveva scritto nel campo del codice fiscale la partita IVA con
 * il prefisso «IT» (IT14972911003). Il database rifiuta un codice fiscale di 13
 * caratteri, la funzione lo trattava come un errore da riprovare e, a ogni giro,
 * creava e cancellava un account: 288 volte in un giorno, sulla stessa fattura.
 */
describe("codice fiscale scritto come partita IVA con il prefisso IT", () => {
  it("IT + 11 cifre diventa le 11 cifre: il codice fiscale di una società", () => {
    expect(codiceFiscaleDaFattura("IT14972911003")).toBe("14972911003");
    expect(codiceFiscaleDaFattura("it 14972911003")).toBe("14972911003");
    expect(codiceFiscaleDaFattura("IT-14972911003")).toBe("14972911003");
  });

  it("il codice fiscale di una persona resta com'è, anche in minuscolo o con spazi", () => {
    expect(codiceFiscaleDaFattura("RSSMRA80A01H501U")).toBe("RSSMRA80A01H501U");
    expect(codiceFiscaleDaFattura(" rssmra80a01h501u ")).toBe("RSSMRA80A01H501U");
  });

  it("un codice di 11 cifre senza prefisso resta com'è", () => {
    expect(codiceFiscaleDaFattura("14972911003")).toBe("14972911003");
  });

  it("il prefisso si toglie solo davanti a una partita IVA intera", () => {
    // Un codice che comincia per IT ma non è IT + 11 cifre non si tocca.
    expect(codiceFiscaleDaFattura("ITALIA12345")).toBe("ITALIA12345");
    expect(codiceFiscaleDaFattura("IT1497291100")).toBe("IT1497291100");
    expect(codiceFiscaleDaFattura("IT149729110033")).toBe("IT149729110033");
  });

  it("vuoto o assente dà null", () => {
    expect(codiceFiscaleDaFattura(null)).toBeNull();
    expect(codiceFiscaleDaFattura(undefined)).toBeNull();
    expect(codiceFiscaleDaFattura("   ")).toBeNull();
    expect(codiceFiscaleDaFattura("--")).toBeNull();
  });

  it("la creazione del cliente usa il codice pulito, non quello grezzo", () => {
    expect(MODULO).toContain("const cfFattura = codiceFiscaleDaFattura(fattura.client_fiscal_code);");
  });

  it("un dato fiscale rifiutato dal database non si riprova: la fattura va da verificare", () => {
    const profilo = MODULO.slice(MODULO.indexOf("if (errProfilo)"), MODULO.indexOf("errRuolo"));
    expect(profilo).toContain('esito: "da_verificare"');
    expect(profilo).toContain("non valid[oa]");
    // L'account creato per l'occasione si cancella comunque, prima di rispondere.
    expect(profilo.indexOf("deleteUser")).toBeLessThan(profilo.indexOf('esito: "da_verificare"'));
    // Un errore vero (rete, account) resta da riprovare.
    expect(profilo).toContain('esito: "errore"');
  });
});

describe("clienti dalle fatture emesse da qui", () => {
  it("il giro guarda anche i documenti fiscali emessi e timbra solo a esito certo", () => {
    expect(FUNZIONE).toContain('from("documenti_fiscali")');
    expect(FUNZIONE).toContain('.not("stato", "in", "(bozza,annullata)")');
    const blocco = FUNZIONE.slice(FUNZIONE.indexOf("clienteDaDocumentoEmesso(supabase"));
    expect(blocco.indexOf("continue;")).toBeLessThan(blocco.indexOf("cliente_collegato_at:"));
  });

  it("la fotografia della fattura diventa i campi del cliente, anche per un privato", async () => {
    const { fatturaDaDocumento } = await import("../../../supabase/functions/_shared/clienteOperativoDaFattura.ts");
    const f = fatturaDaDocumento({ id: "d", cliente_snapshot: { nome: "Anna", cognome: "Verdi", codice_fiscale: "VRDNNA80A41H501X", indirizzo_comune: "Roma", ragione_sociale: "" } });
    expect(f.client_company_name).toBe("Anna Verdi");
    expect(f.client_fiscal_code).toBe("VRDNNA80A41H501X");
    expect(f.client_city).toBe("Roma");
  });

  it("il collegamento è solo del giro automatico", () => {
    const sql = readFileSync(join(radice, "supabase/migrations/20290117110000_clienti_da_fatture_emesse.sql"), "utf8");
    expect(sql).toMatch(/revoke all on function public\.riconcilia_cliente_documento_emesso\(uuid, uuid, boolean\) from public, anon, authenticated/);
    expect(sql).toContain("'cliente_collegato_at', 'cliente_collegato_esito'");
  });
});
