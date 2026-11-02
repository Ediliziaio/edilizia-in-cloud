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
import type { Area, PianoCommessa, Valore } from "./piano.ts";

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

const CONTROLLATE: readonly { area: Area; chiave: string }[] = [
  { area: "pagamenti", chiave: "pagamenti.rate" },
  { area: "ditte", chiave: "ditte.contratti" },
  { area: "materiali", chiave: "materiali.acquisti" },
];

/** Il piano con i ⚠ della quadratura messi o tolti. Lo stesso oggetto se non cambia niente. */
export function conQuadratura(piano: PianoCommessa): PianoCommessa {
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
