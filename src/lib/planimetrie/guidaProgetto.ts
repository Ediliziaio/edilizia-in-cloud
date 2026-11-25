/**
 * La guida di Silvio dopo il DWG (24/11/2026): chiede una cosa alla volta, solo quello che il
 * disegno non dice, e poi propone tavole, video e costo. Regole, niente AI: gratis e immediata.
 * Ogni azione porta al punto della scheda dove la cosa si fa, con anteprima e conferma.
 */
import { ambitiDi, statoDelLivello, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { assiDelMuro, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { riepilogoProgetto } from "./riepilogoProgetto";

/** Dove porta un'azione: una sezione della scheda, con l'eventuale punto da raggiungere. */
export type DestinazioneGuida =
  | { sezione: "dettagli"; ancora?: string }
  | { sezione: "pianta"; vista?: "3d"; silvio?: boolean; livello?: string }
  | { sezione: "studio" }
  | { sezione: "esporta" };

export interface PassoGuida {
  id: "tipo" | "unita" | "lotto" | "completezza" | "consegne";
  domanda: string;
  dettaglio?: string;
  azioni: Array<{ etichetta: string; verso: DestinazioneGuida }>;
}

const mq = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²`;

/** I passi ancora da fare, nell'ordine: il primo è la domanda di adesso. */
export function passiGuidaProgetto(doc: Planimetria, chiave: string): PassoGuida[] {
  const passi: PassoGuida[] = [];
  const conVarianti = doc.livelli.some((l) => l.proposte.length > 0);
  const riepilogo = riepilogoProgetto(doc, ambitiDi(doc).some((a) => a.chiave === chiave) ? chiave : "fatto");
  if (!doc.costruzione && !conVarianti) {
    passi.push({
      id: "tipo",
      domanda: doc.livelli.length > 1
        ? `Ho letto ${doc.livelli.length} piani. Cosa si fa su questo edificio: si costruisce da zero, si sopraeleva o si ristruttura?`
        : "Cosa si fa qui: si costruisce da zero o si ristruttura?",
      dettaglio: "Da questa scelta dipendono il computo (scavi e strutture, o demolizioni e rifacimenti) e i tempi.",
      azioni: [{ etichetta: "Scegli piano per piano", verso: { sezione: "dettagli", ancora: "nuova-costruzione" } }],
    });
  }
  const nonTornano = riepilogo.unita.filter((u) => u.torna === false);
  if (nonTornano.length) {
    const u = nonTornano[0];
    passi.push({
      id: "unita",
      domanda: nonTornano.length === 1
        ? `L'${u.nome.toLowerCase()} misura ${mq(u.nettaMq)} contro i ${mq(u.dichiarata?.suMq ?? 0)} della legenda: manca qualche stanza.`
        : `${nonTornano.length} unità non tornano con la legenda (la prima: ${u.nome}, ${mq(u.nettaMq)} contro ${mq(u.dichiarata?.suMq ?? 0)}).`,
      dettaglio: "Nell'editor selezioni la stanza e le dai l'unità, o chiudi il contorno che manca.",
      azioni: [{ etichetta: "Vedi le unità", verso: { sezione: "dettagli" } }, { etichetta: "Apri la pianta", verso: { sezione: "pianta" } }],
    });
  }
  const lottoStimato = doc.livelli.some((l) => (l.fatto.aree ?? []).some((a) => a.tipo === "lotto" && /da verificare/i.test(a.nome ?? "")));
  if (lottoStimato) {
    passi.push({
      id: "lotto",
      domanda: "Il confine del lotto non è disegnato nel DWG: l'ho stimato da edificio, verde e piscine.",
      dettaglio: "Controllalo sulla pianta del piano terra: conta per recinzioni, superficie coperta e sistemazioni esterne.",
      azioni: [{ etichetta: "Controlla il lotto", verso: { sezione: "pianta" } }],
    });
  }
  const mancanze = mancanzeProgetto(doc, chiave);
  if (mancanze.length) {
    const [prima] = mancanze;
    passi.push({
      id: "completezza",
      domanda: mancanze.length === 1 ? `Per un progetto completo manca una cosa: ${prima.testo}.`
        : `Per un progetto completo mancano ${mancanze.length} cose. La prima: ${prima.testo}.`,
      dettaglio: mancanze.length > 1 ? mancanze.slice(1, 4).map((m) => m.testo).join(" · ") : undefined,
      azioni: [{ etichetta: `Apri ${prima.piano}`, verso: { sezione: "pianta", livello: prima.livelloId } }],
    });
  }
  passi.push({
    id: "consegne",
    domanda: passi.length ? "Quando hai finito, ti preparo il resto:" : "Il progetto è pronto. Cosa ti preparo?",
    azioni: [
      { etichetta: "Tavole in PDF", verso: { sezione: "esporta" } },
      { etichetta: "Vista 3D e video", verso: { sezione: "pianta", vista: "3d" } },
      { etichetta: "Quanto costa", verso: { sezione: "studio" } },
    ],
  });
  return passi;
}

export interface MancanzaProgetto { livelloId: string; piano: string; tipo: "stanze" | "scala" | "copertura" | "accesso"; testo: string }

const SCALE = ["scala", "scala_u", "scala_chiocciola", "ascensore"];

/**
 * Cosa manca perché il progetto sia completo, piano per piano (24/11/2026): un piano con muri ma
 * senza stanze chiuse (niente pavimenti, solai, computo), un piano senza scala verso quello sopra,
 * l'ultimo piano senza copertura impostata. Un piano solo non ha bisogno di scale.
 */
export function mancanzeProgetto(doc: Planimetria, chiave: string): MancanzaProgetto[] {
  const ambito = ambitiDi(doc).find((a) => a.chiave === chiave) ?? ambitiDi(doc)[0];
  const piani = [...doc.livelli].sort((a, b) => a.quota - b.quota)
    .map((l) => ({ livello: l, stato: statoDelLivello(l, ambito) ?? l.fatto }))
    .filter((p) => p.stato.muri.length || p.stato.locali.length);
  const esito: MancanzaProgetto[] = [];
  piani.forEach(({ livello, stato }, i) => {
    const base = { livelloId: livello.id, piano: livello.nome.toLowerCase() };
    if (stato.muri.length && !stato.locali.length) {
      esito.push({ ...base, tipo: "stanze", testo: `${livello.nome}: nessuna stanza chiusa, quindi niente pavimenti, solai e voci nel computo` });
    }
    const sopra = piani[i + 1];
    if (sopra && !stato.elementi.some((e) => SCALE.includes(e.tipo))) {
      esito.push({ ...base, tipo: "scala", testo: `${livello.nome}: nessuna scala per salire a ${sopra.livello.nome.toLowerCase()}` });
    }
    if (!sopra && piani.length > 1 && !livello.tetto) {
      esito.push({ ...base, tipo: "copertura", testo: `${livello.nome}: copertura non impostata (nel 3D resta un tetto piano)` });
    }
  });
  esito.push(...unitaSenzaIngresso(piani));
  return esito;
}

/** Si guarda 40 cm oltre ciascuna faccia della porta: abbastanza dentro la stanza anche se il DWG la disegna all'incirca. */
const SONDA_CM = 40;

/**
 * Le unità senza una porta d'ingresso (25/11/2026): una porta (o un varco) che da una stanza
 * dell'unità dà fuori dall'unità, sul vano scala, sul corridoio comune o all'aperto. Le porte
 * fra due stanze della stessa unità non contano, e nemmeno le portefinestre: da un terrazzo
 * non si entra in casa. Basta un ingresso su un piano qualunque (un duplex ne ha uno solo).
 */
function unitaSenzaIngresso(piani: Array<{ livello: Planimetria["livelli"][number]; stato: Planimetria["livelli"][number]["fatto"] }>): MancanzaProgetto[] {
  const unita = new Map<string, { livelloId: string; piano: string; conIngresso: boolean }>();
  for (const { livello, stato } of piani) {
    const muri = new Map(stato.muri.filter((m) => m.stato !== "da_demolire").map((m) => [m.id, m]));
    const porte = stato.aperture.filter((a) => a.stato !== "da_demolire" && (a.tipo === "porta" || a.tipo === "varco"));
    const perUnita = new Map<string, typeof stato.locali>();
    for (const l of stato.locali) {
      const nome = l.unita?.trim();
      if (nome) perUnita.set(nome, [...(perUnita.get(nome) ?? []), l]);
    }
    for (const [nome, stanze] of perUnita) {
      const dentro = (p: { x: number; y: number }) => stanze.some((l) => puntoNelPoligono(p, l.contorno));
      const ingresso = porte.some((a) => {
        const m = muri.get(a.muroId);
        if (!m) return false;
        const { dir, normale } = assiDelMuro(m);
        const t = a.offset + a.larghezza / 2, d = m.spessore / 2 + SONDA_CM;
        const c = { x: m.p1.x + dir.x * t, y: m.p1.y + dir.y * t };
        return dentro({ x: c.x + normale.x * d, y: c.y + normale.y * d }) !== dentro({ x: c.x - normale.x * d, y: c.y - normale.y * d });
      });
      const prima = unita.get(nome);
      if (!prima) unita.set(nome, { livelloId: livello.id, piano: livello.nome.toLowerCase(), conIngresso: ingresso });
      else prima.conIngresso ||= ingresso;
    }
  }
  return [...unita].filter(([, u]) => !u.conIngresso).sort(([a], [b]) => a.localeCompare(b, "it", { numeric: true }))
    .map(([nome, u]) => ({ livelloId: u.livelloId, piano: u.piano, tipo: "accesso", testo: `${nome}: non trovo la porta d'ingresso (dal vano scala o da fuori), controllala o aggiungila` }));
}

/** I parametri della scheda per arrivare a una destinazione (vedi RenderPlanimetriaScheda). */
export function parametriGuida(attuali: URLSearchParams, verso: DestinazioneGuida): { params: URLSearchParams; ancora?: string } {
  const n = new URLSearchParams(attuali);
  for (const k of ["studio", "esporta", "vista", "silvio", "analisi"]) n.delete(k);
  if (verso.sezione === "studio") { n.set("studio", "1"); n.delete("sezione"); return { params: n }; }
  if (verso.sezione === "esporta") { n.set("esporta", "pdf"); return { params: n }; }
  n.set("sezione", verso.sezione);
  if (verso.sezione === "pianta") {
    if (verso.vista) n.set("vista", verso.vista);
    if (verso.silvio) n.set("silvio", "1");
    if (verso.livello) n.set("livello", verso.livello);
    return { params: n };
  }
  return { params: n, ancora: verso.ancora };
}
