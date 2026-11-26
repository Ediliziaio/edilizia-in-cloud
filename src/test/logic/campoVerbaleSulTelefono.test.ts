import { beforeEach, describe, expect, it } from "vitest";
import {
  cancellaVerbaleSulTelefono, erroreDiRete, leggiVerbaleSulTelefono, scriviVerbaleSulTelefono,
} from "@/lib/campo/verbaleSulTelefono";
import type { AcceptanceContent } from "../../../supabase/functions/collaudo-commessa/model";

const contenuto = { title: "Collaudo bagno", customer: "Rossi", checks: [] } as unknown as AcceptanceContent;

describe("verbale di collaudo sul telefono", () => {
  beforeEach(() => localStorage.clear());

  it("tiene la bozza per utente e commessa, e la cancella", () => {
    scriviVerbaleSulTelefono("u1", "o1", { content: contenuto, valori: { mq: 12 }, reportId: null, version: null });
    const letto = leggiVerbaleSulTelefono("u1", "o1");
    expect(letto?.content.title).toBe("Collaudo bagno");
    expect(letto?.valori).toEqual({ mq: 12 });
    expect(letto?.reportId).toBeNull();
    // Un altro utente o un'altra commessa non la vedono.
    expect(leggiVerbaleSulTelefono("u2", "o1")).toBeNull();
    expect(leggiVerbaleSulTelefono("u1", "o2")).toBeNull();
    cancellaVerbaleSulTelefono("u1", "o1");
    expect(leggiVerbaleSulTelefono("u1", "o1")).toBeNull();
  });

  it("ignora dati rovinati invece di rompere la pagina", () => {
    localStorage.setItem("campo-verbale-bozza:u1:o1", "{non è json");
    expect(leggiVerbaleSulTelefono("u1", "o1")).toBeNull();
    localStorage.setItem("campo-verbale-bozza:u1:o1", JSON.stringify({ valori: {} }));
    expect(leggiVerbaleSulTelefono("u1", "o1")).toBeNull();
  });

  it("distingue la rete che manca da un rifiuto del server", () => {
    const rete = Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FunctionsFetchError" });
    expect(erroreDiRete(rete)).toBe(true);
    expect(erroreDiRete(new Error("Failed to fetch"))).toBe(true);
    expect(erroreDiRete(new Error("Il verbale è stato cambiato da un altro: riaprilo."))).toBe(false);
  });
});
