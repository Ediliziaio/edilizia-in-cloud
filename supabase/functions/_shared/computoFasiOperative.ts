import { eSicurezza, type ComputoStrutturato, type ComputoVoceStrutturata } from "./computoStrutturato.ts";

const normalizza = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const TECNICHE = /^(progettazione(\s+categoria|\s+[a-z]{1,2}\s?\d|\s*$)|d\.?\s?l\.?\s|r\.?\s?l\.?\s|direzione (dei )?lavori|coordinament[oi] (della )?sicurezza|responsabile (dei )?lavori|asseveraz|inarcassa|cassa\b|iva\b|visto di conformit|ape (ante|post))/i;

/** Raggruppamento operativo, distinto dai capitoli contabili e dai SAL di pagamento. */
export function macrofaseOperativa(nome: string): string {
  const n = normalizza(nome);
  if (/sicurezza|cantier|pontegg|provvisional|apprestament/.test(n)) return "Preparazione e sicurezza";
  if (/demol|rimozion|scav|smontagg|trasport|smaltiment/.test(n)) return "Rimozioni e preparazione";
  if (/fondaz|struttur|sismic|consolid|rinforz|balcon|solai|aggett|prospett|calcestruzz|armatur/.test(n) && !/isolament|opach/.test(n)) return "Strutture e consolidamenti";
  if (/fotovolt|accumulo|ricarica|colonnin/.test(n)) return "Produzione e accumulo energia";
  if (/isolament|cappott|opach|sottotett|copertur|infiss|serrament|schermatur|oscurant/.test(n)) return "Involucro e serramenti";
  if (/impiant|termic|riscald|idraulic|sanitar|ventilaz|vmc|elettric/.test(n)) return "Impianti";
  if (/finitur|intonac|rasatur|paviment|tintegg|impermeabil|muratur|pulizia finale|consegna/.test(n)) return "Ripristini e finiture";
  return "Lavorazioni da verificare";
}

/** Si considera l'oggetto della voce: «sbruffatura di murature» non è costruzione di murature. */
export function faseOperativaDalTesto(descrizione: string): string | null {
  const n = normalizza(descrizione).replace(/^fornitura(?: e (?:posa|collocazione|collocamento|installazione)(?: in opera)?)?(?: in opera)?(?: di)?\s+/, "")
    .replace(/^(?:(?:sola|solo)\s+)?(?:posa(?: in opera)?|montaggio|rimontaggio)(?: di)?\s+/, "").slice(0, 200);
  if (!n.trim() || TECNICHE.test(n)) return null;
  if (/sicurezza|pontegg|cantier|bagno chimico|estintor|prefabbricato monoblocco|trabattell|piattaforma semovente|recinzione/.test(n)) return "Cantierizzazione e opere provvisionali";
  if (/^(demol|rimozion|smontagg|scav|scarriol|trasporto a discarica|compenso alle discariche)/.test(n)) return "Demolizioni, scavi e smaltimenti";
  if (/sismic|antiribalt|sfondell|rinforz|consolidamento (di solaio|struttural|di elementi)|connessione per|inghisagg|perforazion/.test(n)) return "Rinforzi strutturali e presidi antisismici";
  if (/^(calcestruzz|conglomerato cementizio|acciaio in barre|rete elettrosaldata|casseform|ripristino e risanamento)/.test(n)) return "Opere in calcestruzzo e armature";
  if (/^(?:pompa di calore|pompe di calore|ventilconvettor)/.test(n)) return "Impianti termici e ventilazione";
  if (/fotovolt|inverter|accumulo|colonnina/.test(n)) return "Fotovoltaico, accumulo e ricarica";
  if (/^(spostamento tubazion|impianto gas)/.test(n)) return "Adeguamento impianti gas";
  if (/^(isolamento termico|cappott)/.test(n)) return "Isolamento termico";
  if (/serrament|infiss|finestr|schermatur|avvolgibil|persian/.test(n)) return "Serramenti e schermature";
  if (/^(sbruffatur|intonac|strato di regolarizz|finitura civile|rasatura|pulitura|pulizia e disinfez|fondo |pittura|tinteggi|preparazione del fondo|rivestimento a spessore)/.test(n)) return "Preparazione supporti, intonaci e finiture";
  if (/^(massetto|pavimento|zoccolino|rivestimento (?:di gres|in piastrelle)|soglie)/.test(n)
    || (/^maggiorazione|^riduzione/.test(n) && /massetto/.test(n))) return "Massetti, pavimenti e rivestimenti";
  if (/^pulizia di fondo|^pulizia finale/.test(n)) return "Pulizia finale e consegna";
  if (/impermeabil|manto impermeabile/.test(n)) return "Impermeabilizzazioni";
  if (/termic|riscald|pompa di calore|ventilconvett|vmc|ventilaz|^radiator|^termoarred/.test(n)) return "Impianti termici e ventilazione";
  if (/sanitar|idrico|adduzion|scarico|piatto (?:per )?doccia|risciacquamento|^bidet|^lavabo|^cassetta wc|^accessori bagno/.test(n)) return "Impianti idrici e sanitari";
  if (/impianto elettric|^cav[oi]|quadro elettric/.test(n)) return "Impianti elettrici";
  if (/^pratic|^collaud|^attivazion|^dichiarazione di conformita/.test(n)) return "Pratiche, collaudi e consegna";
  if (/conglomerato bituminoso|binder|tappeto (?:d.?usura|bituminoso)|pavimentazion.*stradal|fondazione stradale/.test(n)) return "Pavimentazioni stradali";
  if (/barriera.*(?:sicurezza|stradal)|guard.?rail|rete paramassi/.test(n)) return "Barriere e opere di protezione";
  if (/segnaletica|segnali stradali|strisce (?:longitudinali|trasversali)/.test(n)) return "Segnaletica stradale";
  if (/^pozzett|^chiusin|tubazioni.*(?:dren|fogn)|canalett|fossi/.test(n)) return "Sottoservizi e drenaggi";
  if (/terra vegetale|inerbimento|idrosemina|sistemazion.*verde|^semina/.test(n)) return "Sistemazioni a verde";
  return null;
}
const faseDalTesto = (v: ComputoVoceStrutturata) => faseOperativaDalTesto(v.descrizione);

/**
 * PDF senza capitoli accanto alle voci. Non si indovinano i capitoli dalla loro posizione:
 * si cerca una sola sequenza di importi che coincide AL CENTESIMO con un riepilogo.
 * Le attribuzioni restano proposte da verificare; gli importi originali non cambiano.
 * Dove la quadratura non identifica un gruppo si propone il mestiere dal testo.
 */
export function completaFasiComputo(c: ComputoStrutturato): ComputoStrutturato {
  if (!c.voci.length || c.voci.some(v => v.categoria || v.sotto_categoria || v.super_categoria)) return c;
  const prefissi = [0];
  for (const v of c.voci) {
    if (v.importo == null || !Number.isFinite(v.importo)) return c;
    prefissi.push(prefissi.at(-1)! + Math.round(v.importo * 100));
  }
  const gruppi: Array<{ da: number; a: number; nome: string; numero: number }> = [];
  for (const r of c.riepiloghi.filter(r => r.livello === "categoria" && r.importo > 0)) {
    const atteso = Math.round(r.importo * 100);
    const inizi = new Map<number, number[]>();
    const trovati: Array<{ da: number; a: number }> = [];
    for (let a = 1; a < prefissi.length && trovati.length < 2; a++) {
      inizi.set(prefissi[a - 1], [...(inizi.get(prefissi[a - 1]) ?? []), a - 1]);
      for (const da of inizi.get(prefissi[a] - atteso) ?? []) trovati.push({ da, a });
    }
    if (trovati.length === 1) gruppi.push({ ...trovati[0], nome: r.nome, numero: Number(r.codice) });
  }
  const univoci = gruppi.filter((g, i) => !gruppi.some((h, j) => i !== j && g.da < h.a && h.da < g.a));
  let ricostruite = 0, proposte = 0;
  const voci = c.voci.map((v, i): ComputoVoceStrutturata => {
    // Le imposte e le parcelle restano riconoscibili anche senza un capitolo stampato.
    if (TECNICHE.test(normalizza(v.descrizione))) return v;
    const gruppo = univoci.find(g => i >= g.da && i < g.a);
    const nome = gruppo?.nome ?? faseDalTesto(v) ?? "Lavorazioni da verificare";
    if (gruppo) ricostruite++; else proposte++;
    return { ...v, categoria: { nome, numero: gruppo?.numero ?? 0 }, is_sicurezza: v.is_sicurezza || eSicurezza(nome),
      origine_fase: gruppo ? "riepilogo" : "descrizione",
      avvisi: [...v.avvisi, gruppo ? "Fase proposta dalla quadratura con il riepilogo: verifica l'attribuzione." : "Fase proposta dalla descrizione: confermala prima di pianificare."] };
  });
  return { ...c, voci, avvisi: [...c.avvisi,
    `Il PDF non stampa i capitoli sulle voci: ${ricostruite} attribuzioni proposte dalla quadratura con il riepilogo e ${proposte} dal testo. Conferma le fasi prima di pianificare gli acquisti.`] };
}
