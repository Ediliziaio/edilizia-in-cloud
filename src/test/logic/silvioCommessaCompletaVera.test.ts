/**
 * Dalla prova di «Completa» online col modello vero (2/11/2026): i pagamenti scritti in chat
 * diventavano fasi, e nella colonna comparivano codici come «appaltatore_lavoro».
 */
import { describe, expect, it } from "vitest";
import { eseguiRisposta } from "../../../shared/silvio-commessa/chat.ts";
import { pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { testoValore } from "@/components/silvio-commessa/presentazione";
import { messaggioDaLeggere } from "@/components/silvio-commessa/useBozzaSilvio";

describe("i pagamenti non sono fasi", () => {
  const prova = (nome: string) => eseguiRisposta(pianoVuoto("d2000000-0000-4000-a000-000000000002"), [{ nome: "aggiungi_fase", argomenti: { nome, giorni: 1 } }] as never);

  it.each(["Pagamento 40% alla firma", "Acconto", "Saldo finale", "30% a fine lavori"])("«%s» non si aggiunge", (nome) => {
    const esito = prova(nome);
    expect(esito.modifiche).toEqual([]);
  });

  it("una lavorazione si aggiunge", () => {
    expect(prova("Getto solaio").modifiche.length).toBeGreaterThan(0);
  });
});

describe("il messaggio lungo si legge come un documento", () => {
  it("con importo, pagamenti e fasi", () => {
    expect(messaggioDaLeggere("Importo 20.000 euro piu IVA 22%. Pagamenti: 40% alla firma e 60% a fine lavori. Fasi: Demolizione 3 giorni, Getto solaio 5 giorni.")).toBe(true);
  });
  it("una correzione resta alla chat", () => {
    expect(messaggioDaLeggere("il totale è 15.000,50")).toBe(false);
  });
});

it("i codici della commessa si leggono", () => {
  expect(testoValore("identita.order_type", "appaltatore_lavoro")).toBe("Appaltatore lavoro");
  expect(testoValore("identita.stato", "in_corso")).toBe("In corso");
});
