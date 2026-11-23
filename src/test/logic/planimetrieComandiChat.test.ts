import { expect, it } from "vitest";
import { aperturaNellaVista, aPlanimetria, daPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { aggiungiStanzaDaMisure, eliminaMuro, modificaMuro } from "@/components/planimetrie/editor/comandi";
import { analizzaProgetto } from "@/lib/planimetrie/analisiProgetto";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { controllaPlanimetria } from "../../../shared/planimetrie/controllo";
import { areaPoligono } from "../../../shared/planimetrie/geometria";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { percorsiDaElementi } from "../../../shared/planimetrie/impianti";

it("usa l’unità comune del lotto e seleziona le viste di calcio, padel e tennis dalla chat", () => {
  const { passi, avvisi } = comandiDaChatDisegno(piantaVuota(),"fatto",[
    "Lotto 90 × 65 m",
    "Aggiungi un campo da calcio a 5, uno da padel e uno da tennis",
    "Fai il render dei campi",
  ].join("\n"));
  expect(avvisi).toEqual(["Controlla accessi, fasce libere e quote del terreno sul rilievo."]);
  expect(passi[0].pianta.aree?.[0].contorno).toContainEqual({x:9000,y:6500});
  const p = passi[1].pianta;
  expect(p.elementi?.map(e=>e.tipo)).toEqual(["campo_calcio5","campo_padel","campo_tennis"]);
  expect(passi[2].vistaRichiesta).toEqual("render-sport");
  expect(comandiDaChatDisegno(p,"fatto","Fai il redner del padle").passi[0].vistaRichiesta).toEqual("render:campo_padel");
  expect(comandiDaChatDisegno(p,"fatto","Render del condominio").passi[0].vistaRichiesta).toEqual("render-edificio");
  expect(comandiDaChatDisegno(p,"fatto","Fammi il render fotorealistico del centro sportivo").passi[0].vistaRichiesta).toEqual("foto:render-sport");
  expect(comandiDaChatDisegno(p,"fatto","Fai il render fotorealistico del padel").passi[0].vistaRichiesta).toEqual("foto:render:campo_padel");
  expect(comandiDaChatDisegno(p,"fatto","Genera i render fotorealistici del condominio").passi[0].vistaRichiesta).toEqual("foto:render-edificio");
  const piccolo = comandiDaChatDisegno(piantaVuota(),"fatto","Lotto 18 × 9 m").passi[0].pianta;
  const respinta = comandiDaChatDisegno(piccolo,"fatto","Disegna un campo da padel");
  expect(respinta.passi).toHaveLength(0);
  expect(respinta.avvisi[0]).toContain("spazio libero");
});

it("legge piedi e pollici dalla tavola del garage senza scambiarli per metri", () => {
  const { passi, avvisi } = comandiDaChatDisegno(piantaVuota(), "fatto", "Garage 23′2″ × 31′");
  expect(avvisi).toEqual([]);
  expect(passi[0].testo).toContain("7,06 m × 9,45 m");
});

it("costruisce stanze adiacenti, parete condivisa, porta e finestra con misure reali", () => {
  const base = piantaVuota();
  const { passi, avvisi } = comandiDaChatDisegno(base, "fatto", [
    "Cucina 3,20 × 4,10 m",
    "Ingresso 2 × 2,5 m a destra della cucina",
    "Porta tra ingresso e cucina da 80 cm",
    "Finestra cucina sul lato alto da 120 cm",
  ].join("\n"));
  expect(avvisi).toEqual([]);
  expect(passi.map(p => [p.pianta.locali.length, p.pianta.aperture.length])).toEqual([[1, 0], [2, 0], [2, 1], [2, 2]]);
  const p = passi.at(-1)!.pianta;
  expect(base.locali).toHaveLength(0);
  expect(p.muri).toHaveLength(7);
  expect(p.aperture.map(a => a.larghezza)).toEqual([80, 120]);
  expect(passi[0].testo).toContain("13,12 m²");
  expect(validaPlanimetria(aPlanimetria(p))).toMatchObject({ ok: true });
});

it("progetta arredi, linee di impianto, esterni e serramenti conservando il rilievo", () => {
  const fatto = comandiDaChatDisegno(piantaVuota(), "fatto", [
    "Soggiorno 4,50 × 4,10 m",
    "Camera 3,40 × 4,10 m a destra del soggiorno",
    "Bagno 3,40 × 2,60 m sotto la camera",
    "Finestra camera sul lato alto da 120 cm",
  ].join("\n"));
  expect(fatto.avvisi).toEqual([]);
  const base = fatto.passi.at(-1)!.pianta;
  const progetto = comandiDaChatDisegno(base, "progetto", [
    "Arreda tutte le stanze",
    "Impianto elettrico per tutte le stanze",
    "Impianto idrico in bagno",
    "Patio 4 × 2 m a destra della casa",
    "Finestra soggiorno sul lato sinistro da 120 cm",
    "Zanzariera plissé alla finestra del soggiorno sul lato sinistro",
    "Zanzariera verticale alla finestra della camera",
    "Varco tra camera e bagno da 90 cm",
    "Apri il 3D",
    "Fai i render di tutta la casa",
  ].join("\n"));
  expect(progetto.passi).toHaveLength(10);
  expect(progetto.passi.slice(-2).map(p => p.vistaRichiesta)).toEqual(["3d", "render"]);
  const modificata = progetto.passi.at(-1)!.pianta;
  const conSalvataggio = aPlanimetria(modificata);
  expect(validaPlanimetria(conSalvataggio)).toMatchObject({ ok: true });
  const [piano] = conSalvataggio.livelli;
  const [variante] = piano.proposte;
  expect(piano.fatto.locali).toHaveLength(3);
  expect(piano.fatto.aperture).toEqual([expect.objectContaining({ id: base.aperture[0].id })]);
  expect(piano.fatto.aperture[0].zanzariera).toBeUndefined();
  expect(piano.fatto.elementi).toHaveLength(0);
  expect(variante.aperture).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: base.aperture[0].id, zanzariera: "verticale", stato: "esistente" }),
    expect.objectContaining({ tipo: "finestra", zanzariera: "plisse", stato: "nuovo" }),
    expect.objectContaining({ tipo: "varco", larghezza: 90 }),
  ]));
  expect(variante.aree).toEqual([expect.objectContaining({ tipo: "pavimentato", nome: "Patio" })]);
  const impianti = percorsiDaElementi(variante.elementi.map(e => ({ id: e.id, tipo: e.tipo, posizione: e.posizione })), variante.locali.map(l => l.contorno));
  expect(new Set(impianti.percorsi.map(p => p.linea))).toEqual(new Set(["elettrica", "acqua", "scarico"]));
  const riletta = daPlanimetria(conSalvataggio);
  const apertura = riletta.aperture.find(a => a.id === base.aperture[0].id)!;
  expect(aperturaNellaVista(riletta, apertura, "progetto").zanzariera).toBe("verticale");
  expect(aperturaNellaVista(riletta, apertura, "fatto").zanzariera).toBeUndefined();
  const ripeti = comandiDaChatDisegno(riletta, "progetto", "Impianto elettrico per tutte le stanze");
  expect(ripeti.passi[0].pianta).toBe(riletta);
});

it("usa il nome riconoscibile per proporre gli arredi di un locale senza una destinazione specifica", () => {
  const { pianta } = aggiungiStanzaDaMisure(piantaVuota(), 400, 500, { nome: "Soggiorno", destinazione: "altro" });
  const esito = comandiDaChatDisegno(pianta, "fatto", "Arreda il soggiorno");
  expect(esito.passi[0].pianta.elementi?.map(e => e.tipo)).toEqual(expect.arrayContaining(["divano_angolare", "mobile_tv"]));
  expect(esito.passi[0].pianta.locali[0].destinazione).toBe("altro");
  expect(pianta.elementi ?? []).toHaveLength(0);
});

it("propone arredi e impianti nelle zone interne aperte importate da CAD", () => {
  const esito = comandiDaChatDisegno(piantaVuota(), "fatto", "Cucina 4 × 3 m\nSoggiorno 4 × 3 m a destra della cucina");
  const base = esito.passi.at(-1)!.pianta;
  const giardino = {
    ...base.locali[0], id: "giardino", nome: "Giardino", destinazione: "giardino" as const,
    contorno: base.locali[0].contorno.map(p => ({ x: p.x + 1600, y: p.y })),
  };
  const aperta = { ...base, locali: [...base.locali, giardino].map(l => ({ ...l, aperto: true })) };
  const lavoro = comandiDaChatDisegno(aperta, "progetto", "Metti un divano in soggiorno\nImpianto idrico in cucina\nImpianto idrico nel giardino");
  expect(lavoro.passi).toHaveLength(2);
  expect(lavoro.passi[0].pianta.elementi?.some(e => e.tipo === "divano")).toBe(true);
  expect(lavoro.passi[1].pianta.elementi?.some(e => e.tipo === "collettore")).toBe(true);
  expect(lavoro.avvisi.at(-1)).toContain("Indica un ambiente interno");
});

it("ridimensiona una stanza e restituisce la superficie calcolata", () => {
  const originale = comandiDaChatDisegno(piantaVuota(), "fatto", "Bagno 2,10 × 2,40 m").passi[0].pianta;
  const { passi, avvisi } = comandiDaChatDisegno(originale, "fatto", "Ridimensiona il bagno a 2,40 × 2,50 m\nMisura bagno");
  expect(avvisi).toEqual([]);
  expect(passi[1].testo).toContain("6 m²");
  expect(passi[1].pianta).toBe(passi[0].pianta);
  expect(passi[0].pianta.locali[0].id).toBe(originale.locali[0].id);
});

it("le misure date a una stanza che esiste già la correggono, anche per due stanze nella stessa frase", () => {
  const base = comandiDaChatDisegno(piantaVuota(), "fatto", "Disimpegno 4,20 × 1,23 m").passi[0].pianta;
  const { passi, avvisi } = comandiDaChatDisegno(base, "fatto", "Il disimpegno misura 3,00 x 1,20 m e la cameretta 3,00 x 2,80 m a destra del disimpegno");
  expect(avvisi).toEqual([]);
  expect(passi).toHaveLength(2);
  expect(passi[0].pianta.locali[0].id).toBe(base.locali[0].id);
  expect(passi[0].testo).toContain("3,6 m²");
  expect(passi[1].testo).toContain("8,4 m²");
  expect(passi[1].pianta.locali).toHaveLength(2);
});

it("segnala gli ordini ambigui, conserva le stanze e protegge lo stato di fatto nel progetto", () => {
  const originale = comandiDaChatDisegno(piantaVuota(), "fatto", "Cucina 3 × 4 m").passi[0].pianta;
  const { passi, avvisi } = comandiDaChatDisegno(originale, "progetto", "Ridimensiona cucina a 4 × 5 m\nBagno 2 × 2 m a destra dello studio\nPorta tra ingresso e cucina");
  expect(passi).toHaveLength(0);
  expect(avvisi).toHaveLength(3);
  expect(originale.locali).toHaveLength(1);
});

it("capisce le misure dettate in parole e conserva l'origine di stima", () => {
  const { passi, avvisi } = comandiDaChatDisegno(piantaVuota(), "fatto", [
    "Cucina tre virgola venti per quattro virgola dieci metri",
    "Disegna ingresso 2x2,5 a destra della cucina",
    "Porta tra ingresso e cucina da ottantacinque centimetri",
    "Misura la cucina",
  ].join("\n"));
  expect(avvisi).toEqual([]);
  expect(passi).toHaveLength(4);
  expect(passi[2].pianta.aperture).toMatchObject([{ larghezza: 85, origine: "stimata" }]);
  expect(passi[3].testo).toContain("13,12 m²");
  const bagno = comandiDaChatDisegno(piantaVuota(), "fatto", "Bagno 2 × 2 m").passi[0].pianta;
  const modifica = comandiDaChatDisegno(bagno, "fatto", "Ridimensiona bagno a due e quaranta per due e cinquanta");
  expect(modifica.avvisi).toEqual([]);
  expect(modifica.passi[0].testo).toContain("6 m²");
  expect(modifica.passi[0].pianta.muri.every(m => m.origine === "stimata")).toBe(true);
});

it("separa una dettatura continua e chiede chiarimenti sulle azioni ambigue", () => {
  const esito = comandiDaChatDisegno(piantaVuota(), "fatto",
    "Fai una cucina tre virgola venti per quattro metri. Poi aggiungi ingresso due per due metri a destra della cucina. Infine misura cucina.");
  expect(esito.avvisi).toEqual([]);
  expect(esito.passi).toHaveLength(3);
  expect(esito.passi[2].testo).toContain("12,8 m²");
  const chiarimento = comandiDaChatDisegno(esito.passi[2].pianta, "fatto", "Porta tra cucina e ripostiglio da ottanta centimetri");
  expect(chiarimento.passi).toEqual([]);
  expect(chiarimento.avvisi[0]).toContain("«ripostiglio» non è presente");
});

it("riconosce una porta tra ambienti con una congiunzione nel nome", () => {
  const stato = comandiDaChatDisegno(piantaVuota(), "fatto", "Ingresso 3 × 4 m\nSoggiorno 3 × 4 m a destra dell’ingresso").passi.at(-1)!.pianta;
  const base = { ...stato, locali: stato.locali.map(l => l.destinazione === "ingresso" ? { ...l, nome: "Ingresso e scala" } : l) };
  const esito = comandiDaChatDisegno(base, "progetto", "Porta tra ingresso e scala e soggiorno da 90 cm");
  expect(esito.passi[0].pianta.aperture).toMatchObject([{ tipo: "porta", larghezza: 90, stato: "nuovo" }]);
  const muro = base.muri.find(m => m.id === esito.passi[0].pianta.aperture[0].muroId)!;
  const centro = { x: (muro.p1.x + muro.p2.x) / 2, y: (muro.p1.y + muro.p2.y) / 2 };
  const occupato = { ...base, elementi: [{ id: "scala", tipo: "scala", etichetta: "Rampa", centro,
    larghezza: 100, profondita: 450, rotazione: 0, stato: "esistente" as const, origine: "rilevata" as const }] };
  const bloccata = comandiDaChatDisegno(occupato, "progetto", "Porta tra ingresso e scala e soggiorno da 90 cm");
  expect(bloccata.passi).toHaveLength(0);
  expect(bloccata.avvisi[0]).toContain("Il passaggio incontra «Rampa»");
});

it("propone demolizione e costruzione nella variante con quantità verificabili", () => {
  const { passi: statoDiFatto } = comandiDaChatDisegno(piantaVuota(), "fatto",
    "Cucina 3 × 4 m\nSoggiorno 3 × 4 m a destra della cucina\nBagno 3 × 2,5 m");
  const base = statoDiFatto.at(-1)!.pianta;
  const { passi, avvisi } = comandiDaChatDisegno(base, "progetto",
    "Demolisci il tramezzo tra cucina e soggiorno\nAggiungi un tramezzo nel bagno a 1,50 m dal lato sinistro alto 2,80 m\nMisura bagno");
  expect(passi).toHaveLength(3);
  expect(avvisi).toHaveLength(2);
  const p = passi.at(-1)!.pianta;
  const livello = aPlanimetria(p).livelli[0];
  expect(livello.fatto.muri).toEqual(aPlanimetria(base).livelli[0].fatto.muri);
  expect(livello.proposte[0].muri.filter(m => m.stato !== "esistente").map(m => [m.stato, m.altezza]))
    .toEqual([["da_demolire", 270], ["nuovo", 280]]);
  expect(passi[1].testo).toContain("7,28 m² lordi");
  expect(passi[2].testo).toContain("3,63 m²");
  expect(livello.proposte[0].locali).toHaveLength(3);
  const quantita = calcolaQuantita(aPlanimetria(p));
  const ambito = "progetto:" + livello.proposte[0].id;
  expect(quantita[ambito + ":costruzioni.muri_mq"].valore).toBeCloseTo(7.28);
  expect(quantita[ambito + ":demolizioni.muri_mq"].valore).toBeCloseTo(11.07);
  expect(validaPlanimetria(aPlanimetria(p))).toMatchObject({ ok: true });
});

it("taglia il locale CAD senza trasformare un vuoto chiuso in una stanza della variante", () => {
  const stanza = aggiungiStanzaDaMisure(piantaVuota(), 308, 287, { nome: "Locale da riscontrare" });
  const vuoto = aggiungiStanzaDaMisure(stanza.pianta, 300, 320, { origineIn: { x: 750, y: 0 }, nome: "Vuoto" });
  const ingressoCad = aPlanimetria({ ...vuoto.pianta, locali: stanza.pianta.locali.map(l => ({ ...l, origine: "stimata" })) });
  const livello = ingressoCad.livelli[0];
  livello.id = "cad-2";
  const pianta = daPlanimetria(ingressoCad, livello.id);
  const contesto = { documento: ingressoCad, livelloId: livello.id, propostaId: "A" };
  const misura = comandiDaChatDisegno(pianta, "progetto", "Misura Locale da riscontrare", contesto);
  expect(misura.passi[0].testo).toContain("8,84 m² · stima dal disegno");
  const nonVerificata = { ...ingressoCad, livelli: [{ ...livello, riscontroScala: { stato: "da_verificare" as const } }] };
  const senzaScala = comandiDaChatDisegno(pianta, "progetto", "Misura Locale da riscontrare", { ...contesto, documento: nonVerificata });
  expect(senzaScala.passi[0].testo).toContain("Scala da riscontrare");

  const esito = comandiDaChatDisegno(pianta, "progetto", "Tramezzo nel Locale da riscontrare a 55 cm dal lato destro alto 2,45 m", contesto);
  const { pianta: modificata } = esito.passi[0];
  const bozza = aPlanimetria(modificata, ingressoCad, livello.id);
  const [proposta] = bozza.livelli[0].proposte;
  expect(proposta.locali).toHaveLength(2);
  expect(proposta.locali.every(l => l.origine === "stimata")).toBe(true);
  expect(proposta.locali.reduce((totale, l) => totale + areaPoligono(l.contorno), 0)).toBeCloseTo((308 - 10) * 287);
  const [tramezzo] = proposta.muri.filter(m => m.stato === "nuovo");
  expect(studioVariante(bozza, proposta.id).righe).toMatchObject([{ id: tramezzo.id, quantita: null }]);

  const verificata = modificaMuro(modificata, tramezzo.id, { altezza: 245, origineAltezza: "rilevata" });
  const finale = aPlanimetria(verificata, ingressoCad, livello.id);
  expect(studioVariante(finale, proposta.id).righe).toMatchObject([{ id: tramezzo.id, quantita: 7.28, stimata: true }]);
  const finaleSenzaScala = { ...finale, livelli: [{ ...finale.livelli[0], riscontroScala: { stato: "da_verificare" as const } }] };
  expect(studioVariante(finaleSenzaScala, proposta.id).righe).toMatchObject([{ id: tramezzo.id, quantita: null, quantificazioneSospesa: true }]);
  expect(finale.livelli[0].fatto.locali).toEqual(livello.fatto.locali);
  const porzione = proposta.locali.find(l => l.nome === "Stanza")!;
  const assenzaPassaggio = (documento: typeof finale) => analizzaProgetto(documento, "progetto:A").find(e => e.titolo === "Locali senza passaggio");
  expect(assenzaPassaggio(finale)?.posizione?.locali).toContain(porzione.id);

  const riaperta = daPlanimetria(finale, livello.id, "A");
  const passaggio = comandiDaChatDisegno(riaperta, "progetto", "Varco tra Locale da riscontrare e Stanza da 80 cm", { ...contesto, documento: finale });
  expect(passaggio.avvisi).toEqual([]);
  const conVarco = aPlanimetria(passaggio.passi[0].pianta, finale, livello.id);
  expect(conVarco.livelli[0].proposte[0].aperture).toMatchObject([{ muroId: tramezzo.id, tipo: "varco", larghezza: 80 }]);
  expect(conVarco.livelli[0].proposte[0].locali.map(l => l.id)).toEqual(proposta.locali.map(l => l.id));
  expect(assenzaPassaggio(conVarco)).toBeUndefined();
  expect(controllaPlanimetria(conVarco).filter(e => e.gravita === "errore")).toEqual([]);
});

it("fa riscontrare la funzione di una parete CAD separatamente dalle misure", () => {
  const muro = { id: "cad-1-m9", p1: { x: 0, y: 0 }, p2: { x: 400, y: 0 }, spessore: 12, altezza: 270,
    tipo: "tramezzo" as const, stato: "esistente" as const, origine: "rilevata" as const };
  const pianta = { ...piantaVuota(), muri: [muro] };
  const istruzione = "Demolisci il tramezzo cad-1-m9";
  expect(comandiDaChatDisegno(pianta,"progetto",istruzione).avvisi[0]).toContain("funzione della parete");
  expect(eliminaMuro(pianta, muro.id, "progetto")).toBe(pianta);
  const classificata = modificaMuro(pianta,muro.id,{tipo:"tramezzo",funzioneDaVerificare:false});
  const salvata = aPlanimetria(classificata);
  expect(salvata.livelli[0].fatto.muri[0].funzioneDaVerificare).toBe(false);
  const proposta = comandiDaChatDisegno(daPlanimetria(salvata),"progetto",istruzione);
  expect(proposta.passi[0].pianta.muri[0].stato).toBe("da_demolire");
});

it("protegge muri portanti e aperture esistenti dalle istruzioni ambigue", () => {
  const { passi: statoDiFatto } = comandiDaChatDisegno(piantaVuota(), "fatto",
    "Cucina 3 × 4 m\nSoggiorno 3 × 4 m a destra della cucina\nFinestra cucina sul lato alto da 120 cm");
  const base = statoDiFatto.at(-1)!.pianta;
  const strutturale = { ...base, muri: base.muri.map(m => ({ ...m, tipo: "portante" as const })) };
  const esito = comandiDaChatDisegno(strutturale, "progetto",
    "Demolisci la parete tra cucina e soggiorno\nTramezzo in cucina a 1,50 m dal lato sinistro");
  expect(esito.passi).toEqual([]);
  expect(esito.avvisi[0]).toContain("richiede un tramezzo esistente");
  expect(esito.avvisi[1]).toContain("finirebbe su un’apertura");
  const fuoriVariante = comandiDaChatDisegno(base, "fatto", "Demolisci il tramezzo tra cucina e soggiorno");
  expect(fuoriVariante.passi).toEqual([]);
  expect(fuoriVariante.avvisi[0]).toContain("Passa a «Progetto»");
});
