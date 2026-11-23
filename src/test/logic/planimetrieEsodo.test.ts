import { expect, it } from "vitest";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { nuovaPlanimetria, statoVuoto, type Apertura, type Muro } from "../../../shared/planimetrie/modello.ts";
import { esodoDellaVariante, firmaRiscontroTecnico, nuovoFascicoloUrbanistico, urbanisticaValida, type RiscontroTecnico } from "../../../shared/planimetrie/urbanistica.ts";

it("collega i due piani alle tavole e riapre entrambi i riscontri quando si sposta P2", () => {
  const doc = nuovaPlanimetria();
  const piano = doc.livelli[0];
  piano.quota = 300;
  const muro: Muro = { id: "confine", p1: { x: 0, y: 0 }, p2: { x: 400, y: 0 }, spessore: 12, altezza: 270,
    tipo: "tramezzo", stato: "esistente", origine: "da_documento" };
  const porta: Apertura = { id: "P2", muroId: muro.id, tipo: "porta", offset: 100, larghezza: 80, altezza: 210, davanzale: 0,
    manovra: "battente", stato: "esistente", origine: "da_documento" };
  piano.fatto.muri = [muro];
  piano.fatto.aperture = [porta];
  piano.proposte = [{ ...piano.fatto, id: "A", nome: "Due bilocali" }];
  doc.livelli.push({ id: "uscita", nome: "Piano uscita", quota: 0, fatto: statoVuoto(), proposte: [] });
  const data = "2026-11-21";
  const dati = nuovoFascicoloUrbanistico();
  dati.fonti = doc.livelli.map(l => ({
    id: l.id, titolo: "Tavola " + l.nome, ente: "Collaudo", acquisitaIl: data, tipo: "tavola", stato: "da_verificare",
    ruoloTavola: "esodo", url: "https://example.com/" + l.id + ".pdf",
  }));
  doc.urbanistica = dati;
  const tracciati = [{ nome: "Dalla porta alla scala", punti: [{ x: 140, y: 20 }, { x: 140, y: -30 }] }];
  dati.riscontriTecnici = doc.livelli.map((l, i): RiscontroTecnico => {
    const base = { varianteId: "A", livelloId: l.id, fonteId: l.id, criterio: "esodo" as const, tecnico: "Collaudo",
      riferimento: "Pagina 1", data, esito: "riscontrato" as const,
      esodo: { tracciati, simulazione: true, ...(i === 0 ? { prosegueAl: "uscita" } : { uscita: "Corte simulata" }) },
    };
    const firma = firmaRiscontroTecnico(doc, base);
    expect(firma).toBeTruthy();
    return { ...base, firma: firma! };
  });
  expect(urbanisticaValida(dati)).toBe(true);
  expect(esodoDellaVariante(doc, "A").map(x => x.stato)).toEqual(["simulazione", "simulazione"]);
  piano.proposte[0].aperture = [{ ...porta, offset: porta.offset + 20 }];
  expect(esodoDellaVariante(doc, "A").map(x => x.stato)).toEqual(["da_rinnovare", "da_rinnovare"]);
  expect(piano.fatto.aperture[0].offset).toBe(100);
  expect(dati.riscontriTecnici[0].esodo?.tracciati).toEqual(tracciati);
  piano.proposte[0].aperture = [porta];
  dati.fonti[0] = { ...dati.fonti[0], versione: "Tavola revisionata" };
  expect(esodoDellaVariante(doc, "A").map(x => x.stato)).toEqual(["da_rinnovare", "simulazione"]);
  expect(firmaRiscontroTecnico(doc, { ...dati.riscontriTecnici[1], fonteId: "inesistente" })).toBeNull();
});

it("sposta una P2 in un nuovo vano e conserva i contorni dei bilocali importati", () => {
  const doc = nuovaPlanimetria();
  const piano = doc.livelli[0];
  piano.fatto.muri = [{ id: "divisorio", p1: {x:0,y:0}, p2: {x:600,y:0}, spessore:10, altezza:270,
    tipo:"tramezzo", stato:"esistente", origine:"da_documento" }];
  piano.fatto.aperture = [{ id:"P2", muroId:"divisorio", tipo:"porta", offset:100, larghezza:80, altezza:210,
    davanzale:0, manovra:"battente", stato:"esistente", origine:"da_documento" }];
  const contorno = [{x:10,y:10},{x:580,y:10},{x:580,y:170},{x:350,y:170},{x:350,y:60},{x:10,y:60}];
  piano.proposte = [{ ...piano.fatto, id:"A", nome:"Due bilocali", distribuzioneBilocali:true,
    locali:[{ id:"passaggio", nome:"Passaggio B", destinazione:"disimpegno", unita:"B", contorno, altezza:270, origine:"da_documento" }] }];
  const pianta = daPlanimetria(doc,piano.id,"A");
  const contesto = { documento:doc, livelloId:piano.id, propostaId:"A" };
  const { passi, avvisi } = comandiDaChatDisegno(pianta,"progetto","Sposta la porta P2 di 120 cm verso fine",contesto);
  expect(avvisi).toEqual([expect.stringContaining("percorso d’esodo")]);
  expect(passi).toHaveLength(1);
  const dopo = aPlanimetria(passi[0].pianta,doc,piano.id,"A").livelli[0];
  expect(dopo.fatto.aperture[0]).toMatchObject({id:"P2",offset:100,stato:"esistente"});
  expect(dopo.proposte[0].aperture).toEqual(expect.arrayContaining([
    expect.objectContaining({id:"P2",offset:100,stato:"da_demolire"}),
    expect.objectContaining({offset:220,stato:"nuovo",larghezza:80}),
  ]));
  expect(dopo.proposte[0].locali[0]).toMatchObject({id:"passaggio",unita:"B",contorno});
});
