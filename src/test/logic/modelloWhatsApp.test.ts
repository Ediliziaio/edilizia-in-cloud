/**
 * WhatsApp: nella conversazione il messaggio con modello si legge com'è
 * arrivato al cliente, e il database accetta ogni tipo di messaggio che
 * webhook e invio scrivono (24/09/2026).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  corpoDelModello,
  lingueDelModello,
  testoDelModello,
  valoriDaiComponenti,
} from "../../../supabase/functions/_shared/modelloWhatsApp";

// Il modello di Green Energy così come sta in wa_meta_templates.components_json.
const RICHIESTA_INFO = [
  {
    type: "BODY",
    text: "Ciao {{1}}, grazie per aver richiesto informazioni sul fotovoltaico per la tua casa! ☀️\nNelle prossime ore ti chiamerà un nostro consulente per capire le tue esigenze.",
    example: { body_text: [["Mario"]] },
  },
];

describe("testo del modello inviato", () => {
  it("il corpo del modello con le variabili al loro posto", () => {
    const corpo = corpoDelModello(RICHIESTA_INFO);
    const valori = valoriDaiComponenti([{ type: "body", parameters: [{ type: "text", text: "Florin" }] }]);
    expect(testoDelModello(corpo!, valori)).toMatch(/^Ciao Florin, grazie per aver richiesto informazioni/);
  });

  it("più variabili, nell'ordine; valuta e data col loro valore di riserva", () => {
    const valori = valoriDaiComponenti([
      { type: "header", parameters: [{ type: "text", text: "non conta" }] },
      {
        type: "body",
        parameters: [
          { type: "text", text: "Anna" },
          { type: "currency", currency: { fallback_value: "1.200 €", code: "EUR", amount_1000: 1200000 } },
          { type: "date_time", date_time: { fallback_value: "3 ottobre" } },
        ],
      },
    ]);
    expect(valori).toEqual(["Anna", "1.200 €", "3 ottobre"]);
    expect(testoDelModello("{{1}}: {{2}} entro il {{ 3 }}", valori)).toBe("Anna: 1.200 € entro il 3 ottobre");
  });

  it("una variabile senza valore resta visibile, invece di sparire", () => {
    expect(testoDelModello("Ciao {{1}}, a {{2}}", ["Luca"])).toBe("Ciao Luca, a {{2}}");
    expect(testoDelModello("Ciao {{1}}", [""])).toBe("Ciao {{1}}");
  });

  it("senza corpo (modello non sincronizzato o solo intestazione) non c'è testo", () => {
    expect(corpoDelModello(null)).toBeNull();
    expect(corpoDelModello([{ type: "HEADER", format: "TEXT", text: "Titolo" }])).toBeNull();
    expect(corpoDelModello([{ type: "BODY", text: "   " }])).toBeNull();
    expect(valoriDaiComponenti(undefined)).toEqual([]);
  });

  it("«it_IT» e «it» sono la stessa lingua", () => {
    expect(lingueDelModello("it")).toEqual(["it"]);
    expect(lingueDelModello("it_IT")).toEqual(["it_IT", "it"]);
    expect(lingueDelModello("")).toEqual([]);
  });
});

describe("whatsapp-send salva il testo vero del modello", () => {
  const invio = readFileSync(join(process.cwd(), "supabase/functions/whatsapp-send/index.ts"), "utf8");

  it("cerca il modello dell'azienda (e del numero) e sostituisce le variabili inviate", () => {
    const cerca = invio.slice(invio.indexOf("async function testoDelModelloInviato"));
    expect(cerca).toMatch(/from\("wa_meta_templates"\)[\s\S]*\.eq\("company_id", companyId\)[\s\S]*\.eq\("template_name", nome\)/);
    expect(cerca).toContain('if (waNumberId) q = q.eq("wa_number_id", waNumberId);');
    expect(cerca).toContain("testoDelModello(corpo, valoriDaiComponenti(components))");
  });

  it("se il modello non si trova resta l'etichetta, e l'invio non si ferma", () => {
    expect(invio).toContain("?? `[Template: ${body.template.name}]`");
    const cerca = invio.slice(invio.indexOf("async function testoDelModelloInviato"), invio.indexOf("serveConMetriche("));
    expect(cerca).toContain("} catch {");
  });
});

describe("il database accetta ogni tipo che webhook e invio scrivono", () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const ultima = readdirSync(cartella)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(join(cartella, f), "utf8"))
    .find((sql) => sql.includes("add constraint whatsapp_messages_message_type_check"));
  const ammessi = new Set([...(ultima ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

  it("i tipi del webhook (parser) sono tutti ammessi", () => {
    const parser = readFileSync(join(process.cwd(), "supabase/functions/whatsapp-webhook/parser.ts"), "utf8");
    const tipi = [...parser.matchAll(/messageType: "([a-z_]+)"/g)].map((m) => m[1]);
    expect(tipi.length).toBeGreaterThanOrEqual(12);
    for (const t of tipi) expect(ammessi, t).toContain(t);
  });

  it("i tipi di whatsapp-send (testo, bottoni, modello) sono ammessi", () => {
    for (const t of ["text", "interactive", "template"]) expect(ammessi, t).toContain(t);
  });
});
