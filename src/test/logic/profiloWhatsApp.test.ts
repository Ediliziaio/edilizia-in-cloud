/**
 * Profilo WhatsApp del numero (24/09/2026): le regole di Meta, uguali per la
 * finestra dell'app e per la funzione whatsapp-profilo che salva su WhatsApp.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIE_WHATSAPP,
  corpoPerMeta,
  erroriProfilo,
  normalizzaProfilo,
  normalizzaSito,
  profiloDaMeta,
  type ProfiloWhatsApp,
} from "../../../supabase/functions/_shared/profiloWhatsApp";

const vuoto: ProfiloWhatsApp = {
  info: "",
  descrizione: "",
  indirizzo: "",
  email: "",
  siti: [],
  categoria: "",
  fotoUrl: null,
};

const attuale: ProfiloWhatsApp = {
  info: "Fotovoltaico chiavi in mano",
  descrizione: "Installiamo impianti in tutta la Lombardia",
  indirizzo: "Via Roma 1, Milano",
  email: "info@greenenergy.it",
  siti: ["https://www.greenenergy.it"],
  categoria: "PROF_SERVICES",
  fotoUrl: "https://pps.whatsapp.net/foto.jpg",
};

describe("profilo WhatsApp: lettura da Meta", () => {
  it("porta i campi di Meta nella forma dell'app", () => {
    expect(profiloDaMeta({
      about: "Ciao",
      description: "Descrizione",
      address: "Via Roma 1",
      email: "a@b.it",
      websites: ["https://a.it", "", 3],
      vertical: "RETAIL",
      profile_picture_url: "https://pps.whatsapp.net/x.jpg",
      messaging_product: "whatsapp",
    })).toEqual({
      info: "Ciao",
      descrizione: "Descrizione",
      indirizzo: "Via Roma 1",
      email: "a@b.it",
      siti: ["https://a.it"],
      categoria: "RETAIL",
      fotoUrl: "https://pps.whatsapp.net/x.jpg",
    });
  });

  it("un numero appena collegato ha il profilo vuoto e la categoria «UNDEFINED» vale «non scelta»", () => {
    expect(profiloDaMeta({ vertical: "UNDEFINED", messaging_product: "whatsapp" })).toEqual(vuoto);
    expect(profiloDaMeta(undefined)).toEqual(vuoto);
  });
});

describe("profilo WhatsApp: siti e spazi", () => {
  it("un sito senza http:// diventa https://", () => {
    expect(normalizzaSito("www.greenenergy.it")).toBe("https://www.greenenergy.it");
    expect(normalizzaSito("  http://sito.it ")).toBe("http://sito.it");
    expect(normalizzaSito("   ")).toBe("");
  });

  it("toglie spazi, siti vuoti e doppi", () => {
    expect(normalizzaProfilo({
      info: "  Ciao  ",
      siti: ["www.a.it", "", "https://www.a.it"],
      categoria: " OTHER ",
    })).toEqual({ ...vuoto, info: "Ciao", siti: ["https://www.a.it"], categoria: "OTHER" });
  });
});

describe("profilo WhatsApp: cosa non va", () => {
  it("un profilo in regola non ha errori", () => {
    expect(erroriProfilo(attuale, attuale)).toEqual({});
  });

  it("l'info non si può svuotare se c'era, ma un numero nuovo può lasciarla vuota", () => {
    expect(erroriProfilo({ ...attuale, info: "" }, attuale).info).toMatch(/non permette di lasciarla vuota/);
    expect(erroriProfilo(vuoto, vuoto)).toEqual({});
  });

  it("rispetta i limiti di Meta", () => {
    const errori = erroriProfilo({
      ...attuale,
      info: "x".repeat(140),
      descrizione: "x".repeat(513),
      indirizzo: "x".repeat(257),
      email: `${"x".repeat(120)}@esempio.it`,
    }, attuale);
    expect(errori.info).toBe("Al massimo 139 caratteri.");
    expect(errori.descrizione).toBe("Al massimo 512 caratteri.");
    expect(errori.indirizzo).toBe("Al massimo 256 caratteri.");
    expect(errori.email).toBe("Al massimo 128 caratteri.");
    expect(erroriProfilo({ ...attuale, info: "x".repeat(139) }, attuale)).toEqual({});
  });

  it("email, siti e categoria devono essere validi", () => {
    expect(erroriProfilo({ ...attuale, email: "info@" }, attuale).email).toBe("Indirizzo email non valido.");
    expect(erroriProfilo({ ...attuale, siti: ["https://a.it", "https://b.it", "https://c.it"] }, attuale).siti).toBe("Al massimo 2 siti.");
    expect(erroriProfilo({ ...attuale, siti: ["https://senza-punto"] }, attuale).siti).toMatch(/non valido/);
    expect(erroriProfilo({ ...attuale, categoria: "INVENTATA" }, attuale).categoria).toBe("Categoria non valida.");
    expect(erroriProfilo({ ...attuale, categoria: "" }, attuale).categoria).toMatch(/non si può togliere/);
  });

  it("le categorie sono quelle di Meta, senza «UNDEFINED»", () => {
    const valori = CATEGORIE_WHATSAPP.map((c) => c.valore);
    expect(valori).toContain("PROF_SERVICES");
    expect(valori).not.toContain("UNDEFINED");
    expect(new Set(valori).size).toBe(valori.length);
  });
});

describe("profilo WhatsApp: cosa si manda a Meta", () => {
  it("niente se non è cambiato niente", () => {
    expect(corpoPerMeta(attuale, attuale)).toBeNull();
  });

  it("solo i campi cambiati, sempre con messaging_product", () => {
    expect(corpoPerMeta({ ...attuale, info: "Nuova info", siti: ["https://www.greenenergy.it", "https://b.it"] }, attuale)).toEqual({
      messaging_product: "whatsapp",
      about: "Nuova info",
      websites: ["https://www.greenenergy.it", "https://b.it"],
    });
  });

  it("svuotare descrizione, indirizzo o email li svuota anche su WhatsApp", () => {
    expect(corpoPerMeta({ ...attuale, descrizione: "", indirizzo: "", email: "" }, attuale)).toEqual({
      messaging_product: "whatsapp",
      description: "",
      address: "",
      email: "",
    });
  });

  it("l'info vuota e la categoria non scelta non si mandano mai", () => {
    expect(corpoPerMeta({ ...vuoto, descrizione: "Ciao" }, vuoto)).toEqual({
      messaging_product: "whatsapp",
      description: "Ciao",
    });
  });
});

describe("funzione whatsapp-profilo", () => {
  const sorgente = readFileSync(join(process.cwd(), "supabase/functions/whatsapp-profilo/index.ts"), "utf8");

  it("la usa solo chi amministra l'azienda", () => {
    expect(sorgente).toContain("assertMetaCompanyAdminAccess(admin, user.id, companyId)");
  });

  it("lavora solo sul numero chiesto, dell'azienda chiesta, senza ripieghi", () => {
    expect(sorgente).toMatch(/\.eq\("id", waNumberId\)\s*\.eq\("company_id", companyId\)\s*\.is\("deleted_at", null\)/);
    expect(sorgente).not.toContain("resolveWhatsAppSender");
  });

  it("ricontrolla i campi con le stesse regole dell'app e manda solo quelli cambiati", () => {
    expect(sorgente).toContain("erroriProfilo(nuovo, precedente)");
    expect(sorgente).toContain("corpoPerMeta(nuovo, precedente)");
  });

  it("non scrive mai il token nei log", () => {
    for (const riga of sorgente.split("\n").filter((r) => /registra\(|console\./.test(r))) {
      expect(riga, riga).not.toMatch(/\btoken\b/);
    }
  });
});
