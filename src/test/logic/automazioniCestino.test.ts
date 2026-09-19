import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filtraCestinoAutomazioni, statoPrimaLeggibile, type AutomazioneNelCestino } from "@/lib/automazioniCestino";

// Il 19/09/2026 due clic su «Elimina selezionati» hanno cancellato 20
// automazioni del super admin: DELETE vero, nessuna copia. Da allora «Elimina»
// porta nel cestino, e anche una DELETE diretta la trasforma il database
// (trigger trg_automazione_elimina_va_nel_cestino). Qui si controlla che il
// codice non torni a cancellare davvero da solo.

const righe: AutomazioneNelCestino[] = [
  { id: "1", nome: "Notifica lead — Marketing Edile", eliminataIl: "2026-09-19T09:55:25Z", eliminataDa: "Florin Andriciuc", statoPrima: "published" },
  { id: "2", nome: "Benvenuto nuovi clienti", eliminataIl: "2026-09-18T10:00:00Z", eliminataDa: "Katia Morgillo", statoPrima: "draft" },
  { id: "3", nome: "Promemoria città", eliminataIl: "2026-09-17T10:00:00Z", eliminataDa: null, statoPrima: null },
];

describe("filtraCestinoAutomazioni", () => {
  it("senza ricerca restituisce tutto, nell'ordine dato", () => {
    expect(filtraCestinoAutomazioni(righe, "")).toEqual(righe);
    expect(filtraCestinoAutomazioni(righe, "   ")).toEqual(righe);
  });

  it("cerca nel nome e in chi l'ha eliminata, senza badare a maiuscole", () => {
    expect(filtraCestinoAutomazioni(righe, "marketing").map((r) => r.id)).toEqual(["1"]);
    expect(filtraCestinoAutomazioni(righe, "KATIA").map((r) => r.id)).toEqual(["2"]);
  });

  it("ignora gli accenti: «citta» trova «città»", () => {
    expect(filtraCestinoAutomazioni(righe, "citta").map((r) => r.id)).toEqual(["3"]);
  });
});

describe("statoPrimaLeggibile", () => {
  it("dice com'era prima del cestino, cioè come torna al ripristino", () => {
    expect(statoPrimaLeggibile("published")).toBe("pubblicata");
    expect(statoPrimaLeggibile("draft")).toBe("in bozza");
    expect(statoPrimaLeggibile("archived")).toBe("archiviata");
  });

  it("senza stato ricordato vale «in bozza», come il ripristino nel database", () => {
    expect(statoPrimaLeggibile(null)).toBe("in bozza");
    expect(statoPrimaLeggibile(undefined)).toBe("in bozza");
  });
});

function fileSorgente(cartella: string): string[] {
  const trovati: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) trovati.push(...fileSorgente(percorso));
    else if (/\.(ts|tsx)$/.test(voce) && !percorso.includes("/test/") && !percorso.endsWith("supabase/types.ts")) trovati.push(percorso);
  }
  return trovati;
}

describe("nessuna schermata cancella davvero un'automazione", () => {
  const tutti = fileSorgente("src");
  const sorgenti = tutti.filter((f) => readFileSync(f, "utf8").includes('"automation_flows"'));

  it.each(sorgenti)("%s non fa .delete() su automation_flows", (percorso) => {
    const testo = readFileSync(percorso, "utf8");
    // .from("automation_flows") seguito, anche a capo, da .delete(
    const cancellazione = /from\(\s*"automation_flows"\s*\)[\s\S]{0,120}?\.delete\(/;
    expect(testo).not.toMatch(cancellazione);
  });

  it("l'eliminazione definitiva passa solo dalla funzione apposita", () => {
    const chiamanti = tutti.filter((f) => readFileSync(f, "utf8").includes("automazione_elimina_definitivamente"));
    expect(chiamanti.sort()).toEqual([
      "src/components/automazioni/AutomazioniTemplateGallery.tsx",
      "src/components/automazioni/CreaAutomazioneAIDialog.tsx",
      "src/components/flow-builder/FlowBuilderPage.tsx",
      "src/components/marketing/automations/AutomazioniCestinoDialog.tsx",
    ]);
  });
});
