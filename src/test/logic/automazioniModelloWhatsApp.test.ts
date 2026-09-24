/**
 * Automazioni: il passo «Invia WhatsApp» con un modello approvato da Meta
 * (24/09/2026).
 *
 * Prima il passo aveva solo il testo libero (il modello non si poteva
 * scegliere), che Meta consegna solo a chi ha scritto nelle ultime 24 ore; il
 * motore chiamava Meta direttamente, senza credito né registro, e ignorava il
 * testo scritto dal passo AI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { campiObbligatoriMancanti, getCatalogItem } from "@/lib/flow-node-catalog";
import {
  campiPersonalizzatiDelModello,
  valoreDelCampo,
  valoriDelModello,
} from "../../../supabase/functions/_shared/variabiliModelloWhatsApp";
import { STANDARD_TEMPLATE_FIELDS } from "@/lib/whatsapp/templateVariableFields";

const FLORIN = {
  first_name: "Florin",
  last_name: "Andriciuc",
  phone: "+39 348 346 7567",
  email: "f@example.it",
  company_name: "Green Energy",
  city: "Bologna",
  province: "BO",
  address: "Via Roma 1",
  postal_code: "40100",
};

describe("variabili del modello compilate dal contatto", () => {
  it("ogni campo che si può scegliere alla creazione del modello ha un valore", () => {
    for (const campo of STANDARD_TEMPLATE_FIELDS) {
      expect(valoreDelCampo(campo.key, FLORIN), campo.key).not.toBe("");
    }
    expect(valoreDelCampo("nome_completo", FLORIN)).toBe("Florin Andriciuc");
    expect(valoreDelCampo("cf:abc", FLORIN, { abc: " 6 kW " })).toBe("6 kW");
  });

  it("il modello di Green Energy: {{1}} = nome", () => {
    expect(valoriDelModello(1, { "1": "nome" }, FLORIN)).toEqual({ valori: ["Florin"], mancanti: [] });
  });

  it("le posizioni senza campo prendono il testo fisso del passo", () => {
    const esito = valoriDelModello(2, { "1": "nome" }, FLORIN, {}, { "2": "Marco, il consulente" });
    expect(esito.valori).toEqual(["Florin", "Marco, il consulente"]);
  });

  it("una variabile vuota si dice prima di inviare, col campo che la doveva riempire", () => {
    const esito = valoriDelModello(3, { "1": "nome", "2": "citta" }, { first_name: "Anna" });
    expect(esito.mancanti).toEqual([
      { posizione: 2, campo: "Città" },
      { posizione: 3, campo: "testo fisso" },
    ]);
  });

  it("i campi personalizzati da leggere", () => {
    expect(campiPersonalizzatiDelModello({ "1": "nome", "2": "cf:kw", "3": "cf:tetto" })).toEqual(["kw", "tetto"]);
    expect(campiPersonalizzatiDelModello(null)).toEqual([]);
  });
});

describe("builder: il passo WhatsApp col modello", () => {
  it("il passo ha il campo del modello, prima del testo", () => {
    const campi = getCatalogItem("invia_whatsapp")!.configSchema.map((f) => f.id);
    expect(campi).toEqual(["numero", "modello_whatsapp", "messaggio"]);
    expect(getCatalogItem("invia_whatsapp")!.configSchema[1].type).toBe("whatsapp_template_select");
  });

  it("con un modello il testo non è più obbligatorio; senza, sì", () => {
    expect(campiObbligatoriMancanti("invia_whatsapp", { numero: "{{contatto.phone}}", modello_whatsapp: "richiesta_info_fotovoltaico" }))
      .toEqual([]);
    expect(campiObbligatoriMancanti("invia_whatsapp", { numero: "{{contatto.phone}}" }).map((f) => f.id))
      .toEqual(["messaggio"]);
  });
});

describe("motore: il passo passa da whatsapp-send", () => {
  const motore = readFileSync(join(process.cwd(), "supabase/functions/process-automation/index.ts"), "utf8");
  const passo = motore.slice(
    motore.indexOf("async function executeSendWhatsApp("),
    motore.indexOf("async function numeroWhatsAppPredefinito("),
  );

  it("non chiama più Meta direttamente e non scrive più contact_messages", () => {
    expect(passo).toContain("/functions/v1/whatsapp-send");
    expect(passo).not.toContain("graph.facebook.com");
    expect(passo).not.toContain('from("contact_messages")');
  });

  it("il modello si rilegge a ogni invio, e deve essere approvato", () => {
    expect(passo).toMatch(/from\("wa_meta_templates"\)[\s\S]*\.eq\("company_id", companyId\)[\s\S]*\.eq\("template_name", nomeModello\)/);
    expect(passo).toContain('String(modello.status).toUpperCase() !== "APPROVED"');
  });

  it("con una variabile vuota non si invia, e si dice quale", () => {
    expect(passo).toContain("if (mancanti.length) {");
    expect(passo).toContain("Meta rifiuta i modelli con una variabile vuota");
  });

  it("il messaggio porta il contatto e parte dal numero del modello", () => {
    expect(passo).toContain("wa_number_id: modello.wa_number_id,");
    expect(passo).toContain("contact_id: contact.id,");
  });

  it("il testo scritto dal passo AI (whatsapp_body) vale più del testo del passo", () => {
    expect(passo).toContain('cfg.whatsapp_body || cfg.whatsapp_text || ""');
  });

  it("chi ha detto STOP non riceve niente", () => {
    expect(passo).toContain("if (contact.optout_whatsapp || contact.opt_out) {");
  });

  it("la finestra delle 24 ore chiusa si spiega a chi legge il registro", () => {
    const errori = motore.slice(motore.indexOf("function erroreInvioWhatsApp("));
    expect(errori).toContain('esito.code === "window_closed"');
    expect(errori).toContain("serve un modello approvato da Meta");
  });
});
