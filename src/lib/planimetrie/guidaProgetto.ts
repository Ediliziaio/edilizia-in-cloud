/**
 * La guida di Silvio dopo il DWG (24/11/2026): chiede una cosa alla volta, solo quello che il
 * disegno non dice, e poi propone tavole, video e costo. Regole, niente AI: gratis e immediata.
 * Ogni azione porta al punto della scheda dove la cosa si fa, con anteprima e conferma.
 */
import { ambitiDi, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { riepilogoProgetto } from "./riepilogoProgetto";

/** Dove porta un'azione: una sezione della scheda, con l'eventuale punto da raggiungere. */
export type DestinazioneGuida =
  | { sezione: "dettagli"; ancora?: string }
  | { sezione: "pianta"; vista?: "3d"; silvio?: boolean }
  | { sezione: "studio" }
  | { sezione: "esporta" };

export interface PassoGuida {
  id: "tipo" | "unita" | "lotto" | "consegne";
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
    return { params: n };
  }
  return { params: n, ancora: verso.ancora };
}
