// Che cosa dice ogni voce del computo, prima di generare qualcosa (23/11/2026).
//
// Il motore della distinta decide «materiale sì / materiale no» e scrive un motivo. Chi rivede
// il computo ha bisogno di una cosa in più: per OGNI voce, che natura ha (anche più d'una:
// «fornitura e posa di pavimento» è un materiale E una lavorazione), che cosa ne nasce, e che
// cosa resta da chiarire. Qui non si decide niente di nuovo sui materiali: si leggono le stesse
// regole (classificaVoce, classificaServizio) e si mettono in fila, voce per voce.
//
// Nessuna AI: è la base su cui l'AI propone, non il contrario.

import {
  classificaVoce, normalizzaTesto, VOCE_GENERICA,
  type CausaEsclusione, type OpzioniRiconoscimento, type RisultatoDistinta, type Scomposizione,
} from "./generaDistinta";
import { classificaServizio, type VoceServizio } from "./serviziComputo";
import { caratteristicheTecniche, stesseCaratteristiche } from "./caratteristicheVoce";

export type NaturaVoce =
  | "materiale" | "lavorazione" | "manodopera" | "subappalto" | "nolo" | "prestazione"
  | "fornitura_committente" | "economica" | "informativa" | "ambigua";

export const ETICHETTA_NATURA: Record<NaturaVoce, string> = {
  materiale: "Materiale da fornire",
  lavorazione: "Lavorazione",
  manodopera: "Manodopera",
  subappalto: "Ditta esterna",
  nolo: "Nolo",
  prestazione: "Trasporto, smaltimento o prestazione",
  fornitura_committente: "Fornito dal committente",
  economica: "Voce economica",
  informativa: "Voce informativa",
  ambigua: "Da chiarire",
};

/** Che cosa nasce dalla voce. */
export type EsitoVoce = "materiali" | "da_scomporre" | "servizio" | "nessun_acquisto" | "da_chiarire";

export interface VoceInterpretata {
  voce_id: string;
  numero: string | null;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  nature: NaturaVoce[];
  esito: EsitoVoce;
  /** In una riga, perché. */
  motivo: string;
  /** Le domande a cui rispondere prima di comprare. */
  daChiarire: string[];
  /** Formato, spessore, prestazioni lette nel testo. */
  caratteristiche: string[];
}

const SMALTIMENTO = /\b(?:smaltiment|discarica|conferiment|trasporto a rifiuto)/;
const SICUREZZA = /\b(?:oneri|costi) (?:di|della|per la) sicurezza\b|\bsicurezza\b.*\b(?:psc|cantiere)\b/;
const A_CORPO = /^(?:a corpo|a c\.?|corpo|ac|forfait|a forfait)$/i;

const NATURA_DELLA_CAUSA: Record<CausaEsclusione, NaturaVoce[]> = {
  tolta: ["informativa"],
  detrazione: ["economica"],
  quantita_mancante: ["ambigua"],
  sovrapprezzo: ["economica"],
  demolizione: ["lavorazione"],
  sicurezza: ["economica"],
  generica: ["economica", "ambigua"],
  subappalto: ["subappalto"],
  prestazione: ["prestazione"],
  nolo: ["nolo"],
  manodopera: ["manodopera"],
  smaltimento: ["prestazione"],
  assistenza: ["lavorazione"],
  solo_posa: ["lavorazione"],
  committente: ["lavorazione", "fornitura_committente"],
};

const unisci = (...n: NaturaVoce[]): NaturaVoce[] => [...new Set(n)];

export function interpretaVoce(v: VoceServizio, scomposizioni: Scomposizione[] = [], opzioni: OpzioniRiconoscimento = {}): VoceInterpretata {
  const c = classificaVoce(v, scomposizioni.filter((s) => s.attiva), opzioni);
  const servizio = classificaServizio(v);
  const testo = normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`);
  const breve = normalizzaTesto(v.descrizione_breve);
  const q = v.quantita == null ? null : Number(v.quantita);
  const aCorpo = !!v.a_corpo || A_CORPO.test((v.unita_misura ?? "").trim());
  const haMisure = (v.misure ?? []).some((m) => Number(m.quantita) > 0 || (m.descrizione ?? "").trim().length > 3);
  const base = {
    voce_id: v.id, numero: v.numero_ordine ?? null, descrizione: v.descrizione_breve.split("\n")[0],
    quantita: q, unita: v.unita_misura?.trim() || null,
    caratteristiche: caratteristicheTecniche(`${v.descrizione_breve}. ${v.descrizione_estesa ?? ""}`),
  };
  const daChiarire: string[] = [];
  const generica = VOCE_GENERICA.test(breve);
  const sicurezzaGenerica = (SICUREZZA.test(testo) || !!v.is_sicurezza) && aCorpo && !haMisure && breve.split(" ").length <= 8;

  // Una ricetta dell'azienda vince sul resto: l'ha scritta chi conosce il lavoro.
  const ricettaAzienda = c.tipo === "scomposta" && (c.fonte === "scomposizione" || c.fonte === "scomposizione_codice");

  if (!ricettaAzienda && (generica || sicurezzaGenerica)) {
    daChiarire.push(sicurezzaGenerica && !generica
      ? "Oneri di sicurezza senza dettaglio: serve l'elenco degli apprestamenti (recinzioni, cartelli, ponteggi, noli) dal PSC o dal computo della sicurezza. Senza, non si compra né si noleggia niente."
      : "Voce generica: che cosa comprende? Si compra qualcosa solo se c'è un dettaglio che lo dice.");
    if (!(q != null && q > 0)) daChiarire.push("Manca la quantità.");
    return { ...base, nature: unisci("economica", "ambigua"), esito: "da_chiarire", daChiarire,
      motivo: sicurezzaGenerica && !generica ? "Oneri di sicurezza a corpo: registrati, da dettagliare" : "Voce generica: registrata, da chiarire" };
  }

  if (!ricettaAzienda && servizio) {
    const natura: NaturaVoce = servizio.tipo === "nolo" ? "nolo" : servizio.tipo === "manodopera" ? "manodopera"
      : servizio.tipo === "subappalto" ? "subappalto" : servizio.tipo === "trasferimento" ? "economica" : "prestazione";
    if (servizio.tipo === "nolo" && !servizio.mesi && !(q != null && q > 0)) daChiarire.push("Durata del nolo.");
    if (servizio.tipo === "subappalto") daChiarire.push("Conferma che i materiali sono compresi nel prezzo della ditta.");
    // Una demolizione con lo smaltimento compreso resta una lavorazione, con in più una prestazione da pagare.
    const nature: NaturaVoce[] = c.tipo === "esclusa" && c.causa === "demolizione" ? ["lavorazione", natura] : [natura];
    return { ...base, nature, esito: servizio.tipo === "trasferimento" ? "nessun_acquisto" : "servizio", motivo: servizio.nota, daChiarire };
  }

  if (c.tipo === "esclusa") {
    const causa = c.causa ?? "prestazione";
    let nature = NATURA_DELLA_CAUSA[causa];
    // «Demolizione… compreso trasporto e smaltimento a discarica»: è anche una prestazione da pagare.
    if (causa === "demolizione" && SMALTIMENTO.test(testo)) nature = unisci(...nature, "prestazione");
    if (causa === "quantita_mancante") {
      daChiarire.push(`Manca la quantità${base.unita ? "" : " e l'unità di misura"}: senza, non si può dire che cosa serve né quanto.`);
      return { ...base, nature, esito: "da_chiarire", motivo: c.motivo, daChiarire };
    }
    if (causa === "committente") daChiarire.push("Conferma col committente che cosa fornisce e quando arriva in cantiere.");
    if (causa === "subappalto") daChiarire.push("Conferma che i materiali sono compresi nel prezzo della ditta.");
    const servizioDaPagare = ["nolo", "manodopera", "subappalto", "prestazione", "smaltimento"].includes(causa);
    return { ...base, nature, esito: servizioDaPagare ? "servizio" : "nessun_acquisto", motivo: c.motivo, daChiarire };
  }

  if (c.tipo === "fornitura") {
    const conPosa = /posa/i.test(c.nota ?? "");
    if (!base.unita) daChiarire.push("Manca l'unità di misura.");
    return { ...base, nature: conPosa ? ["materiale", "lavorazione"] : ["materiale"], esito: "materiali", daChiarire,
      motivo: conPosa ? "Si compra il materiale; la posa è una lavorazione" : "La voce è il materiale da comprare" };
  }

  if (c.tipo === "scomposta") {
    if (c.fonte === "libreria_standard") daChiarire.push("Quantità dei componenti da resa media della libreria: confermale sul prodotto scelto.");
    if (c.fonte === "proposta_ai") daChiarire.push("Scomposizione proposta dall'AI: da approvare prima di comprare.");
    return { ...base, nature: ["lavorazione", "materiale"], esito: "materiali", daChiarire,
      motivo: `Lavorazione scomposta nei suoi materiali («${c.scomposizione.nome}»)` };
  }

  return { ...base, nature: ["lavorazione"], esito: "da_scomporre", daChiarire: ["Non è scritto quali materiali servono: scomponila o confermala come sola lavorazione."],
    motivo: "Lavorazione senza una scomposizione in materiali" };
}

export interface ComputoInterpretato {
  voci: VoceInterpretata[];
  /** Quante voci per natura (una voce può contare in più nature). */
  perNatura: Record<NaturaVoce, number>;
  daChiarire: VoceInterpretata[];
  /** Materiali sommati da voci con caratteristiche diverse: da separare o confermare. */
  sommeDaControllare: { chiave: string; materiale: string; voci: { voce_id: string; numero: string | null; caratteristiche: string[] }[] }[];
}

/** Tutto il computo, voce per voce, più i controlli che servono prima di confermare. */
export function interpretaComputo(input: {
  voci: VoceServizio[]; scomposizioni?: Scomposizione[]; riserva?: Scomposizione[]; proposteAI?: Scomposizione[];
  /** La distinta già calcolata sulle stesse voci: per controllare le somme. */
  distinta?: Pick<RisultatoDistinta, "righe">;
}): ComputoInterpretato {
  const voci = input.voci.map((v) => interpretaVoce(v, input.scomposizioni ?? [], { riserva: input.riserva, proposteAI: input.proposteAI }));
  const perNatura = Object.fromEntries((Object.keys(ETICHETTA_NATURA) as NaturaVoce[]).map((n) => [n, 0])) as Record<NaturaVoce, number>;
  for (const v of voci) for (const n of v.nature) perNatura[n]++;
  const perId = new Map(voci.map((v) => [v.voce_id, v]));
  const sommeDaControllare: ComputoInterpretato["sommeDaControllare"] = [];
  for (const r of input.distinta?.righe ?? []) {
    // Solo le righe in cui la voce È il materiale: i componenti di una ricetta non ereditano il formato della voce.
    if (r.fonte !== "fornitura") continue;
    const fonti = [...new Set(r.origini.flatMap((o) => (o.tipo === "computo" ? [o.voce_id] : [])))].map((id) => perId.get(id)).filter((f): f is VoceInterpretata => !!f);
    if (fonti.length < 2) continue;
    if (fonti.every((f) => stesseCaratteristiche(f.caratteristiche, fonti[0].caratteristiche))) continue;
    sommeDaControllare.push({ chiave: r.chiave, materiale: r.descrizione,
      voci: fonti.map((f) => ({ voce_id: f.voce_id, numero: f.numero, caratteristiche: f.caratteristiche })) });
  }
  return { voci, perNatura, daChiarire: voci.filter((v) => v.daChiarire.length > 0 && (v.esito === "da_chiarire" || v.esito === "da_scomporre")), sommeDaControllare };
}
