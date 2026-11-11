/**
 * Proposta per significato (11/11/2026): i candidati per parole in comune, il testo per il modello
 * e la lettura della risposta, che accetta solo numeri esistenti e una scelta per voce.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { candidati, leggiRisposta, parole, SINONIMI_UNITA as SINONIMI_EDGE, testoRichiesta } from "../../../supabase/functions/_shared/abbinaVociAI";
import { SINONIMI_UNITA } from "@/lib/prezzario/confronto";

const listino = [
  { id: "gres", nome: "Posa pavimento gres porcellanato", unita: "mq" },
  { id: "riv", nome: "Posa rivestimento pareti bagno", unita: "mq" },
  { id: "tiro", nome: "Tiro al piano", unita: "piano" },
  { id: "porta", nome: "Posa porta interna", unita: "pz" },
  { id: "demo", nome: "Demolizione rivestimenti e pavimenti bagno", unita: "mq" },
];
const voce = { id: "v1", descrizione: "Fornitura e posa di pavimento in gres porcellanato 60x60, compreso collante e stuccatura", unita: "mq" };

describe("proposta per significato", () => {
  it("le parole: senza articoli, numeri e «compreso», singolare e plurale uguali", () => {
    expect(parole("Posa dei pavimenti in gres, compreso collante 60x60")).toEqual(["pos", "paviment", "gres", "collant", "60x60"]);
  });

  it("i candidati: prima quello con più parole in comune; niente se non c'è niente in comune", () => {
    const c = candidati(voce, listino);
    expect(c[0].id).toBe("gres");
    expect(c.map((x) => x.id)).not.toContain("tiro");
    expect(candidati({ id: "x", descrizione: "Nolo autogru", unita: "h" }, listino)).toEqual([]);
  });

  it("il testo per il modello numera voci e candidati, con le unità", () => {
    const t = testoRichiesta([{ voce, candidati: candidati(voce, listino).slice(0, 2) }]);
    expect(t).toMatch(/^V1 \[mq\] Fornitura e posa/);
    expect(t).toContain("  1) [mq] Posa pavimento gres porcellanato");
  });

  it("la risposta: solo voci e candidati che esistono, una scelta per voce, null = nessuna", () => {
    const blocchi = [
      { voce, candidati: [listino[0], listino[1]] },
      { voce: { id: "v2", descrizione: "Ponteggio di facciata", unita: "mq" }, candidati: [listino[2]] },
    ];
    const r = leggiRisposta(JSON.stringify({ abbinamenti: [
      { v: 1, c: 1, certezza: "alta", perche: "stessa posa del gres" },
      { v: 1, c: 2, certezza: "alta" },
      { v: 2, c: null },
      { v: 3, c: 1 },
      { v: 2, c: 7 },
    ] }), blocchi);
    expect(r).toEqual([{ voce_id: "v1", tariffa_id: "gres", certezza: "alta", perche: "stessa posa del gres" }]);
    expect(leggiRisposta("non è json", blocchi)).toEqual([]);
    expect(leggiRisposta("```json\n{\"abbinamenti\":[{\"v\":2,\"c\":1,\"certezza\":\"forse\"}]}\n```", blocchi)).toEqual([{ voce_id: "v2", tariffa_id: "tiro", certezza: "media", perche: "" }]);
  });

  it("la funzione passa dal router, controlla accesso, permesso e carta, e non scrive nel database", () => {
    const s = readFileSync(resolve(process.cwd(), "supabase/functions/listino-abbina-ai/index.ts"), "utf8");
    expect(s).toContain('from "../_shared/aiRouter.ts"');
    expect(s).toContain('taskKey: "listino_abbina_voci"');
    expect(s).toContain("requireCompanyAccess(admin, userId, companyId, corsHeaders)");
    expect(s).toContain('_permission: "can_edit_orders"');
    expect(s).toContain("gateAiPayment(admin, companyId, corsHeaders)");
    expect(s).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("solo candidati con la stessa unità: il quadro elettrico (cad) non va sull'impianto a corpo", () => {
    const l = [{ id: "imp", nome: "Rifacimento impianto elettrico bagno", unita: "fisso" }, { id: "km", nome: "Trasporto al km", unita: "km" }, { id: "q", nome: "Posa quadro elettrico", unita: "pz" }];
    expect(candidati({ id: "v", descrizione: "Quadro elettrico piano terra QE03", unita: "cad" }, l).map((x) => x.id)).toEqual(["q"]);
    expect(candidati({ id: "v", descrizione: "Trasporto e scarico di materiale a discarica", unita: "mc" }, l)).toEqual([]);
  });

  it("le unità della funzione sono quelle del programma", () => {
    expect(SINONIMI_EDGE).toEqual(SINONIMI_UNITA);
  });
});
