import { describe, expect, it } from "vitest";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { aPlanimetria, aggiornaQuote, daPlanimetria, piantaVuota, quoteNellaVista, type Muro, type Pianta, type Punto } from "@/components/planimetrie/editor/adattatore";
import { aggiungiApertura, aggiungiQuota } from "@/components/planimetrie/editor/comandi";
import { applicaModificaCad, preparaModificaCad, riferimentoCadVisibile, type ComandoCad } from "@/components/planimetrie/editor/comandiCad";
import { aggancia, dist, lunghezzaMuro, puntoSulMuro } from "@/components/planimetrie/editor/geometria";
import { abacoPareti, csvPareti } from "@/lib/planimetrie/abachi";
import { dividiContornoSulTramezzo } from "@/lib/planimetrie/frazionamento";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";

const muro = (id: string, p1: Punto, p2: Punto, stato: Muro["stato"] = "nuovo"): Muro => ({
  id, p1, p2, stato, tipo: "tramezzo", spessore: 12, altezza: 270, origine: "rilevata",
});
const orizzontale = muro("test", { x: 0, y: 200 }, { x: 600, y: 200 });
const traverso = (x: number, id: string = `m-${x}`) => muro(id, { x, y: 0 }, { x, y: 400 }, "esistente");
const pianta = (...muri: Muro[]): Pianta => ({ ...piantaVuota(), muri });
const prepara = (p: Pianta, comando: ComandoCad, riferimento: Muro, bersaglio: Muro, cursore: Punto) =>
  preparaModificaCad(p, { comando, vista: "progetto", riferimento, bersaglio, cursore });

describe("agganci precisi", () => {
  it("aggancia il centro e l’incrocio di assi senza portare le coordinate sulla griglia", () => {
    const obliquo = muro("d", { x: 0.3, y: 1.25 }, { x: 200.5, y: 101.75 });
    const rif = traverso(120.31);
    const p = pianta(obliquo, rif);
    const medio = aggancia(p, { x: 100.6, y: 51.6 }, { tolleranza: 5 });
    expect(medio).toEqual({ guida: "medio", punto: { x: 100.4, y: 51.5 }, ancora: { tipo: "medio", muroId: "d" } });
    const incrocio = aggancia(p, { x: 119, y: 61 }, { tolleranza: 5 });
    expect(incrocio).toMatchObject({ guida: "intersezione", ancora: { tipo: "intersezione", muroId: "d", altroMuroId: rif.id } });
    expect(incrocio.punto.x).toBeCloseTo(120.31, 8);
    expect(incrocio.punto.y).toBeCloseTo(1.25 + (120.31 - 0.3) * 100.5 / 200.2, 8);
    expect(aggancia(p, { x: 100.6, y: 51.6 }, { tolleranza: 5, precisione: false }).guida).toBe("parete");
    expect(aggancia(p, { x: 120, y: 61 }, { tolleranza: 5, visibile: s => riferimentoCadVisibile(s, "fatto") }).guida).toBe("parete");
    expect(aggancia(pianta(obliquo, traverso(214)), { x: 214, y: 108 }, { tolleranza: 15 }).guida).not.toBe("intersezione");
  });
});

describe("editing CAD e quantità", () => {
  it("divide il pavimento CAD se il tramezzo tocca il muro che contiene il filo del locale", () => {
    const contorno = [{ x: 0, y: 0 }, { x: 610, y: 0 }, { x: 610, y: 400 }, { x: 0, y: 400 }];
    const appoggio = { ...traverso(600), spessore: 35 };
    expect(dividiContornoSulTramezzo(contorno, orizzontale)).toBeNull();
    expect(dividiContornoSulTramezzo(contorno, orizzontale, [{ ...appoggio, stato: "da_demolire" }])).toBeNull();
    expect(dividiContornoSulTramezzo(contorno, { ...orizzontale, p2: { x: 580, y: 200 } }, [appoggio])).toBeNull();
    const parti = dividiContornoSulTramezzo(contorno, orizzontale, [appoggio]);
    expect(parti?.map(areaPoligono)).toEqual([118340, 118340]);
  });

  it("mantiene il pavimento della variante nelle zone generate dal tramezzo CAD", () => {
    const doc = nuovaPlanimetria("Prova DWG");
    doc.livelli[0].id = "cad-1";
    const est = { ...traverso(600), spessore: 35 };
    const p: Pianta = {
      ...pianta(est, orizzontale),
      locali: [{ id: "garage", nome: "Garage", destinazione: "garage", altezza: 270, stato: "esistente", origine: "rilevata", alFiloInterno: true,
        contorno: [{ x: 0, y: 0 }, { x: 610, y: 0 }, { x: 610, y: 400 }, { x: 0, y: 400 }] }],
      nomiProgetto: { garage: { nome: "Garage", destinazione: "garage", finiture: { pavimento: "Gres" } } },
    };
    const salvata = aPlanimetria(p, doc, "cad-1");
    const zone = salvata.livelli[0].proposte[0].locali;
    expect(zone).toHaveLength(2);
    expect(zone.map(l => l.finiture?.pavimento)).toEqual(["Gres", "Gres"]);
    expect(studioVariante(salvata, "A").righe.filter(r => r.descrizione.startsWith("Posa pavimento"))).toHaveLength(2);
  });

  it("taglia dal lato selezionato e mantiene il centro di un vano sul tratto conservato", () => {
    const rif = traverso(150);
    const conVano = aggiungiApertura(pianta(rif, orizzontale), orizzontale.id, "porta", 400, { stato: "nuovo" }).pianta;
    const r = prepara(conVano, "taglia", rif, orizzontale, { x: 50, y: 200 });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw Error(r.messaggio);
    const dopo = applicaModificaCad(conVano, r).pianta;
    expect(dopo.muri[0]).toBe(rif);
    expect(dopo.muri[1].p1).toEqual({ x: 150, y: 200 });
    expect(puntoSulMuro(dopo.muri[1], dopo.aperture[0].posizione)).toEqual(puntoSulMuro(orizzontale, conVano.aperture[0].posizione));
    expect(prepara(conVano, "taglia", rif, orizzontale, { x: 550, y: 200 })).toMatchObject({ ok: false, messaggio: expect.stringContaining("apertura") });
  });

  it("estende solo fino al tratto finito e lascia le pareti esistenti come riferimenti in progetto", () => {
    const rif = traverso(700), protetta = { ...orizzontale, stato: "esistente" as const };
    const p = pianta(rif, orizzontale);
    expect(prepara(p, "estendi", rif, orizzontale, { x: 580, y: 200 })).toMatchObject({ ok: true, muro: { p2: { x: 700, y: 200 } } });
    expect(prepara(p, "estendi", rif, orizzontale, { x: 10, y: 200 })).toMatchObject({ ok: false });
    expect(prepara(p, "estendi", { ...rif, p2: { x: 700, y: 160 } }, orizzontale, { x: 580, y: 200 })).toMatchObject({ ok: false });
    expect(prepara(pianta(rif, protetta), "estendi", rif, protetta, { x: 580, y: 200 })).toMatchObject({ ok: false });
  });

  it("offset ortogonale preciso su diagonale, con nuovo ID e senza aprire altri vani", () => {
    const d = muro("d", { x: 0, y: 0 }, { x: 300, y: 400 }, "esistente");
    const p = aggiungiApertura(pianta(d), d.id, "finestra", 150).pianta;
    const opzioni = { comando: "offset", vista: "progetto", riferimento: d, cursore: { x: -200, y: 100 }, distanzaCm: 125.5 } as const;
    const r = preparaModificaCad(p, opzioni);
    expect(r.ok).toBe(true);
    if (r.ok === false) throw Error(r.messaggio);
    const dopo = applicaModificaCad(p, r);
    expect(dopo.id).not.toBe(d.id);
    expect(dopo.pianta.aperture).toBe(p.aperture);
    expect(lunghezzaMuro(dopo.pianta.muri[1])).toBeCloseTo(500, 9);
    expect(dist(dopo.pianta.muri[1].p1, d.p1)).toBeCloseTo(125.5, 9);
    expect(preparaModificaCad(dopo.pianta, opzioni)).toMatchObject({ ok: false, messaggio: expect.stringContaining("già") });
  });

  it("aggiorna la quota associativa e la stessa lavorazione nel computo, conserva l’ambito e segnala un incrocio perso", () => {
    const inizio = traverso(150), fine = traverso(700);
    const base = pianta(inizio, fine, orizzontale);
    const aggiunta = aggiungiQuota(base, { x: 150, y: 200 }, orizzontale.p2, 42, { soloProgetto: true, riferimenti: {
      p1: { tipo: "intersezione", muroId: orizzontale.id, altroMuroId: inizio.id },
      p2: { tipo: "estremo", muroId: orizzontale.id, estremo: "p2" },
    } });
    const r = prepara(aggiunta.pianta, "estendi", fine, orizzontale, { x: 595, y: 200 });
    if (r.ok === false) throw Error(r.messaggio);
    const nuova = aggiornaQuote(applicaModificaCad(aggiunta.pianta, r).pianta);
    expect(nuova.quote?.[0].p2.x).toBe(700);
    expect(quoteNellaVista(nuova, "fatto")).toEqual([]);
    expect(quoteNellaVista(nuova, "progetto")[0].daRivedere).toBe(false);
    for (const [p, misurato, mq] of [[aggiunta.pianta, 6, 16.2], [nuova, 7, 18.9]] as const) {
      const doc = aPlanimetria(p);
      expect(validaPlanimetria(doc).ok).toBe(true);
      const ambito = "progetto:A";
      const q = calcolaQuantita(doc);
      expect(q[`${ambito}:muro:test.lunghezza_ml`]?.valore).toBe(misurato);
      expect(q[`${ambito}:muro:test.superficie_mq`]?.valore).toBe(mq);
      const abaco = abacoPareti(doc, doc.livelli[0].id, ambito, q);
      expect(abaco.find(x => x.id === "test")).toMatchObject({ lunghezzaMl: misurato, superficieMq: mq });
      expect(csvPareti(abaco)).toContain(String(mq).replace(".", ","));
      expect(studioVariante(doc, "A").righe).toEqual(expect.arrayContaining([expect.objectContaining({ descrizione: "Nuovo tramezzo", quantita: mq })]));
      expect(daPlanimetria(doc).quote?.[0]).toMatchObject({ id: aggiunta.id, riferimenti: aggiunta.pianta.quote![0].riferimenti, soloProgetto: true });
    }
    const senzaRiferimento = { ...nuova, muri: nuova.muri.filter(m => m.id !== inizio.id) };
    expect(quoteNellaVista(senzaRiferimento, "progetto")[0]).toMatchObject({ quota: { p1: { x: 150, y: 200 } }, daRivedere: true });
  });
});
