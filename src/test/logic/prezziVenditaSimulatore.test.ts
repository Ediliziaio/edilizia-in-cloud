import { describe, expect, it } from "vitest";
import { preparaProveVendita } from "@/lib/orders/generali/prezziVendita";
import { calcolaIpotesi, ipotesiDiPartenza } from "@/lib/orders/generali/simulatore";

function ipotesi(costoLavori: number) {
  const ip = ipotesiDiPartenza("compravendita","2027-01");
  ip.acquisto = 260000;
  ip.impostePct = 4;
  ip.oneri = 1600;
  ip.tecniciPct = ip.imprevistiPct = ip.commercializzazionePct = 0;
  ip.tipologie = [{id:"casa",nome:"Casa",mq:100,prezzoMq:3300,quante:1,costoMq:null}];
  ip.ritocchi = { costruzione:{importo:costoLavori}, "vendite:casa":{importo:330000} };
  return ip;
}

describe("Prezzo di vendita a parità di margine", () => {
  it("distingue margine in euro e percentuale usando le due ipotesi", () => {
    const precedente = ipotesi(4608.19), progetto = ipotesi(12938.89);
    const prova = preparaProveVendita(precedente,progetto)!;
    expect(prova.base).toMatchObject({margine:53391.81,costi:276608.19,ricavi:330000});
    expect(prova.prezzoPariEuro).toBe(338330.70);
    expect(prova.prezzoPariPercentuale).toBe(339938.72);
    expect(prova.simula(350000)).toMatchObject({margine:65061.11,differenza:11669.30});
    expect(prova.simula(339938.72)!.marginePct).toBeGreaterThanOrEqual(prova.base.marginePct!);
    expect(prova.simula(339938.71)!.marginePct).toBeLessThan(prova.base.marginePct!);
    expect(progetto.ritocchi["vendite:casa"].importo).toBe(330000);
  });

  it("ricalcola le commissioni e conserva gli altri ricavi nelle vendite con più unità", () => {
    const precedente = ipotesi(4608.19), progetto = ipotesi(12938.89);
    progetto.commercializzazionePct = 3;
    progetto.tipologie.push({id:"box",nome:"Box",mq:20,prezzoMq:1000,quante:1,costoMq:null});
    progetto.aggiunte = [{id:"r",tipo:"ricavo",categoria:"vendite",descrizione:"Ricavo aggiuntivo",importo:1500,dopoMesi:4,durataMesi:1}];
    const prova = preparaProveVendita(precedente,progetto)!;
    expect(prova.attuale).toBe(350000);
    const {costi,ricavi,margine} = calcolaIpotesi(progetto).numeri;
    expect(prova.simula(prova.attuale)).toMatchObject({costi,ricavi,margine});
    expect(prova.simula(350001.37)).toMatchObject({ricavi:351501.37,costi:295438.93});
    expect(prova.simula(prova.prezzoPariEuro!)!.margine).toBe(53391.81);
  });

  it("lascia il prezzo aperto quando la commissione assorbe interamente l'aumento", () => {
    const progetto = ipotesi(12938.89);
    progetto.commercializzazionePct = 100;
    const prova = preparaProveVendita(ipotesi(4608.19),progetto)!;
    expect(prova.prezzoPariEuro).toBeNull();
    expect(prova.prezzoPariPercentuale).toBeNull();
    expect(prova.simula(-1)).toBeNull();
  });
});
