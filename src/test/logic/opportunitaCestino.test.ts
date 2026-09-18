import { describe, it, expect } from "vitest";
import { rigaCestino, filtraCestino, type RigaCestinoGrezza } from "@/lib/opportunitaCestino";

// 17/09/2026: «Elimina» porta sempre nel cestino. Qui come si legge una riga
// (nome, contatto, chi l'ha eliminata) e la ricerca dentro il cestino.
const grezza = (extra: Partial<RigaCestinoGrezza> = {}): RigaCestinoGrezza => ({
  id: "opp-1",
  name: "Infissi soggiorno",
  value: 4200,
  deleted_at: "2026-09-17T08:30:00.000Z",
  deleted_by: "utente-1",
  marketing_contacts: { first_name: "Graziella", last_name: "Bianchi", company_name: null },
  marketing_pipelines: { name: "Nuovo" },
  marketing_pipeline_stages: { name: "Da Chiamare" },
  ...extra,
});

describe("cestino opportunità", () => {
  it("una riga porta nome, contatto, dove stava e chi l'ha eliminata", () => {
    expect(rigaCestino(grezza(), { "utente-1": "Venusia Rossi" })).toEqual({
      id: "opp-1",
      nome: "Infissi soggiorno",
      contatto: "Graziella Bianchi",
      pipeline: "Nuovo",
      fase: "Da Chiamare",
      valore: 4200,
      eliminataIl: "2026-09-17T08:30:00.000Z",
      eliminataDa: "Venusia Rossi",
    });
  });

  it("senza nome vale il contatto, senza persona l'azienda", () => {
    expect(rigaCestino(grezza({ name: "  " }), {}).nome).toBe("Graziella Bianchi");
    const soloAzienda = grezza({ name: null, marketing_contacts: { first_name: null, last_name: " ", company_name: "Rossi Serramenti" } });
    expect(rigaCestino(soloAzienda, {}).nome).toBe("Rossi Serramenti");
    expect(rigaCestino(grezza({ name: null, marketing_contacts: null }), {}).nome).toBe("Opportunità senza nome");
  });

  it("chi ha eliminato: «un utente» se il nome non si legge, niente se non si sa", () => {
    expect(rigaCestino(grezza(), {}).eliminataDa).toBe("un utente");
    expect(rigaCestino(grezza({ deleted_by: null }), {}).eliminataDa).toBeNull();
  });

  it("il valore zero, vuoto o non numerico non si mostra; quello in testo sì", () => {
    expect(rigaCestino(grezza({ value: 0 }), {}).valore).toBeNull();
    expect(rigaCestino(grezza({ value: null }), {}).valore).toBeNull();
    expect(rigaCestino(grezza({ value: "" }), {}).valore).toBeNull();
    expect(rigaCestino(grezza({ value: "abc" }), {}).valore).toBeNull();
    expect(rigaCestino(grezza({ value: "1250.5" }), {}).valore).toBe(1250.5);
  });

  it("la ricerca vuole tutte le parole, senza badare ad accenti e maiuscole", () => {
    const righe = [
      rigaCestino(grezza(), { "utente-1": "Venusia Rossi" }),
      rigaCestino(grezza({ id: "opp-2", name: "Caldaia", marketing_contacts: { first_name: "Niccolò", last_name: "Verdi", company_name: null } }), { "utente-1": "Antonella Neri" }),
    ];
    expect(filtraCestino(righe, "")).toHaveLength(2);
    expect(filtraCestino(righe, "graziella venusia").map((r) => r.id)).toEqual(["opp-1"]);
    expect(filtraCestino(righe, "NICCOLO").map((r) => r.id)).toEqual(["opp-2"]);
    expect(filtraCestino(righe, "da chiamare antonella").map((r) => r.id)).toEqual(["opp-2"]);
    expect(filtraCestino(righe, "graziella antonella")).toHaveLength(0);
  });
});
