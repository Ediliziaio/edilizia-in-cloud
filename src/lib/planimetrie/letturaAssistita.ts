import { aggiungiParete, chiudiStanze, MISURE_APERTURA } from "@/components/planimetrie/editor/comandi";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { distanza, puntoNelPoligono, proiezioneSulSegmento } from "../../../shared/planimetrie/geometria.ts";
import type { ElementoLetturaTavola, PuntoTavola, TipoTavola } from "../../../shared/planimetrie/letturaAssistita.ts";
import type { Livello, Muro, Planimetria, Punto, Ricalco, StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { leggiTavolaTecnica } from "./analisiTavola";
import { rilevaSullaTavola } from "./rilevaTavola";
import { aperturaCopertaDaiCanali, dentroTavola } from "./tavolaTecnica";
import { conAperturaVerificata, posizioneVano } from "./verificaTavola";

export const ETICHETTE_TAVOLA: Record<TipoTavola, string> = { muro: "Muro", porta: "Porta", finestra: "Finestra", scala: "Scala", locale: "Nome del locale" };

export async function leggiTavolaArchiviata(url: string, signal: AbortSignal) {
  const risposta = await fetch(url, { signal });
  if (!risposta.ok) throw new Error("Tavola non disponibile. Riapri il piano e riprova.");
  return leggiImmagineTavola(await risposta.blob(), signal);
}

export async function leggiImmagineTavola(file: Blob, signal: AbortSignal, schizzo = false) {
  const { tavola, righe, etichetteLette } = await leggiTavolaTecnica(file, signal, { schizzo });
  const { larghezza, altezza } = tavola.raster;
  const testi = tavola.tipo === "hvac" ? righe.filter((riga) => dentroTavola(riga, tavola.area)) : righe;
  const elementi = rilevaSullaTavola(tavola.raster, testi, schizzo);
  return {
    elementi: tavola.tipo === "hvac" ? elementi.filter((e) =>
      (e.tipo !== "porta" && e.tipo !== "finestra") || !aperturaCopertaDaiCanali(e.zona, tavola)) : elementi,
    etichetteLette, righe, larghezza, altezza,
  };
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

function coordinate(p: PuntoTavola, ricalco: Ricalco) {
  return { x: arrotonda(ricalco.x + p.x * ricalco.larghezzaCm), y: arrotonda(ricalco.y - p.y * ricalco.larghezzaCm * ricalco.proporzione) };
}

/** Un varco può interrompere le linee della parete nella tavola. Si collega il
 * tratto solo quando entrambe le estremità corrispondono a muri già nel modello. */
function trattoTraMuri(muri: Muro[], da: Punto, a: Punto): Muro | undefined {
  const luce = distanza(da, a);
  if (luce < 5) return undefined;
  const verso = { x: (a.x - da.x) / luce, y: (a.y - da.y) / luce };
  const estremi = muri.filter((m) => m.stato !== "da_demolire").flatMap((muro) => [
    { muro, punto: muro.p1, opposto: muro.p2 }, { muro, punto: muro.p2, opposto: muro.p1 },
  ]);
  const lato = (p: Punto, segno: number) => estremi.filter(({ muro, punto, opposto }) => {
    const tratto = distanza(punto, opposto);
    const parallelo = ((opposto.x - punto.x) * verso.x + (opposto.y - punto.y) * verso.y) / tratto;
    return distanza(p, punto) <= Math.min(12, Math.max(5, muro.spessore / 2)) && parallelo * segno > 0.98;
  }).sort((m, n) => distanza(p, m.punto) - distanza(p, n.punto))[0];
  const prima = lato(da, -1);
  const dopo = lato(a, 1);
  if (!prima || !dopo || prima.muro.id === dopo.muro.id || distanza(prima.punto, dopo.punto) < 5) return undefined;
  return { ...prima.muro, id: crypto.randomUUID(), p1: prima.punto, p2: dopo.punto,
    altezza: Math.min(prima.muro.altezza, dopo.muro.altezza), origine: "da_documento" };
}

function applicaAlPiano(doc: Planimetria, piano: Livello, ricalco: Ricalco, elemento: ElementoLetturaTavola): StatoPianta {
  const { zona, tratto, tipo } = elemento;
  if (tipo === "locale") {
    const posizione = coordinate({ x: zona.x + zona.larghezza / 2, y: zona.y + zona.altezza / 2 }, ricalco);
    const nome = elemento.nome!.trim();
    const locale = piano.fatto.locali.find((l) => puntoNelPoligono(posizione, l.contorno));
    return locale ? { ...piano.fatto, locali: piano.fatto.locali.map((l) => l === locale ? { ...l, nome } : l) }
      : { ...piano.fatto, testi: [...piano.fatto.testi, { id: crypto.randomUUID(), posizione, testo: nome, rotazione: 0 }] };
  }
  if (!tratto) throw new Error("La proposta non ha posizioni da inserire.");
  const da = coordinate(tratto.da, ricalco);
  const a = coordinate(tratto.a, ricalco);
  const spessore = arrotonda(tratto.spessore * ricalco.larghezzaCm);
  const lunghezza = arrotonda(distanza(da, a));
  const centro = { x: (da.x + a.x) / 2, y: (da.y + a.y) / 2 };

  if (tipo === "muro") {
    if (spessore < 1) throw new Error("Verifica la scala della tavola e lo spessore di questo muro.");
    const duplicato = piano.fatto.muri.some((muro) => [da, a].every((p) => distanza(p, proiezioneSulSegmento(p, muro.p1, muro.p2).punto) <= Math.min(8, muro.spessore / 2)));
    if (duplicato) return piano.fatto;
    const esito = aggiungiParete(daPlanimetria(doc, piano.id), { ...da, y: -da.y }, { ...a, y: -a.y }, { spessore, origine: "da_documento" });
    if (!esito.id) throw new Error("Il tratto è troppo corto per essere aggiunto come muro.");
    return aPlanimetria(chiudiStanze(esito.pianta), doc, piano.id).livelli.find((l) => l.id === piano.id)!.fatto;
  }
  if (tipo === "scala") {
    const sopra = doc.livelli.filter((l) => l.quota > piano.quota).sort((l, r) => l.quota - r.quota)[0];
    return { ...piano.fatto, elementi: [...piano.fatto.elementi, {
      id: crypto.randomUUID(), tipo: "scala", posizione: centro,
      rotazione: Math.abs(da.x - a.x) > Math.abs(da.y - a.y) ? 90 : 0,
      larghezza: spessore, profondita: lunghezza, altezza: sopra ? sopra.quota - piano.quota : 280,
      stato: "esistente", origine: "stimata",
    }] };
  }

  let stato = piano.fatto;
  let vano: ReturnType<typeof posizioneVano>;
  try { vano = posizioneVano(stato, centro, tipo, lunghezza); }
  catch {
    const sostegno = trattoTraMuri(stato.muri, da, a);
    if (!sostegno) throw new Error("Apri l’editor e traccia per intero la parete del vano, poi conferma la proposta.");
    stato = { ...stato, muri: [...stato.muri, sostegno] };
    vano = { muro: sostegno, larghezza: arrotonda(distanza(sostegno.p1, sostegno.p2)), offset: 0 };
  }
  const { muro, larghezza, offset } = vano;
  const distanzaDaAsse = (p: typeof da) => distanza(p, proiezioneSulSegmento(p, muro.p1, muro.p2).punto);
  if ([da, a].some((p) => distanzaDaAsse(p) > Math.max(5, muro.spessore / 2))) {
    throw new Error("La parete selezionata non segue il vano. Allineala nell’editor prima di confermare.");
  }
  const misure = MISURE_APERTURA[tipo];
  const davanzale = Math.min(misure.davanzale, Math.max(0, muro.altezza - 30));
  const completo = conAperturaVerificata(stato, {
    id: crypto.randomUUID(), muroId: muro.id, tipo, larghezza, offset, davanzale,
    altezza: Math.min(misure.altezza, muro.altezza - davanzale), manovra: "battente", stato: "esistente", origine: "stimata",
    origineMisure: { larghezza: "da_documento", offset: "da_documento" },
  }, false);
  if (stato === piano.fatto) return completo;
  const conVano = { ...doc, livelli: doc.livelli.map((l) => l === piano ? { ...l, fatto: completo } : l) };
  return aPlanimetria(chiudiStanze(daPlanimetria(conVano, piano.id)), conVano, piano.id).livelli.find((l) => l.id === piano.id)!.fatto;
}

export function esaminaPropostaTavola(doc: Planimetria, livelloId: string, id: string, esito: "inserito" | "scartato", bozzaInScalaIndicativa = false): Planimetria {
  const piano = doc.livelli.find((p) => p.id === livelloId);
  const lettura = piano?.letturaAssistita;
  if (!piano || !lettura || !piano.ricalco || lettura.percorso !== piano.ricalco.percorso) throw new Error("La tavola del piano è cambiata.");
  const elemento = lettura.elementi.find((e) => e.id === id);
  if (!elemento || elemento.stato !== "da_verificare") return doc;
  const indicativa = esito === "inserito" && piano.ricalco.calibrata !== true;
  if (indicativa && !bozzaInScalaIndicativa) throw new Error("Imposta la scala del piano nell’editor prima di aggiungere elementi.");
  const fatto = esito === "inserito" ? applicaAlPiano(doc, piano, piano.ricalco, elemento) : piano.fatto;
  return { ...doc, livelli: doc.livelli.map((l) => l === piano ? {
    ...l, fatto, ...(indicativa ? { riscontroScala: { stato: "da_verificare" } as const } : {}),
    letturaAssistita: { ...lettura, elementi: lettura.elementi.map((e) => e === elemento ? { ...e, stato: esito } : e) },
  } : l) };
}

export type TipoTracciaTavola = Extract<TipoTavola, "muro" | "porta" | "finestra">;

export function aggiornaLarghezzaTavolaIndicativa(doc: Planimetria, livelloId: string, metri: number): Planimetria {
  if (!Number.isFinite(metri) || metri < 1 || metri > 1000) throw new Error("Indica una larghezza di lavoro tra 1 e 1000 m.");
  const piano = doc.livelli.find((p) => p.id === livelloId);
  if (!piano?.ricalco || piano.ricalco.calibrata || piano.ricalco.bloccata) throw new Error("La tavola del piano ha già una scala fissata.");
  if (piano.fatto.muri.length || piano.proposte.length || piano.fatto.quote.length || piano.fatto.elementi.length || piano.fatto.locali.length
    || piano.fatto.testi.length || piano.fatto.aree?.length) throw new Error("Con geometria già disegnata, calibra la scala dall’editor.");
  const larghezzaCm = Math.round(metri * 100);
  return { ...doc, livelli: doc.livelli.map((l) => l === piano ? {
    ...l, ricalco: { ...piano.ricalco!, larghezzaCm, calibrata: false }, riscontroScala: { stato: "da_verificare" },
  } : l) };
}

export function aggiungiTracciaSullaTavola(doc: Planimetria, livelloId: string, tipo: TipoTracciaTavola, da: PuntoTavola, a: PuntoTavola, spessoreCm: number) {
  const piano = doc.livelli.find((p) => p.id === livelloId);
  if (!piano?.ricalco) throw new Error("La tavola del piano non è disponibile.");
  if ([da.x, da.y, a.x, a.y].some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error("Scegli due punti dentro la tavola.");
  if (distanza(coordinate(da, piano.ricalco), coordinate(a, piano.ricalco)) < 5) throw new Error("Scegli due punti distanti almeno 5 cm sulla bozza.");
  const spessore = spessoreCm / piano.ricalco.larghezzaCm;
  if (!Number.isFinite(spessore) || spessore <= 0 || spessore > 1) throw new Error("Indica uno spessore valido.");
  const margine = Math.max(0.003, spessore / 2);
  const x = Math.max(0, Math.min(da.x, a.x) - margine);
  const y = Math.max(0, Math.min(da.y, a.y) - margine);
  const id = `${tipo}-traccia-${crypto.randomUUID()}`;
  const lettura = piano.letturaAssistita?.percorso === piano.ricalco.percorso ? piano.letturaAssistita
    : { percorso: piano.ricalco.percorso, elementi: [] };
  if (lettura.elementi.length >= 400) throw new Error("Continua il ricalco nell’editor della planimetria.");
  const numero = lettura.elementi.filter((e) => e.id.startsWith(`${tipo}-traccia-`)).length + 1;
  const elemento: ElementoLetturaTavola = {
    id, tipo, nome: `${ETICHETTE_TAVOLA[tipo]} ricalcato · ${numero}`, stato: "da_verificare", tratto: { da, a, spessore },
    zona: { x, y, larghezza: Math.min(1, Math.max(da.x, a.x) + margine) - x, altezza: Math.min(1, Math.max(da.y, a.y) + margine) - y },
  };
  const conTraccia = { ...doc, livelli: doc.livelli.map((p) => p === piano ? {
    ...p, letturaAssistita: { ...lettura, elementi: [...lettura.elementi, elemento] },
  } : p) };
  return { documento: esaminaPropostaTavola(conTraccia, livelloId, id, "inserito", true), id };
}
