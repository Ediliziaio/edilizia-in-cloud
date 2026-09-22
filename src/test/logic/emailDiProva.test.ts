/**
 * send-test-email non è più un relay (21/09/2026).
 *
 * Con `testMode: true` bastava essere autenticati: oggetto e HTML scelti da
 * chi chiamava, verso qualunque indirizzo, dal mittente della piattaforma.
 * Qualunque utente di qualunque azienda poteva mandare phishing a nome di
 * EdiliziaInCloud. E dalla pagina «Dominio email» la prova marketing falliva
 * sempre: partiva dal mittente di piattaforma, che Elastic rifiuta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  destinatarioProvaAmmesso,
  indirizzoSingoloValido,
  mittenteProva,
  MOTIVO_DESTINATARIO_NON_AMMESSO,
  oggettoProva,
} from "../../../supabase/functions/_shared/emailDiProva";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

const AZIENDA = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

describe("destinatarioProvaAmmesso", () => {
  const base = {
    superAdmin: false,
    emailChiamante: "mario.rossi@azienda.it",
    emailColleghi: ["giulia.bianchi@azienda.it", "Luca.Verdi@Azienda.it"],
  };

  it("chi non è super admin non manda la prova a un estraneo", () => {
    expect(destinatarioProvaAmmesso({ ...base, destinatario: "vittima@gmail.com" }))
      .toEqual({ ammesso: false, motivo: MOTIVO_DESTINATARIO_NON_AMMESSO });
  });

  it("può mandarla a sé, comunque sia scritto l'indirizzo", () => {
    expect(destinatarioProvaAmmesso({ ...base, destinatario: "  Mario.Rossi@AZIENDA.it " }))
      .toEqual({ ammesso: true, perche: "se_stesso" });
  });

  it("può mandarla a un collega, maiuscole comprese", () => {
    expect(destinatarioProvaAmmesso({ ...base, destinatario: "luca.verdi@azienda.it" }))
      .toEqual({ ammesso: true, perche: "collega" });
  });

  it("il super admin resta libero", () => {
    expect(destinatarioProvaAmmesso({ ...base, superAdmin: true, destinatario: "chiunque@esterno.com", emailColleghi: [] }))
      .toEqual({ ammesso: true, perche: "super_admin" });
  });

  it("un elenco di indirizzi non passa, neanche se comincia col proprio", () => {
    for (const destinatario of [
      "mario.rossi@azienda.it,vittima@gmail.com",
      "mario.rossi@azienda.it; vittima@gmail.com",
      "Mario <mario.rossi@azienda.it>",
    ]) {
      expect(destinatarioProvaAmmesso({ ...base, destinatario }).ammesso).toBe(false);
      expect(destinatarioProvaAmmesso({ ...base, superAdmin: true, destinatario }).ammesso).toBe(false);
    }
  });

  it("senza email del chiamante né colleghi, un indirizzo vuoto non combacia con niente", () => {
    const vuoto = {
      superAdmin: false,
      emailChiamante: null as string | null,
      emailColleghi: [null, undefined, ""] as Array<string | null | undefined>,
    };
    expect(destinatarioProvaAmmesso({ ...vuoto, destinatario: "" }).ammesso).toBe(false);
    expect(destinatarioProvaAmmesso({ ...vuoto, destinatario: "vittima@gmail.com" }).ammesso).toBe(false);
  });

  it("un destinatario che non è una stringa non passa", () => {
    expect(destinatarioProvaAmmesso({ ...base, destinatario: ["mario.rossi@azienda.it"] }).ammesso).toBe(false);
    expect(indirizzoSingoloValido(undefined)).toBe(false);
  });
});

describe("oggettoProva", () => {
  it("mette sempre [TEST] davanti", () => {
    expect(oggettoProva("Offerta imperdibile")).toBe("[TEST] Offerta imperdibile");
  });

  it("non lo raddoppia quando c'è già", () => {
    expect(oggettoProva("[TEST] Email di verifica · rossi.it")).toBe("[TEST] Email di verifica · rossi.it");
  });

  it("un [TEST] scritto in un altro modo non conta come prefisso", () => {
    expect(oggettoProva("[test] minuscolo")).toBe("[TEST] [test] minuscolo");
    expect(oggettoProva("  Accedi qui [TEST]")).toBe("[TEST] Accedi qui [TEST]");
  });

  it("oggetto vuoto o mancante: quello predefinito", () => {
    expect(oggettoProva("")).toBe("[TEST] Email di verifica");
    expect(oggettoProva("   ")).toBe("[TEST] Email di verifica");
    expect(oggettoProva(undefined)).toBe("[TEST] Email di verifica");
    expect(oggettoProva(42)).toBe("[TEST] Email di verifica");
  });

  it("gli a capo diventano spazi", () => {
    expect(oggettoProva("Riga uno\r\nRiga due")).toBe("[TEST] Riga uno Riga due");
  });
});

describe("mittenteProva", () => {
  it("la pagina passa l'azienda: parte da quella, per tutti", () => {
    expect(mittenteProva({ aziendaRichiesta: AZIENDA, superAdmin: false }))
      .toEqual({ da: "azienda_richiesta", companyId: AZIENDA });
    expect(mittenteProva({ aziendaRichiesta: AZIENDA, superAdmin: true }))
      .toEqual({ da: "azienda_richiesta", companyId: AZIENDA });
  });

  it("l'azienda della piattaforma (PlatformCompanyProvider) è un'azienda come le altre", () => {
    expect(mittenteProva({ aziendaRichiesta: "00000000-0000-0000-0000-000000000001", superAdmin: true }))
      .toEqual({ da: "azienda_richiesta", companyId: "00000000-0000-0000-0000-000000000001" });
  });

  it("senza azienda il mittente della piattaforma resta solo al super admin", () => {
    for (const aziendaRichiesta of [undefined, null, ""]) {
      expect(mittenteProva({ aziendaRichiesta, superAdmin: true })).toEqual({ da: "piattaforma" });
      expect(mittenteProva({ aziendaRichiesta, superAdmin: false })).toEqual({ da: "azienda_del_profilo" });
    }
  });

  it("un company_id che non è un uuid si ferma prima di toccare il database", () => {
    for (const aziendaRichiesta of ["abc", "' or 1=1 --", 123, { id: AZIENDA }]) {
      expect(mittenteProva({ aziendaRichiesta, superAdmin: false }).da).toBe("errore");
    }
  });
});

describe("send-test-email usa le regole", () => {
  const funzione = leggi("supabase/functions/send-test-email/index.ts");

  it("nessun invio parte più con companyId: null scritto a mano", () => {
    expect(funzione).not.toMatch(/companyId:\s*null/);
    expect(funzione).toContain("companyId:    campaign.company_id,");
  });

  it("in testMode: mittente scelto da mittenteProva, accesso verificato, destinatario e oggetto controllati", () => {
    const provaMittente = funzione.slice(funzione.indexOf("if (testMode) {"), funzione.indexOf("if (!campaignId) {"));
    expect(provaMittente).toContain("mittenteProva({ aziendaRichiesta: company_id, superAdmin })");
    expect(provaMittente).toContain("await verifyCompanyAccess(adminClient, userId, mittente.companyId);");
    expect(provaMittente).toContain("await destinatarioAmmesso(companyId)");
    expect(provaMittente).toContain("oggettoProva(subject)");
  });

  it("la prova di una campagna controlla il destinatario dopo l'accesso all'azienda", () => {
    const provaCampagna = funzione.slice(funzione.indexOf("if (!campaignId) {"));
    const accesso = provaCampagna.indexOf("await verifyCompanyAccess(adminClient, userId, campaign.company_id);");
    const destinatario = provaCampagna.indexOf("await destinatarioAmmesso(campaign.company_id)");
    const invio = provaCampagna.indexOf("await sendEmailUnified(");
    expect(accesso).toBeGreaterThan(-1);
    expect(destinatario).toBeGreaterThan(accesso);
    expect(invio).toBeGreaterThan(destinatario);
  });

  it("i colleghi sono le persone interne, lette col client dell'utente", () => {
    expect(funzione).toContain('supabase.rpc("get_internal_chat_profiles"');
    expect(funzione).toContain('adminClient.rpc("has_role"');
  });
});

describe("le pagine passano ciò che serve", () => {
  it("«Dominio email» manda il company_id e mostra l'errore vero", () => {
    const pagina = leggi("src/pages/azienda/settings/SettingsEmailDomain.tsx");
    const prova = pagina.slice(pagina.indexOf("const testEmailMutation = useMutation({"), pagina.indexOf("const addMutation = useMutation({"));
    expect(prova).toContain("company_id: companyId,");
    expect(prova).toContain('throw new Error(await edgeErrorMessage(error, "Errore invio email di test"));');
    // Il testo della prova non promette più un dominio: il mittente lo sceglie il server.
    expect(prova).not.toContain("dal tuo dominio personalizzato");
  });

  it("la prova campagna mostra l'errore vero", () => {
    const pagina = leggi("src/pages/azienda/marketing/CampaignSendSettings.tsx");
    expect(pagina).toContain('throw new Error(await edgeErrorMessage(error, "Invio del test non riuscito"));');
  });
});
