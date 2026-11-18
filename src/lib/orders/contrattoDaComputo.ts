/**
 * Il computo metrico caricato in «Carica contratto / copia commissione / computo metrico» (17/11/2026).
 *
 * Un computo stampato da PriMus (o un file .xpwe, o un foglio .xlsx) si legge nel browser, esatto e
 * gratis, con il lettore dei computi: niente AI. Prima andava all'AI, che su 167-226 voci si fermava al
 * tetto della risposta e restituiva un JSON tronco (lettura fallita, e pagata).
 *
 * Due regole sul contenuto:
 * - la fase è la CATEGORIA (Isolamento termico, Impianto termico, Infissi…), non la super-categoria, che nei
 *   computi dei bonus è l'intero intervento («ECO», «SISMA») e farebbe una fase sola da milioni;
 * - progettazione, direzione lavori, asseverazioni, Inarcassa, visto di conformità e IVA stanno nel computo
 *   del bonus ma non sono lavori dell'impresa: restano fuori da voci e totale, e la lettura li elenca.
 */
import { leggiFileComputo } from "@/lib/computo/leggiFileComputo";
import { arrotonda, controllaTotali, formatEuro, type ComputoStrutturato, type ComputoVoceStrutturata } from "@/lib/computo/computoStrutturato";
import { fasiDaCapitoli, parseContractExtract, type ContractExtract } from "./contractExtract";
import { eNonLavoro } from "@/lib/computo/vociNonLavori";
import { naturaVoce } from "./naturaVoce";

/** Una voce che sta nel computo del bonus ma non è un lavoro dell'impresa (onorari, casse, IVA). */
export function eVoceNonLavoro(v: Pick<ComputoVoceStrutturata, "descrizione" | "super_categoria" | "categoria" | "sotto_categoria">): boolean {
  return eNonLavoro([v.super_categoria?.nome, v.categoria?.nome, v.sotto_categoria?.nome], v.descrizione);
}

/**
 * Il capitolo che diventa la fase: il livello più fine che il computo dà (sotto-categoria, poi categoria, poi
 * super-categoria). È lo stesso che il computo salvato nella commessa chiama «categoria» (importaComputo:
 * capitolo = categoria PriMus, categoria = sotto-categoria) e da cui `commessa_lavorazioni_dal_computo` fa le
 * fasi: proposte e lavorazioni devono avere lo stesso nome, o la stessa fase nasce due volte (17/11/2026).
 */
function capitoloFase(v: ComputoVoceStrutturata): string | null {
  return v.sotto_categoria?.nome?.trim() || v.categoria?.nome?.trim() || v.super_categoria?.nome?.trim() || null;
}

const SUPER_FORMATO: Record<ComputoStrutturato["formato"], string> = { primus_pdf: "PDF di PriMus", xpwe: "file XPWE", excel: "foglio Excel" };

export function contrattoDaComputo(c: ComputoStrutturato): ContractExtract {
  const controllo = controllaTotali(c);
  const lavori = c.voci.filter((v) => !eVoceNonLavoro(v));
  const esclusi = c.voci.filter((v) => eVoceNonLavoro(v));
  const totaleLavori = arrotonda(lavori.reduce((s, v) => s + (v.importo ?? 0), 0));
  const sicurezza = arrotonda(lavori.filter((v) => v.is_sicurezza).reduce((s, v) => s + (v.importo ?? 0), 0));

  const voci = lavori.map((v) => {
    const importo = v.importo ?? 0;
    // Quantità e prezzo come stampati; se non tornano col totale riga (arrotondamenti, voci a corpo) vale il totale.
    const q = v.quantita && v.quantita !== 0 ? v.quantita : 1;
    const p = v.prezzo_unitario != null && Math.abs(q * v.prezzo_unitario - importo) <= 0.05 ? v.prezzo_unitario : arrotonda(importo / q);
    const segno = v.is_detrazione && importo > 0 ? -1 : 1;
    return {
      codice: v.codice_tariffa || v.numero_ordine,
      descrizione: v.descrizione || `Voce ${v.numero_ordine}`,
      unita: v.unita_misura || null,
      quantita: q,
      prezzo_unitario_eur: segno * p,
      importo_eur: segno * importo,
      capitolo: capitoloFase(v),
      natura: naturaVoce(v.descrizione, { sicurezza: v.is_sicurezza, capitolo: v.categoria?.nome, detrazione: v.is_detrazione || importo < 0 }),
    };
  });

  const avvisi: string[] = [];
  if (esclusi.length) {
    const perCapitolo = new Map<string, number>();
    for (const v of esclusi) {
      const nome = v.super_categoria?.nome || v.categoria?.nome || v.descrizione.slice(0, 40);
      perCapitolo.set(nome, (perCapitolo.get(nome) ?? 0) + (v.importo ?? 0));
    }
    const elenco = [...perCapitolo.entries()].slice(0, 20).map(([n, e]) => `${n} ${formatEuro(arrotonda(e))}`).join("; ");
    avvisi.push(`Esclusi ${esclusi.length} importi che non sono lavori dell'impresa (onorari, casse, IVA), ${formatEuro(arrotonda(esclusi.reduce((s, v) => s + (v.importo ?? 0), 0)))}: ${elenco}.`);
  }
  if (!controllo.ok) {
    const capitoliStorti = controllo.capitoli.filter((x) => !x.ok).length;
    if (Math.abs(controllo.differenza_totale ?? 0) > 0.05) {
      avvisi.push(`Il totale delle voci (${formatEuro(controllo.totale_calcolato)}) non torna con quello stampato (${formatEuro(controllo.totale_dichiarato ?? 0)}).`);
    } else if (capitoliStorti && lavori.some((v) => capitoloFase(v))) {
      avvisi.push(`Il totale torna al centesimo, ma ${capitoliStorti} capitoli non tornano con il riepilogo: controlla a quale capitolo appartengono le voci.`);
    }
  }
  if (lavori.length && lavori.every((v) => !capitoloFase(v))) {
    avvisi.push("Il PDF non stampa i capitoli accanto alle voci: le fasi non si possono proporre dal documento, vanno create a mano (o ristampa il computo da PriMus con le categorie).");
  }
  avvisi.push(...c.avvisi.slice(0, 5));

  return parseContractExtract({
    origine_lettura: "computo",
    cliente: { nome_completo: c.metadata.committente ?? "" },
    descrizione_lavori: c.metadata.oggetto_lavori ?? "",
    importo_totale_eur: totaleLavori || null,
    iva_pct: null,
    voci,
    fasi_lavoro: fasiDaCapitoli(voci),
    data_documento: c.metadata.data_computo ?? null,
    dati_appalto: {
      valorizzazione: "a_misura",
      stima_eur: totaleLavori || null,
      oneri_sicurezza_eur: sicurezza || null,
    },
    summary: `Computo letto dal ${SUPER_FORMATO[c.formato]}, senza AI: ${lavori.length} voci di lavori per ${formatEuro(totaleLavori)}` +
      (esclusi.length ? ` (escluse ${esclusi.length} voci di onorari e IVA)` : "") + ".",
    confidence: controllo.ok ? 0.99 : 0.85,
    warnings: avvisi,
  });
}

/**
 * Il computo letto senza AI, se il file lo è: PDF di PriMus, .xpwe, .xlsx. Per tutto il resto (contratti,
 * preventivi, scansioni, computi di altri programmi) null, e la lettura passa all'AI come prima.
 */
export async function leggiComputoSenzaAi(file: File): Promise<ContractExtract | null> {
  const nome = file.name.toLowerCase();
  if (!/\.(pdf|xpwe|xlsx)$/.test(nome) && file.type !== "application/pdf") return null;
  try {
    const computo = await leggiFileComputo(file);
    if (!computo.voci.length) return null;
    return contrattoDaComputo(computo);
  } catch {
    // Non è un computo (PdfDaLeggereConAi) o non si apre qui: decide l'AI, che darà il suo esito.
    return null;
  }
}
