/**
 * Quanti contatti e opportunità hanno ogni tag (Impostazioni → Tag), oltre le 1.000 righe di una risposta.
 */
import { describe, expect, it } from "vitest";
import {
  contaOpportunitaPerTag,
  leggiTutteLeRighe,
  RIGHE_PER_PAGINA,
  sommaGrafieContatti,
  tagFuoriElenco,
} from "@/lib/impostazioni/usoTag";

/** Un «server» con N righe e un tetto per risposta, come PostgREST. `conteggio` false = non dice il totale. */
function server(righe: number, { tetto = RIGHE_PER_PAGINA, conteggio = true }: { tetto?: number; conteggio?: boolean } = {}) {
  const richieste: Array<[number, number]> = [];
  const leggi = async (da: number, a: number) => {
    richieste.push([da, a]);
    const fine = Math.min(a + 1, da + tetto, righe);
    return {
      data: Array.from({ length: Math.max(0, fine - da) }, (_, i) => ({ id: da + i })),
      error: null as { message?: string } | null,
      count: conteggio ? righe : (null as number | null),
    };
  };
  return { leggi, richieste };
}

describe("sommaGrafieContatti", () => {
  it("somma le grafie dello stesso tag e le porta in forma normale", () => {
    expect(
      sommaGrafieContatti([
        { valore: "Cliente caldo", contatti: 10 },
        { valore: "cliente  caldo", contatti: 5 },
        { valore: " CLIENTE CALDO ", contatti: "3" },
        { valore: "dvs ai", contatti: 1586 },
      ]),
    ).toEqual({ "cliente caldo": 18, "dvs ai": 1586 });
  });

  it("ignora i tag vuoti e i conteggi che non sono numeri", () => {
    expect(sommaGrafieContatti([{ valore: "   ", contatti: 4 }, { valore: null, contatti: 1 }, { valore: "x", contatti: null }])).toEqual({ x: 0 });
  });
});

describe("contaOpportunitaPerTag", () => {
  it("conta una volta sola per opportunità, anche se il tag è scritto due volte", () => {
    expect(
      contaOpportunitaPerTag([
        { tags: ["Cliente caldo", "cliente caldo", "fiera"] },
        { tags: ["cliente caldo"] },
        { tags: null },
        { tags: [] },
      ]),
    ).toEqual({ "cliente caldo": 2, fiera: 1 });
  });
});

describe("leggiTutteLeRighe", () => {
  it("2.500 righe sono tre pagine da mille", async () => {
    const s = server(2500);
    const righe = await leggiTutteLeRighe(s.leggi);
    expect(righe).toHaveLength(2500);
    expect(s.richieste).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    // Nessuna riga ripetuta o saltata.
    expect(new Set(righe.map((r) => r.id)).size).toBe(2500);
  });

  it("mille righe esatte sono una pagina sola (non se ne chiede una seconda a vuoto)", async () => {
    const s = server(1000);
    expect(await leggiTutteLeRighe(s.leggi)).toHaveLength(1000);
    expect(s.richieste).toEqual([[0, 999]]);
  });

  it("nessuna riga: nessun errore", async () => {
    const s = server(0);
    expect(await leggiTutteLeRighe(s.leggi)).toEqual([]);
    expect(s.richieste).toHaveLength(1);
  });

  it("molte pagine si chiedono poche per volta e tornano tutte (12.345 righe)", async () => {
    const s = server(12345);
    expect(await leggiTutteLeRighe(s.leggi)).toHaveLength(12345);
    expect(s.richieste).toHaveLength(13);
  });

  it("senza il totale si va avanti finché una pagina non è incompleta", async () => {
    const s = server(2300, { conteggio: false });
    expect(await leggiTutteLeRighe(s.leggi)).toHaveLength(2300);
    expect(s.richieste).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("se il server dà meno di mille righe per volta usa la sua misura", async () => {
    const s = server(1200, { tetto: 500 });
    const righe = await leggiTutteLeRighe(s.leggi);
    expect(righe).toHaveLength(1200);
    expect(new Set(righe.map((r) => r.id)).size).toBe(1200);
  });

  it("un errore a metà non dà un elenco parziale: fa fallire tutto", async () => {
    const s = server(3000);
    const conErrore = async (da: number, a: number) =>
      da >= 2000 ? { data: null as unknown as Array<{ id: number }>, error: { message: "boom" }, count: 3000 } : s.leggi(da, a);
    await expect(leggiTutteLeRighe(conErrore)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("tagFuoriElenco", () => {
  it("elenca i tag in uso che non sono nell'elenco, dal più usato; le grafie diverse non contano come mancanti", () => {
    const uso = {
      "cliente caldo": { contatti: 10, opportunita: 0 },
      "dvs ai": { contatti: 1586, opportunita: 3 },
      fiera: { contatti: 0, opportunita: 12 },
      alfa: { contatti: 0, opportunita: 12 },
    };
    const fuori = tagFuoriElenco(uso, [{ name: "Cliente  Caldo" }]);
    expect(fuori.map((t) => t.nome)).toEqual(["dvs ai", "alfa", "fiera"]);
  });
});
