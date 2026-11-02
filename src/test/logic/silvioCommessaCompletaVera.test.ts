/**
 * Dalla prova di «Completa» online col modello vero (2/11/2026): i pagamenti scritti in chat
 * diventavano fasi, e nella colonna comparivano codici come «appaltatore_lavoro».
 */
import { describe, expect, it } from "vitest";
import { eseguiRisposta } from "../../../shared/silvio-commessa/chat.ts";
import { pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { frammentoDaRispostaAI } from "../../../shared/silvio-commessa/letturaAI.ts";
import { divisioneDaDecidere, testoValore, type DaDecidere } from "@/components/silvio-commessa/presentazione";
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

describe("un importo diverso da quello della commessa si vede", () => {
  const con = (avvisi: string[]) => divisioneDaDecidere({ conflitti: [], nonDisponibili: [], nonTornano: [], domande: [], proposte: [], avvisi, totale: 0 } as unknown as DaDecidere);

  it("sta in evidenza, gli altri avvisi restano chiusi", () => {
    const d = con(["testo scritto dice 20.000 € per «Importo», la commessa ha 18.000 €: resta quello della commessa.", "Scansione poco leggibile."]);
    expect(d.avvisiSoldi).toHaveLength(1);
    expect(d.altriAvvisi).toHaveLength(1);
    expect(d.subito).toBe(1);
    expect(d.altre).toBe(1);
  });
});

describe("il telefono scritto dalla persona", () => {
  const leggi = (testo: string, tipo: "testo" | "contratto", aree: Record<string, unknown> = {}) =>
    frammentoDaRispostaAI({ aree }, { fonte: { tipo, etichetta: "x" }, testo } as never);
  const telefono = (f: ReturnType<typeof leggi>) => (f.aree.cliente?.["cliente.contatto"]?.valore as { client_phone?: string } | undefined)?.client_phone;

  it("si riprende dal testo se il modello lo perde", () => {
    expect(telefono(leggi("Importo 20.000. Telefono cliente 333 000 7788. Fasi: getto.", "testo"))).toBe("333 000 7788");
  });
  it("in un documento no: può essere quello dell'impresa", () => {
    expect(telefono(leggi("Impresa Tal dei Tali, tel. 02 1234567", "contratto"))).toBeUndefined();
  });
  it("il numero del modello resta", () => {
    expect(telefono(leggi("telefono 333 000 7788", "testo", { cliente: { "cliente.contatto": { valore: { client_phone: "333 111 2222" } } } }))).toBe("333 111 2222");
  });
});
