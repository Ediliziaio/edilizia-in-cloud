import { expect, it } from "vitest";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { arredaBilocali } from "@/components/planimetrie/editor/arredaBilocali";
import { muriSottoPennello, segnaDemolizioniDalPennello } from "@/components/planimetrie/editor/pennelloDemolizioni";
import { accessiDellaVariante, controllaAccessiPiano, controllaIngressiUnita } from "@/lib/planimetrie/accessiPlanimetria";
import { accessiBilocali, leggiRichiestaStudioBilocali, simulaBilocali, sintetizzaBilocali } from "@/lib/planimetrie/studioBilocali";
import { studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { distanzaDalContorno, puntoNelPoligono, ricostruisciLocali } from "../../../shared/planimetrie/geometria";
import { validaPlanimetria, type Punto } from "../../../shared/planimetrie/modello";
import { esempioBilocali, esempioBilocaliIrregolare } from "../fixtures/studioBilocali";

it("usa il tratto continuo per selezionare più tramezzi e conserva le pareti esterne", () => {
  const doc = esempioBilocali();
  const pianta = daPlanimetria(doc);
  const segni = muriSottoPennello(pianta.muri, { x: -30, y: -600 }, { x: 1450, y: -600 }, 12);
  expect(segni.daSegnare).toEqual(["camera-uno", "camera-due", "studio-oggi"]);
  expect(segni.protetti).toEqual(["ponente"]);
  const segnata = segnaDemolizioniDalPennello(pianta, [...segni.daSegnare, ...segni.protetti]);
  expect(segnata.muri.filter(m => m.stato === "da_demolire")).toHaveLength(3);
  expect(segnaDemolizioniDalPennello(segnata, segni.daSegnare)).toBe(segnata);
  expect(aPlanimetria(segnata, doc).livelli[0].fatto.muri.every(m => m.stato === "esistente")).toBe(true);
});

it("chiude tre bilocali con veri accessi e finestre e quantifica le alternative", () => {
  const doc = esempioBilocali();
  const piano = doc.livelli[0];
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  expect(studio.ok).toBe(true);
  if (!studio.ok) return;
  expect(studio.alternative).toHaveLength(2);
  for (const a of studio.alternative) {
    expect(a.criticita).toEqual([]);
    expect(a.unita.every(u => u.camera.finestre === 1 && u.soggiorno.finestre === 1)).toBe(true);
    expect(a.unita.every(u => u.ingresso.tipo === "comune" && u.ingresso.porta?.larghezza === 90 && !u.ingresso.ambientiScollegati.length)).toBe(true);
    expect(a.unita.every(u => u.bagno.disimpegno && (u.bagno.latoMinimoCm ?? 0) >= 120 && u.bagno.aerazione === "meccanica")).toBe(true);
    expect(a.proposta.aperture.filter(p => p.stato === "nuovo")).toHaveLength(12);
    const completo = { ...doc, livelli: [{ ...piano, proposte: [a.proposta] }] };
    expect(validaPlanimetria(completo)).toMatchObject({ ok: true });
    const ritorno = aPlanimetria(daPlanimetria(completo, "pt", "A"), completo, "pt", "A");
    expect(ritorno.livelli[0].proposte[0].locali.map(l => l.id).sort()).toEqual(a.proposta.locali.map(l => l.id).sort());
    const misure = studioVariante(ritorno, "A");
    expect(misure.unita).toHaveLength(3);
    expect(misure.righe.length).toBeGreaterThan(20);
    expect(misure.righe.filter(r => r.fase === "Impianti elettrici" && r.quantita === null)).toHaveLength(3);
    const arredato = arredaBilocali(a.proposta);
    expect(arredato.proposta.elementi.filter(e => e.tipo === "cucina")).toHaveLength(3);
    expect(arredato.proposta.elementi.filter(e => e.tipo === "wc")).toHaveLength(3);
    expect(arredato.proposta.elementi.filter(e => e.tipo === "letto_matrimoniale")).toHaveLength(3);
  }
  expect(studio.alternative[0].pavimentiDaPosareMq).toBeLessThan(studio.alternative[1].pavimentiDaPosareMq);
});

it("chiede quale ingresso usare soltanto se sono presenti più porte sul perimetro", () => {
  const piano = esempioBilocali().livelli[0];
  const ingresso = piano.fatto.aperture[0];
  piano.fatto.aperture.unshift({ ...ingresso, id: "secondo-ingresso", offset: 200 });
  expect(simulaBilocali(piano, { unita: 3, profilo: "milano" })).toMatchObject({ ok: false, serveIngresso: true });
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano", accessoId: "secondo-ingresso" });
  expect(studio.ok && studio.alternative.length).toBeGreaterThan(0);
  piano.fatto.aperture = piano.fatto.aperture.filter(a => a.tipo !== "porta");
  expect(simulaBilocali(piano, { unita: 3, profilo: "milano" })).toMatchObject({ ok: false, serveIngresso: true });
});

it("ricontrolla gli accessi dopo aver tolto una porta della variante o quella comune", () => {
  const doc = esempioBilocali();
  const piano = doc.livelli[0];
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  if (!studio.ok || !studio.alternative.length) throw new Error("Serve una distribuzione di prova");
  const proposta = studio.alternative[0].proposta;
  const primaPorta = proposta.aperture.find(a => a.stato === "nuovo")!;
  const modificata = { ...proposta, aperture: proposta.aperture.filter(a => a.id !== primaPorta.id) };
  expect(controllaIngressiUnita(modificata).ingressi.map(a => a.tipo)).toEqual(["mancante", "comune", "comune"]);
  piano.proposte = [modificata];
  expect(accessiDellaVariante(doc, proposta.id).map(a => a.esito)).toEqual(["assente", "collegato", "collegato"]);
  modificata.aperture = modificata.aperture.map(a => a.id === "accesso-principale" ? { ...a, tipo: "portafinestra" } : a);
  expect(controllaIngressiUnita(modificata).ingressi.every(a => a.tipo === "mancante")).toBe(true);
});

it("distingue la sola verifica in chat e misura la differenza fra due e tre unità sulla stessa sagoma", () => {
  expect(leggiRichiestaStudioBilocali("Posso ricavare tre bilocali a Milano?")).toMatchObject({ unita: 3, soloVerifica: true, profilo: "milano" });
  const piano = esempioBilocaliIrregolare("terrazzo").livelli[0];
  const due = sintetizzaBilocali(simulaBilocali(piano, { unita: 2, profilo: "milano" }));
  const tre = sintetizzaBilocali(simulaBilocali(piano, { unita: 3, profilo: "milano" }));
  expect(due.geometria).toBeLessThan(tre.geometria!);
  expect(tre.alternative).toBeGreaterThan(0);
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  if (studio.ok === false) throw Error(studio.motivo);
  const variante = studio.alternative[0].proposta;
  variante.locali.find(l => l.destinazione === "terrazzo")!.unita = "A";
  const esito = controllaAccessiPiano(variante);
  expect(esito.ingressi.map(a => a.tipo)).toEqual(["comune", "comune", "comune"]);
  expect(esito.senzaUnita).toHaveLength(0);
});

it("ferma presto lo studio quando la pianta rilevata contiene una scala", () => {
  const piano = esempioBilocali().livelli[0];
  piano.fatto.elementi.push({ id: "scala", etichetta: "Scala centrale", tipo: "scala", posizione: { x: 950, y: 400 },
    rotazione: 0, larghezza: 95, profondita: 230, origine: "da_documento" });
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  expect(studio).toMatchObject({ ok: false, causa: "struttura", motivo: expect.stringContaining("Scala centrale") });
  expect(sintetizzaBilocali(studio)).toMatchObject({ alternative: 0, criticita: null });
});

it("segnala i locali senza finestra del negozio e non ripartisce un muro portante", () => {
  const piano = esempioBilocali(true).livelli[0];
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  expect(studio.ok && studio.alternative.some(a => a.criticita.some(c => c.includes("senza finestra")))).toBe(true);
  const casa = esempioBilocali().livelli[0];
  casa.fatto.muri[5].tipo = "portante";
  expect(simulaBilocali(casa, { unita: 3, profilo: "milano" })).toMatchObject({ ok: false, motivo: expect.stringContaining("strutturali") });
});

it("distribuisce una pianta a L, conserva terrazzo, balcone e pilastro e trova le portefinestre", () => {
  const doc = esempioBilocaliIrregolare("terrazzo");
  const piano = doc.livelli[0];
  const studio = simulaBilocali(piano, { unita: 3, profilo: "milano" });
  if (studio.ok === false) throw Error(studio.motivo);
  expect(studio.omesse).toEqual([]);
  expect(studio.alternative).toHaveLength(2);
  const involucro = ricostruisciLocali(piano.fatto.muri.filter(m => m.tipo === "esterno"))[0].contornoAsse;
  for (const variante of studio.alternative) {
    expect(variante.pilastriConservati).toBe(1);
    expect(variante.proposta.elementi.find(e => e.tipo === "pilastro")?.posizione).toEqual({ x: 195, y: 780 });
    const tramezzi = variante.proposta.muri.filter(m => m.stato === "nuovo");
    for (const m of tramezzi) {
      expect([m.p1, m.p2].every(p => puntoNelPoligono(p, involucro) || distanzaDalContorno(p, involucro) <= .02)).toBe(true);
      expect(puntoNelPoligono({ x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 }, involucro)).toBe(true);
    }
    expect(variante.spaziEsterni).toEqual([
      { id: "terrazzo-ovest", nome: "Terrazzo ovest", mq: 13.55, accessibileDa: ["A"] },
      { id: "balcone-est", nome: "Balcone est", mq: 7, accessibileDa: ["C"] },
      { id: "corte", nome: "Corte d’ingresso", mq: 4.25, accessibileDa: [] },
    ]);
    expect(variante.unita.map(u => u.sigla)).toEqual(["A", "B", "C"]);
    expect(variante.proposta.locali.filter(l => l.aperto).every(l => !l.unita)).toBe(true);
    const completo = { ...doc, livelli: [{ ...piano, proposte: [variante.proposta] }] };
    expect(validaPlanimetria(completo)).toMatchObject({ ok: true });
    const salvato = aPlanimetria(daPlanimetria(completo, "pt", "A"), completo, "pt", "A");
    const esterni = salvato.livelli[0].proposte[0].locali.filter(l => l.aperto);
    expect(esterni).toMatchObject(variante.proposta.locali.filter(l => l.aperto));
    expect(esterni.every(l => !l.unita)).toBe(true);
    expect(salvato.livelli[0].proposte[0].aree).toMatchObject(piano.fatto.aree!);
    expect(studioVariante(salvato, "A").unita).toHaveLength(3);
  }
  piano.fatto.aperture = piano.fatto.aperture.map(a => a.id === "f0" ? { ...a, tipo: "porta" } : a);
  expect(accessiBilocali(piano).map(a => a.id)).toEqual(["accesso-principale"]);
});

it("riusa due ingressi indipendenti in una pianta obliqua, anche dopo aver ruotato la tavola", () => {
  const piano = esempioBilocaliIrregolare("ingressi").livelli[0];
  const angolo = Math.PI / 7;
  const ruota = (p: Punto): Punto => ({
    x: p.x * Math.cos(angolo) - p.y * Math.sin(angolo),
    y: p.x * Math.sin(angolo) + p.y * Math.cos(angolo),
  });
  piano.fatto.muri = piano.fatto.muri.map(m => ({ ...m, p1: ruota(m.p1), p2: ruota(m.p2) }));
  piano.fatto.locali = piano.fatto.locali.map(l => ({ ...l, contorno: l.contorno.map(ruota) }));
  expect(leggiRichiestaStudioBilocali("Fraziona l'appartamento in due bilocali a Milano con ingressi indipendenti"))
    .toMatchObject({ unita: 2, profilo: "milano", tipoAccesso: "indipendenti" });
  const studio = simulaBilocali(piano, { unita: 2, profilo: "milano", tipoAccesso: "indipendenti" });
  if (studio.ok === false) throw Error(studio.motivo);
  expect(studio.omesse).toEqual([]);
  expect(studio.alternative).toHaveLength(2);
  for (const a of studio.alternative) {
    expect(a.comuniMq).toBe(0);
    expect(a.ingressoComune).toBeUndefined();
    expect(a.unita.map(u => u.ingresso.tipo)).toEqual(["diretto", "diretto"]);
    expect(a.unita.every(u => u.soggiorno.finestre && u.camera.finestre)).toBe(true);
  }
  expect(simulaBilocali(piano, { unita: 3, profilo: "milano", tipoAccesso: "indipendenti" })).toMatchObject({ ok: false });
});
