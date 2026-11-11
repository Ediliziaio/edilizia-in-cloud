import { describe, expect, it } from "vitest";
import { annulla, applica, fondi, pianoVuoto, type Passo } from "../../../shared/silvio-commessa/fondi.ts";
import type { PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { modificheSceltaCliente } from "@/lib/silvio-commessa/sceltaCliente";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";

const v = (valore: unknown): Omit<Valore, "fonte"> => ({ valore, fiducia: 1, stato: "fatto" });
const ALFA = "00000001-0000-4000-a000-000000000001";
const BETA = "00000002-0000-4000-a000-000000000002";
const prima = () => fondi(pianoVuoto("azienda-test"), {
  fonte: { tipo: "testo", etichetta: "Dati inventati" },
  aree: {
    cliente: {
      "cliente.customer_id": v(ALFA),
      "cliente.nome": v({ client_name: "Cliente Alfa" }),
      "cliente.contatto": v({ client_email: "alfa@example.org", client_phone: "000111" }),
      "cliente.client_address": v("Sede Alfa"),
    },
    cantiere: { "cantiere.indirizzo": v({ work_address: "Cantiere di prova" }) },
    economia: { "economia.total_amount": v(400), "economia.vat_rate": v(10) },
  },
});

function scegli(piano: PianoCommessa, id: string, nome: string, email?: string | null) {
  let bozza = { piano, storia: [] as Passo[] };
  for (const modifica of modificheSceltaCliente(piano, id, nome, email)) {
    bozza = applica(bozza.piano, modifica, bozza.storia, "scelta-cliente");
  }
  return bozza;
}

describe("Il cliente selezionato e i recapiti della commessa", () => {
  it("cambiando cliente aggiorna il nome e usa solo il recapito del nuovo cliente", () => {
    const dopo = scegli(prima(), BETA, "Cliente Beta", "beta@example.org").piano;
    const ordine = scritturaDalPiano(dopo).ordine;
    expect(scritturaDalPiano(dopo).cliente.customer_id).toBe(BETA);
    expect(ordine).toMatchObject({ client_name: "Cliente Beta", client_email: "beta@example.org", total_amount: 400, vat_rate: 10 });
    expect(ordine.client_phone).toBeUndefined();
    expect(ordine.client_address).toBeUndefined();
    expect(dopo.aree.cantiere).toEqual(prima().aree.cantiere);
  });

  it("ripara anche una bozza con ID già corretto ma nome e recapiti del cliente precedente", () => {
    const incoerente = applica(prima(), { tipo: "cambia_valore", area: "cliente", chiave: "cliente.customer_id", valore: BETA }).piano;
    const dopo = scegli(incoerente, BETA, "Cliente Beta", "cliente@no-email.ediliziaincloud.local").piano;
    expect(scritturaDalPiano(dopo).cliente.customer_id).toBe(BETA);
    expect(scritturaDalPiano(dopo).ordine).toMatchObject({ client_name: "Cliente Beta" });
    expect(dopo.aree.cliente?.["cliente.contatto"]?.valore).toBeNull();
    expect(dopo.aree.cliente?.["cliente.client_address"]?.valore).toBeNull();
  });

  it("una nuova conferma dello stesso cliente conserva il referente, i recapiti e la sede verificati", () => {
    const piano = applica(prima(), { tipo: "cambia_valore", area: "cliente", chiave: "cliente.nome", valore: { client_company: "Impresa di Prova", client_name: "Referente di Prova" } }).piano;
    const dopo = scegli(piano, ALFA, "Impresa di Prova", "amministrazione@example.org").piano;
    expect(dopo.aree.cliente?.["cliente.nome"]?.valore).toEqual({ client_company: "Impresa di Prova", client_name: "Referente di Prova" });
    expect(dopo.aree.cliente?.["cliente.contatto"]?.valore).toEqual(piano.aree.cliente?.["cliente.contatto"]?.valore);
    expect(dopo.aree.cliente?.["cliente.client_address"]?.valore).toBe("Sede Alfa");
  });

  it("esclude una comunicazione già approvata per il cliente precedente", () => {
    const piano = applica(prima(), { tipo: "cambia_valore", area: "comunicazione", chiave: "comunicazione.avvio_cliente", valore: { tipo: "avvio_cliente", titolo: "Avvio", testo: "Buongiorno Cliente Alfa", destinatario: "alfa@example.org", canale: "email" } }).piano;
    const dopo = scegli(piano, BETA, "Cliente Beta").piano;
    expect(dopo.aree.comunicazione?.["comunicazione.avvio_cliente"]?.valore).toBeNull();
    expect(scritturaDalPiano(dopo).promemoria).toEqual([]);
  });

  it("annulla l'intera scelta del cliente in un solo passo", () => {
    const piano = prima();
    const dopo = scegli(piano, BETA, "Cliente Beta", "beta@example.org");
    expect(annulla(dopo.piano, dopo.storia).piano.aree).toEqual(piano.aree);
  });
});
