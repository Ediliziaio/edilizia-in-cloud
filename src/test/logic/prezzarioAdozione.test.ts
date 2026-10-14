import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capitoliDiscendenti,
  conversioneUnitaTariffa,
  erroreVoceTariffa,
  idVoceAdottata,
  percorsoCapitolo,
} from "@/lib/prezzario/catalogo";
import { payloadTariffaRegionale } from "@/lib/prezzario/adozioneTariffe";
import type { PrezzarioCapitolo, PrezzarioVoce } from "@/lib/prezzario/tipi";

const cap = (
  id: string,
  titolo: string,
  parent_id: string | null = null,
): PrezzarioCapitolo => ({
  id,
  titolo,
  parent_id,
  fonte_id: "fonte",
  codice: id,
  ordine: 0,
  livello: parent_id ? 1 : 0,
});
const capitoli = [
  cap("A.1", "Demolizioni", "A"),
  cap("A", "Opere edili"),
  cap("B", "Impianti"),
];
const voce = (um: string | null, prezzo = 250): PrezzarioVoce => ({
  id: "voce-1",
  fonte_id: "fonte",
  capitolo_id: "A.1",
  codice: "A.1.3",
  descrizione: "Rimozione pavimentazione",
  unita_misura: um,
  prezzo,
  incidenza_manodopera_pct: 0.2,
  incidenza_sicurezza_pct: null,
  note: null,
  ordine: 0,
});
const opzioni = {
  companyId: "azienda",
  fonte: "Regione 2026",
  capitoli,
  ricarico: 20,
  costoVisibile: true,
};
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("Prezziario regionale: adozione corretta", () => {
  it("salva gli stessi quattro decimali consentiti dal database", async () => {
    const row = await payloadTariffaRegionale(voce("mq", 250.123456), opzioni);
    expect(row.costo_interno).toBe(250.1235);
    expect(row.prezzo_vendita).toBe(300.1481);
  });
  it.each([0.04, 17.43])(
    "blocca %s euro/t quando la conversione perderebbe il prezzo originale",
    async (prezzo) => {
      await expect(
        payloadTariffaRegionale(voce("t", prezzo), opzioni),
      ).rejects.toThrow();
    },
  );
  it("conserva il percorso gerarchico anche quando i figli precedono i padri", () => {
    expect(capitoliDiscendenti(capitoli, "A")).toEqual(["A", "A.1"]);
    expect(percorsoCapitolo(capitoli, "A.1")).toBe(
      "A · Opere edili / A.1 · Demolizioni",
    );
  });
  it("non entra in un ciclo se la gerarchia è corrotta", () => {
    const ciclici = [cap("A", "A", "B"), cap("B", "B", "A")];
    expect(capitoliDiscendenti(ciclici, "A")).toHaveLength(2);
    expect(percorsoCapitolo(ciclici, "A")).toContain("A");
  });
  it.each([
    ["t", 0.25, "kg"],
    ["100 kg", 2.5, "kg"],
    ["gg", 250, "gg"],
    ["a\ncorpo", 250, "a_corpo"],
    ["l", 250000, "mc"],
  ])(
    "converte %s senza cambiare il valore della quantità originale",
    async (um, costo, unita) => {
      const row = await payloadTariffaRegionale(voce(String(um)), opzioni);
      expect(row).toMatchObject({
        unita_fatturazione: unita,
        costo_interno: costo,
        prezzo_costo: costo,
        prezzo_vendita: Number(costo) * 1.2,
      });
    },
  );
  it("una tariffa a corpo non diventa al pezzo", () =>
    expect(conversioneUnitaTariffa("corpo")).toEqual({
      unita: "a_corpo",
      fattore: 1,
    }));
  it.each([null, "", "m² * cm", "kWh", "0 cad"])(
    "blocca l'unità %s senza inventare pezzi",
    async (um) => {
      expect(erroreVoceTariffa(voce(um))).toBeTruthy();
      await expect(
        payloadTariffaRegionale(voce(um), opzioni),
      ).rejects.toThrow();
    },
  );
  it("conserva codice, descrizione completa, fonte e categoria, e distingue le demolizioni", async () => {
    const row = await payloadTariffaRegionale(
      { ...voce("mq"), descrizione: "Rimozione ".repeat(30) },
      opzioni,
    );
    expect(row.descrizione.length).toBeGreaterThan(120);
    expect(row.nome.length).toBe(120);
    expect(row).toMatchObject({
      codice: "A.1.3",
      fonte: "Regione 2026",
      custom_field_values: {
        _gruppo_lavorazione: "demolizioni",
        _prezzario: {
          voce_id: "voce-1",
          capitolo_id: "A.1",
          capitolo_nome: "A · Opere edili / A.1 · Demolizioni",
        },
      },
    });
  });
  it("ripetere l'importazione usa la stessa identità, senza confondere aziende o destinazioni", async () => {
    const id = await idVoceAdottata("azienda", "rst_listino_voci", "v1");
    expect(await idVoceAdottata("azienda", "rst_listino_voci", "v1")).toBe(id);
    expect(await idVoceAdottata("altra", "rst_listino_voci", "v1")).not.toBe(
      id,
    );
    expect(await idVoceAdottata("azienda", "bgn_listino_voci", "v1")).not.toBe(
      id,
    );
    expect(id).toMatch(
      /^[a-f\d]{8}-[a-f\d]{4}-8[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/,
    );
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "non salva un ricarico invalido (%s)",
    async (ricarico) => {
      await expect(
        payloadTariffaRegionale(voce("mq"), { ...opzioni, ricarico }),
      ).rejects.toThrow("Ricarico non valido");
    },
  );
});
