import { describe, expect, it } from "vitest";
import dati from "../fixtures/computiPubblici20261119.json";
import { abacoDalComputo, riepilogoAbaco } from "@/lib/distinta/abacoComputo";
import { generaDistinta, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { serviziDelComputo } from "@/lib/distinta/serviziComputo";
import { articoliDalPiano, pianoOperativoContratto } from "@/lib/orders/pianoOperativoContratto";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import { verificaDaOrigini } from "@/lib/distinta/verificaAcquisto";
import { faseOperativaDalTesto } from "../../../supabase/functions/_shared/computoFasiOperative";

const siracusa = dati["siracusa-infissi"] as VoceComputo[];
const notaresco = dati["notaresco-impianti"] as VoceComputo[];
const genera = (voci: VoceComputo[]) => generaDistinta({ voci, scomposizioni: [], riserva: catalogoComeScomposizioni() });

describe("riscontri indipendenti su computi pubblici, novembre 2026", () => {
  it("Siracusa: legge dieci serramenti e un portone, escludendo gli scuretti dal conteggio dei serramenti", () => {
    const abaco = abacoDalComputo(siracusa);
    expect(riepilogoAbaco(abaco.filter(a => a.famiglia === "serramento"))).toMatchObject({ posizioni: 7, pezzi_ricostruiti: 11, posizioni_con_dimensioni: 7 });
    expect(riepilogoAbaco(abaco.filter(a => a.famiglia === "oscurante"))).toMatchObject({ posizioni: 6, pezzi_ricostruiti: 10 });
  });
  it("il rinvio esplicito degli scuretti riusa le sei posizioni della voce 4, con la fonte conservata", () => {
    const scuretti = abacoDalComputo(siracusa).filter(a => a.numero_voce === "6");
    expect(scuretti).toHaveLength(6);
    expect(scuretti.every(a => a.riferimento_misure?.numero_voce === "4")).toBe(true);
    expect(scuretti[0]).toMatchObject({ pezzi: 2, larghezza_m: 1.32, altezza_m: 3.22, superficie_contabile_mq: 8.5 });
    expect(scuretti[0].avvisi.join(" ")).toMatch(/Misure richiamate dalla voce 4/);
  });
  it("non trasferisce dimensioni se il rinvio ha un'altra superficie o identifica due voci", () => {
    const diversa = siracusa.map(v => v.numero_ordine === "6" ? { ...v, quantita: 42 } : v);
    const a = abacoDalComputo(diversa).filter(a => a.numero_voce === "6");
    expect(a).toHaveLength(1); expect(a[0].larghezza_m).toBeNull();
    const doppia = [...siracusa, { ...siracusa.find(v => v.numero_ordine === "4")!, id: "duplicata" }];
    expect(abacoDalComputo(doppia).filter(a => a.numero_voce === "6")).toHaveLength(1);
  });
  it("i serramenti e il portone hanno un controllo tecnico; collocazione non resta nel nome del prodotto", () => {
    const r = genera(siracusa).righe;
    expect(r.find(m => m.descrizione.startsWith("Portone esterno"))?.verifica_acquisto?.stato).toBe("da_verificare");
    expect(r.find(m => m.descrizione.startsWith("Serramenti in legno"))?.verifica_acquisto?.stato).toBe("da_verificare");
    expect(r.some(m => /^E collocazione/i.test(m.descrizione))).toBe(false);
  });
  it("incastri, bisellatura e gocciolatoio sono lavorazioni delle lastre, senza acquisti di pulitura o cinque incastri", () => {
    const r = genera(siracusa);
    expect(r.righe.some(m => /^(Incastri|Pulitura|Bisellatura|Gocciolatoio)/i.test(m.descrizione))).toBe(false);
    const servizi = serviziDelComputo(siracusa);
    expect(servizi.filter(s => ["9", "10", "11"].includes(s.numero ?? ""))).toHaveLength(3);
    expect(servizi.find(s => s.numero === "10")).toMatchObject({ quantita: 4.83, tipo: "prestazione" });
  });
  it("una pompa di calore con compressore inverter non genera inverter fotovoltaici, staffe o cavi FV", () => {
    const voci = notaresco.filter(v => ["142", "177"].includes(v.numero_ordine ?? ""));
    const r = genera(voci).righe;
    expect(r.reduce((s, m) => s + m.quantita_calcolata, 0)).toBe(2);
    expect(r.every(m => /^Pompa di calore inverter/i.test(m.descrizione))).toBe(true);
    expect(r.some(m => /Cavo lato alternata|Staffa a parete|Inverter fotovoltaico/.test(m.descrizione))).toBe(false);
  });
  it("il fancoil mantiene PT 4,00 e PF 1,50 kW, senza prendere la potenza dalla nota della stanza", () => {
    const r = genera(notaresco).righe.find(m => m.descrizione.startsWith("Ventilconvettore"))!;
    expect(r.quantita_calcolata).toBe(12);
    expect(r.descrizione).toMatch(/PT 4,00 kW.*PF 1,50 kW/);
    expect(r.descrizione).not.toContain("2.5 kW");
  });
  it("il comando separato e la valvola della voce propria non spariscono dopo la deduplicazione", () => {
    const r = genera(notaresco).righe;
    expect(r.find(m => /^Pannello di comando con termostato/.test(m.descrizione))).toMatchObject({ quantita_calcolata: 12, unita_misura: "pz", verifica_acquisto: { stato: "da_verificare" } });
    expect(r.find(m => /^VALVOLA A SFERA/i.test(m.descrizione))).toMatchObject({ quantita_calcolata: 12, unita_misura: "cad" });
    expect(r.some(m => m.descrizione === "Valvola a tre vie con attuatore")).toBe(false);
  });
  it("lo scavo compreso nel degrassatore resta un servizio incluso, senza un articolo Scavo da 1 pezzo", () => {
    expect(genera(notaresco.filter(v => v.numero_ordine === "160")).righe.some(m => /^Scavo/i.test(m.descrizione))).toBe(false);
  });
  it("la quantità tariffaria 2,18 del kit FV non diventa un numero di pannelli o inverter", () => {
    const voci = dati["umberto-fotovoltaico"] as VoceComputo[];
    const r = genera(voci);
    expect(r.righe).toHaveLength(0); expect(r.senzaScomposizione).toHaveLength(1);
    expect(voci[0].quantita).toBe(2.18);
  });
  it("le verifiche delle rese sopravvivono al salvataggio del piano da contratto", () => {
    const piano = pianoOperativoContratto(parseContractExtract({ voci: [{ descrizione: "Fornitura e posa di massetto autolivellante spessore 4 cm", quantita: 25, unita: "mq" }] }));
    const salvati = JSON.parse(JSON.stringify(articoliDalPiano(piano)));
    expect(salvati.length).toBeGreaterThan(0);
    for (const r of salvati) expect(verificaDaOrigini(r.origini)?.stato).toBe("da_verificare");
  });
  it("recupera le unità annotate tra parentesi o quadre senza modificare la lettura AI", () => {
    const e = parseContractExtract({ voci: [
      { descrizione: "Fornitura e posa di massetto autolivellante spessore 4 cm [mq.]", quantita: 25 },
      { descrizione: "Demolizione di pavimento (mq)", quantita: 25 },
      { descrizione: "Informazione dei lavoratori [h.]", quantita: 4 },
    ] });
    const originale = JSON.stringify(e), p = pianoOperativoContratto(e);
    expect(p.materiali.length).toBeGreaterThan(0);
    expect(p.vociDaScomporre).toBe(0);
    expect(p.fasi.flatMap(f => f.lavorazioni).map(l => l.unita)).toEqual(expect.arrayContaining(["mq.", "mq"]));
    expect(p.materiali.some(m => /informazione|demolizione/i.test(m.descrizione))).toBe(false);
    expect(JSON.stringify(e)).toBe(originale);
  });
  it("propone i pezzi di un prodotto contato, mantenendo U.M. mancante e blocco acquisto nel dato salvato", () => {
    const e = parseContractExtract({ voci: [{ descrizione: "EA722 - Batterie piombo-acido libero EXIDE 12V 72Ah", quantita: 40 }] });
    const p = pianoOperativoContratto(e), salvati = JSON.parse(JSON.stringify(articoliDalPiano(p)));
    expect(e.voci[0].unita).toBeUndefined();
    expect(salvati).toHaveLength(1);
    expect(salvati[0]).toMatchObject({ quantity: 40, unita_misura: "pz" });
    expect(verificaDaOrigini(salvati[0].origini)?.stato).toBe("da_verificare");
    expect(verificaDaOrigini(salvati[0].origini)?.motivi.join(" ")).toMatch(/non è stampata/);
    for (const o of salvati[0].origini) {
      expect(o.dati_documentali.quantita).toBe("ricostruita");
      expect(o.dati_documentali.fonti.every((f: { unita: string | null }) => f.unita === null)).toBe(true);
    }
  });
  it("non assume pezzi per quantità frazionarie, superfici o lotti senza unità", () => {
    const p = pianoOperativoContratto(parseContractExtract({ voci: [
      { descrizione: "Pannelli fotovoltaici da 250 Wp", quantita: 2.18 },
      { descrizione: "Fornitura e posa di rasatura per interni", quantita: 115 },
      { descrizione: "Impianto fotovoltaico completo a corpo", quantita: 1 },
      { descrizione: "Pannelli fotovoltaici (20 pannelli da 440 Wp)", quantita: 1 },
    ] }));
    expect(p.materiali).toEqual([]);
    expect(p.vociDaScomporre).toBe(4);
  });
  it("un inverter off-grid contato conserva l'oggetto dell'offerta, senza accessori della ricetta FV generica", () => {
    const p = pianoOperativoContratto(parseContractExtract({ voci: [{ descrizione: "INV 6kWmon - Inverter monofase off grid pura onda sinusoidale", quantita: 1 }] }));
    expect(p.materiali).toHaveLength(1);
    expect(p.materiali[0]).toMatchObject({ descrizione: "Inverter monofase off grid pura onda sinusoidale", quantita_calcolata: 1, verifica_acquisto: { stato: "da_verificare" } });
    expect(p.materiali[0].dati_documentali?.quantita_documento).toBe(1);
  });
  it("una prima fase proposta non assorbe le lavorazioni diverse delle righe successive", () => {
    const p = pianoOperativoContratto(parseContractExtract({ voci: [
      { descrizione: "Demolizione pavimenti", quantita: 25, unita: "mq" },
      { descrizione: "Fornitura e posa di massetto autolivellante spessore 4 cm", quantita: 25, unita: "mq" },
      { descrizione: "Tinteggiatura con idropittura", quantita: 65, unita: "mq" },
      { descrizione: "Fornitura e posa di pompa di calore inverter aria-acqua", quantita: 1, unita: "cad" },
    ] }));
    expect(new Set(p.fasi.map(f => f.nome)).size).toBe(4);
    expect(p.fasi.every(f => f.lavorazioni.length === 1)).toBe(true);
    expect(p.fasi.find(f => /termic/i.test(f.nome))?.lavorazioni[0].descrizione).toMatch(/pompa di calore/);
  });
  it.each([
    ["Solo posa in opera di bidet fornito dalla Committenza", "Impianti idrici e sanitari"],
    ["Solo posa di rivestimento in piastrelle fornito dalla Committenza", "Massetti, pavimenti e rivestimenti"],
    ["Solo posa in opera di radiatore termoarredo", "Impianti termici e ventilazione"],
  ])("assegna la lavorazione alla fase anche quando il materiale è del cliente: %s", (testo, fase) => {
    expect(faseOperativaDalTesto(testo)).toBe(fase);
    const p = pianoOperativoContratto(parseContractExtract({ voci: [{ descrizione: testo, quantita: 3, unita: "n." }] }));
    expect(p.materiali).toEqual([]);
  });
});
