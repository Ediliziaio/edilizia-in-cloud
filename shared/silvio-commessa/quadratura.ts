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
import type { Area, PianoCommessa, RataDelPiano, Valore } from "./piano.ts";

export interface ProblemaQuadratura {
  area: Area;
  chiave: string;
  testo: string;
}

const euro = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const elenco = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);

/** Cosa non torna nella bozza, una riga per variabile coinvolta. */
export function controlliQuadratura(piano: PianoCommessa): ProblemaQuadratura[] {
  const out: ProblemaQuadratura[] = [];
  const imponibile = numero(piano.aree.economia?.["economia.total_amount"]?.valore);
  const iva = numero(piano.aree.economia?.["economia.vat_rate"]?.valore);
  if (!imponibile || imponibile <= 0) return out;

  const rate = elenco(piano.aree.pagamenti?.["pagamenti.rate"]?.valore);
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

  const contratti = elenco(piano.aree.ditte?.["ditte.contratti"]?.valore)
    .filter((c) => c.stato !== "attenzione")
    .reduce((t, c) => t + (Number(c.importo) || 0), 0);
  const ordini = elenco(piano.aree.materiali?.["materiali.acquisti"]?.valore)
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

// ── Le rate in percentuale che aspettano l'IVA o il totale (revisione 2/11, G9 e G20) ──

const NOTA_SENZA_IVA = "Manca l'IVA: le rate in percentuale sono calcolate sull'imponibile, da rifare quando c'è l'IVA.";
const NOTA_SENZA_TOTALE = "Manca il totale: gli importi delle rate si calcolano dalle percentuali quando arriva.";
const senzaNotaRate = (nota: string | null | undefined) =>
  (nota ?? "").replace(NOTA_SENZA_IVA, "").replace(NOTA_SENZA_TOTALE, "").replace(/\s+/g, " ").trim();

const rateDaPercentuale = (v: Valore | undefined): RataDelPiano[] | null =>
  (v && v.fonte.tipo !== "persona" && Array.isArray(v.valore) && (v.valore as RataDelPiano[]).some((r) => r?.daPercentuale)
    ? v.valore as RataDelPiano[] : null);

/** Le rate non si scrivono ancora: i loro importi aspettano l'IVA o il totale. Il motivo, o null. */
export function rateInAttesa(piano: PianoCommessa): string | null {
  if (!rateDaPercentuale(piano.aree.pagamenti?.["pagamenti.rate"])) return null;
  const imponibile = numero(piano.aree.economia?.["economia.total_amount"]?.valore);
  if (!imponibile || imponibile <= 0) return "le rate in percentuale aspettano il totale: si calcolano quando c'è";
  if (numero(piano.aree.economia?.["economia.vat_rate"]?.valore) == null) return "le rate in percentuale aspettano l'IVA: si calcolano quando c'è, oppure confermale così";
  return null;
}

/** Rifà gli importi dalle percentuali con il totale e l'IVA di adesso: annullare l'IVA li riporta indietro. */
function conRatePercentuali(piano: PianoCommessa): PianoCommessa {
  const v = piano.aree.pagamenti?.["pagamenti.rate"];
  const rate = rateDaPercentuale(v);
  if (!v || !rate || piano.conflitti.some((c) => c.chiave === "pagamenti.rate")) return piano;
  const imponibile = numero(piano.aree.economia?.["economia.total_amount"]?.valore);
  const iva = numero(piano.aree.economia?.["economia.vat_rate"]?.valore);
  const base = imponibile && imponibile > 0 ? imponibile * (1 + (iva ?? 0) / 100) : 0;
  const nuove = rate.map((r) => (r.daPercentuale && r.percent != null
    ? { ...r, amount: Math.round((base * r.percent) / 100 * 100) / 100 } : r));
  const attesa = !imponibile || imponibile <= 0 ? NOTA_SENZA_TOTALE : iva == null ? NOTA_SENZA_IVA : "";
  const nota = [senzaNotaRate(v.quadratura ? v.quadratura.nota : v.nota), attesa].filter(Boolean).join(" ") || null;
  const stesseRate = nuove.every((r, i) => r.amount === rate[i].amount);
  const notaPrima = (v.quadratura ? v.quadratura.nota : v.nota) ?? null;
  if (stesseRate && nota === notaPrima) return piano;
  const nuovo: Valore = v.quadratura ? { ...v, valore: nuove, quadratura: { ...v.quadratura, nota } } : { ...v, valore: nuove, nota };
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
    const v = out.aree[area]?.[chiave];
    if (!v || out.conflitti.some((c) => c.area === area && c.chiave === chiave)) continue;
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
    if (nuovo) out = { ...out, aree: { ...out.aree, [area]: { ...(out.aree[area] ?? {}), [chiave]: nuovo } } };
  }
  return out;
}
