/**
 * I conti della bozza che devono tornare (revisione dell'1/11/2026, lacune):
 * - le rate fanno il totale con l'IVA (a un euro);
 * - i contratti delle ditte più gli ordini ai fornitori stanno sotto l'imponibile: se lo
 *   superano, la commessa nasce in perdita, o un costo è contato due volte.
 *
 * Se un conto non torna, i valori che Silvio ha messo vanno in ⚠ `attenzione` con il motivo
 * (non entrano finché la persona non li sistema); quelli scritti da una persona restano suoi,
 * con il motivo nella nota. Quello che la commessa ha già non si tocca. Lo stato di prima si
 * tiene in `quadratura`, e torna appena il conto torna.
 *
 * Funzioni pure, senza dipendenze, compatibili con Deno.
 */
import { inVigore, type Area, type PianoCommessa, type RataDelPiano, type Valore } from "./piano.ts";

export interface ProblemaQuadratura {
  area: Area;
  chiave: string;
  testo: string;
}

// «4.190,00 €», non «4190,00 €»: in italiano le quattro cifre si raggruppano solo con "always".
const euro = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })} €`;
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const elenco = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);

/** L'importo o l'IVA su cui si fanno i conti: un valore ancora da confermare non conta (terza revisione, 2). */
function numeroInVigore(piano: PianoCommessa, chiave: "economia.total_amount" | "economia.vat_rate"): number | null {
  const v = inVigore(piano.aree.economia?.[chiave]);
  return v?.daConfermare ? null : numero(v?.valore);
}

/** Cosa non torna nella bozza, una riga per variabile coinvolta. */
/**
 * Le rate in percentuale che fanno il 100 % sommano al totale al centesimo: l'ultima prende il resto.
 * 15.000,50 + IVA 10 %, 30/70: 4.950,17 + 11.550,39 faceva 16.500,56 invece di 16.500,55.
 */
export function chiudiCentesimi<T extends { amount: number; percent?: number | null }>(rate: T[], totale: number): T[] {
  if (rate.length < 2 || !(totale > 0) || rate.some((r) => r.percent == null)) return rate;
  const percento = rate.reduce((s, r) => s + (r.percent as number), 0);
  if (Math.abs(percento - 100) > 0.001) return rate;
  const inCentesimi = Math.round(totale * 100);
  const altre = rate.slice(0, -1).reduce((s, r) => s + Math.round(r.amount * 100), 0);
  const ultima = inCentesimi - altre;
  // Solo l'arrotondamento: uno scarto più grande vuol dire importi scritti a mano, e resta visibile.
  if (Math.abs(ultima - Math.round(rate[rate.length - 1].amount * 100)) > rate.length) return rate;
  return rate.map((r, i) => (i === rate.length - 1 ? { ...r, amount: ultima / 100 } : r));
}

export function controlliQuadratura(piano: PianoCommessa): ProblemaQuadratura[] {
  const out: ProblemaQuadratura[] = [];
  const imponibile = numeroInVigore(piano, "economia.total_amount");
  const iva = numeroInVigore(piano, "economia.vat_rate");
  if (!imponibile || imponibile <= 0) return out;

  const rate = elenco(inVigore(piano.aree.pagamenti?.["pagamenti.rate"])?.valore);
  if (rate.length && iva != null) {
    const somma = Math.round(rate.reduce((t, r) => t + (Number(r.amount) || 0), 0) * 100) / 100;
    const ivato = Math.round(imponibile * (1 + iva / 100) * 100) / 100;
    if (Math.abs(somma - ivato) > 1) {
      const diff = Math.round((ivato - somma) * 100) / 100;
      out.push({
        area: "pagamenti", chiave: "pagamenti.rate",
        testo: `Le rate fanno ${euro(somma)}, il totale con l'IVA è ${euro(ivato)}: ${diff > 0 ? `mancano ${euro(diff)}` : `ci sono ${euro(-diff)} in più`}.`,
      });
    }
  }

  const contratti = elenco(inVigore(piano.aree.ditte?.["ditte.contratti"])?.valore)
    .filter((c) => c.stato !== "attenzione")
    .reduce((t, c) => t + (Number(c.importo) || 0), 0);
  const ordini = elenco(inVigore(piano.aree.materiali?.["materiali.acquisti"])?.valore)
    .filter((o) => o.stato !== "attenzione")
    .reduce((t, o) => t + elenco(o.righe).reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzo) || 0), 0), 0);
  const costi = Math.round((contratti + ordini) * 100) / 100;
  if (costi > imponibile) {
    const testo = `Contratti delle ditte e ordini fanno ${euro(costi)}, più dell'imponibile della commessa (${euro(imponibile)}): controlla che un costo non sia contato due volte.`;
    if (contratti > 0) out.push({ area: "ditte", chiave: "ditte.contratti", testo });
    if (ordini > 0) out.push({ area: "materiali", chiave: "materiali.acquisti", testo });
  }
  return out;
}

/**
 * I conti che non tornano in una bozza ripresa: chi l'ha lasciata aperta non sa che nel frattempo
 * la commessa è cambiata (simulazioni del 2/11: rate da 25.620 € su 21.960 €). La rilettura le
 * blocca con il ⚠, ma va detto alla persona. Una riga per variabile, solo quelle bloccate davvero.
 */
export function avvisiDiRipresa(piano: PianoCommessa): string[] {
  return [...new Set(controlliQuadratura(piano)
    .filter((p) => piano.aree[p.area]?.[p.chiave]?.stato === "attenzione")
    // Solo una commessa che c'è già può cambiare mentre la bozza è ferma: una bozza nuova è rimasta com'era.
    .map((p) => `${piano.orderId ? "Mentre la bozza era ferma qualcosa è cambiato. " : ""}${p.testo} Finché il conto non torna, questo dato resta fuori dalla commessa.`))];
}

// ── Le rate in percentuale che aspettano l'IVA o il totale (revisione 2/11, G9 e G20) ──

const NOTA_SENZA_IVA = "Manca l'IVA: le rate in percentuale sono calcolate sull'imponibile, da rifare quando c'è l'IVA.";
const NOTA_SENZA_TOTALE = "Manca il totale: gli importi delle rate si calcolano dalle percentuali quando arriva.";
const senzaNotaRate = (nota: string | null | undefined) =>
  (nota ?? "").replace(NOTA_SENZA_IVA, "").replace(NOTA_SENZA_TOTALE, "").replace(/\s+/g, " ").trim();

const rateDaPercentuale = (v: Valore | undefined): RataDelPiano[] | null => {
  if (!v || !Array.isArray(v.valore)) return null;
  const rate = v.valore as RataDelPiano[];
  if (!rate.some((r) => r?.daPercentuale)) return null;
  // Confermate da una persona restano sue, salvo che gli importi non ci siano ancora: «Va bene» a
  // «30 % e 70 %» prima del totale non può voler dire zero euro.
  return v.fonte.tipo !== "persona" || rate.every((r) => !r?.daPercentuale || !(Number(r.amount) > 0)) ? rate : null;
};

/** Le rate non si scrivono ancora: i loro importi aspettano l'IVA o il totale. Il motivo, o null. */
export function rateInAttesa(piano: PianoCommessa): string | null {
  if (!rateDaPercentuale(inVigore(piano.aree.pagamenti?.["pagamenti.rate"]))) return null;
  const imponibile = numeroInVigore(piano, "economia.total_amount");
  if (!imponibile || imponibile <= 0) return "le rate in percentuale aspettano il totale: si calcolano quando c'è";
  if (numeroInVigore(piano, "economia.vat_rate") == null) return "le rate in percentuale aspettano l'IVA: si calcolano quando c'è";
  return null;
}

/** Rifà gli importi dalle percentuali con il totale e l'IVA di adesso: annullare l'IVA li riporta indietro. */
function conRatePercentuali(piano: PianoCommessa): PianoCommessa {
  const v = piano.aree.pagamenti?.["pagamenti.rate"];
  if (!v || piano.conflitti.some((c) => c.chiave === "pagamenti.rate")) return piano;
  const imponibile = numeroInVigore(piano, "economia.total_amount");
  const iva = numeroInVigore(piano, "economia.vat_rate");
  const base = imponibile && imponibile > 0 ? imponibile * (1 + (iva ?? 0) / 100) : 0;
  const attesa = !imponibile || imponibile <= 0 ? NOTA_SENZA_TOTALE : iva == null ? NOTA_SENZA_IVA : "";
  const rifai = (x: Valore): Valore => {
    const rate = rateDaPercentuale(x);
    if (!rate) return x;
    const nuove = chiudiCentesimi(rate.map((r) => (r.daPercentuale && r.percent != null
      ? { ...r, amount: Math.round((base * r.percent) / 100 * 100) / 100 } : r)), base);
    const nota = [senzaNotaRate(x.quadratura ? x.quadratura.nota : x.nota), attesa].filter(Boolean).join(" ") || null;
    const stesseRate = nuove.every((r, i) => r.amount === rate[i].amount);
    const notaPrima = (x.quadratura ? x.quadratura.nota : x.nota) ?? null;
    if (stesseRate && nota === notaPrima) return x;
    return x.quadratura ? { ...x, valore: nuove, quadratura: { ...x.quadratura, nota } } : { ...x, valore: nuove, nota };
  };
  // Sotto una proposta della chat le rate di prima restano quelle che valgono: si rifanno anche loro.
  const sotto = v.alPostoDi ? rifai(v.alPostoDi) : v.alPostoDi;
  const sopra = rifai(v);
  if (sopra === v && sotto === v.alPostoDi) return piano;
  const nuovo: Valore = sotto === v.alPostoDi ? sopra : { ...sopra, alPostoDi: sotto };
  return { ...piano, aree: { ...piano.aree, pagamenti: { ...(piano.aree.pagamenti ?? {}), "pagamenti.rate": nuovo } } };
}

const CONTROLLATE: readonly { area: Area; chiave: string }[] = [
  { area: "pagamenti", chiave: "pagamenti.rate" },
  { area: "ditte", chiave: "ditte.contratti" },
  { area: "materiali", chiave: "materiali.acquisti" },
];

/** Il piano con i ⚠ della quadratura messi o tolti. Lo stesso oggetto se non cambia niente. */
export function conQuadratura(pianoPrima: PianoCommessa): PianoCommessa {
  const piano = conRatePercentuali(pianoPrima);
  const problemi = controlliQuadratura(piano);
  let out = piano;
  for (const { area, chiave } of CONTROLLATE) {
    const mostrato = out.aree[area]?.[chiave];
    if (!mostrato || out.conflitti.some((c) => c.area === area && c.chiave === chiave)) continue;
    // Sotto una proposta della chat il ⚠ va al valore che vale: la proposta conta da confermata.
    const proposta = mostrato.alPostoDi !== undefined;
    const v = proposta ? mostrato.alPostoDi : mostrato;
    if (!v) continue;
    // Quello che la commessa ha già (fonte persona con l'id della commessa) non si tocca.
    if (piano.orderId && v.fonte.tipo === "persona" && v.fonte.id === piano.orderId) continue;
    const problema = problemi.find((p) => p.chiave === chiave);
    let nuovo: Valore | null = null;
    if (problema && v.nota !== problema.testo) {
      const prima = v.quadratura ?? { stato: v.stato, nota: v.nota ?? null };
      nuovo = { ...v, stato: v.fonte.tipo === "persona" ? prima.stato : "attenzione", nota: problema.testo, quadratura: prima };
    } else if (!problema && v.quadratura) {
      const { quadratura, ...resto } = v;
      nuovo = { ...resto, stato: quadratura.stato, nota: quadratura.nota };
    }
    if (nuovo) out = { ...out, aree: { ...out.aree, [area]: { ...(out.aree[area] ?? {}), [chiave]: proposta ? { ...mostrato, alPostoDi: nuovo } : nuovo } } };
  }
  return out;
}
