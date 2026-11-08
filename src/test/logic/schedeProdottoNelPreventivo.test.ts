/**
 * Le schede tecniche dei prodotti scelti, in fondo al preventivo classico (07/11/2026).
 *
 * Florin: «se seleziono determinati prodotti dove ho le schede tecniche, escono fuori anche le schede tecniche».
 * La scheda dell'articolo, se no quella della famiglia; una volta sola; e il server scarica solo un PDF vero,
 * in https, non troppo grande.
 */
import { describe, expect, it } from "vitest";
import {
  SCHEDA_BYTE_MASSIMI, SCHEDE_MASSIME, ePdf, scaricaScheda, schedeDaAllegare,
} from "../../../supabase/functions/_shared/schedeProdotto";

const articoli = new Map([["a1", "https://storage/scheda-a1.pdf"], ["a2", "https://produttore.it/scheda.pdf"]]);
const famiglie = new Map([["f1", "https://storage/scheda-famiglia.pdf"], ["f2", "http://insicuro/scheda.pdf"]]);

describe("Quali schede", () => {
  it("quella dell'articolo, se no quella della famiglia, nell'ordine delle righe", () => {
    expect(schedeDaAllegare([{ family_id: "f1" }, { article_template_id: "a1", family_id: "f1" }, { article_template_id: "a2" }], articoli, famiglie))
      .toEqual(["https://storage/scheda-famiglia.pdf", "https://storage/scheda-a1.pdf", "https://produttore.it/scheda.pdf"]);
  });

  it("lo stesso prodotto su più righe: la scheda esce una volta", () => {
    expect(schedeDaAllegare([{ article_template_id: "a1" }, { article_template_id: "a1" }], articoli, famiglie)).toHaveLength(1);
  });

  it("righe senza prodotto del listino, o con una scheda non https, non allegano niente", () => {
    expect(schedeDaAllegare([{}, { family_id: "f2" }, { article_template_id: "sconosciuto" }], articoli, famiglie)).toEqual([]);
  });

  it("al più dieci schede per preventivo", () => {
    const tanti = new Map(Array.from({ length: 20 }, (_, i) => [`x${i}`, `https://s/${i}.pdf`] as const));
    expect(schedeDaAllegare([...tanti.keys()].map((id) => ({ article_template_id: id })), tanti, new Map())).toHaveLength(SCHEDE_MASSIME);
  });
});

describe("Lo scaricamento", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 scheda");
  const risposta = (corpo: Uint8Array, init: ResponseInit = {}) => async () => new Response(corpo, { status: 200, ...init });

  it("un PDF vero arriva", async () => {
    expect(Array.from(await scaricaScheda("https://s/a.pdf", risposta(pdf)) ?? [])).toEqual(Array.from(pdf));
    expect(ePdf(pdf)).toBe(true);
  });

  it("una pagina HTML con estensione .pdf, un errore o un file enorme si saltano", async () => {
    expect(await scaricaScheda("https://s/a.pdf", risposta(new TextEncoder().encode("<html>")))).toBeNull();
    expect(await scaricaScheda("https://s/a.pdf", async () => new Response("no", { status: 404 }))).toBeNull();
    expect(await scaricaScheda("https://s/a.pdf", risposta(pdf, { headers: { "content-length": String(SCHEDA_BYTE_MASSIMI + 1) } }))).toBeNull();
    expect(await scaricaScheda("https://s/a.pdf", async () => { throw new Error("rete"); })).toBeNull();
  });

  it("solo https: un indirizzo http non si chiede nemmeno", async () => {
    let chiamato = false;
    expect(await scaricaScheda("http://s/a.pdf", async () => { chiamato = true; return new Response(pdf); })).toBeNull();
    expect(chiamato).toBe(false);
  });
});
