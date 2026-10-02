/**
 * Beni significativi nelle fatture di manutenzione con IVA al 10% (24/09/2026).
 *
 * Art. 7 c. 1 lett. b L. 488/1999 e DM 29/12/1999: nella manutenzione
 * ordinaria e straordinaria delle abitazioni l'IVA è al 10%, ma i «beni
 * significativi» (ascensori e montacarichi, infissi esterni e interni, caldaie,
 * videocitofoni, apparecchiature di condizionamento e riciclo dell'aria,
 * sanitari e rubinetteria da bagno, impianti di sicurezza) hanno il 10% solo
 * fino al valore di tutto il resto della prestazione (manodopera, posa, altri
 * materiali). La parte che supera va al 22%.
 *
 * E la fattura deve dirlo (art. 1 c. 19 L. 205/2017): oltre al servizio,
 * «i beni di valore significativo … forniti nell'ambito dell'intervento» con
 * il loro valore. I preventivi serramenti lo calcolavano già; l'editor delle
 * fatture no, e chi fatturava un climatizzatore o degli infissi doveva fare il
 * conto a mano. Il conto è quello dei preventivi (calcolaIvaMista), non una
 * seconda copia.
 */
import { calcolaIvaMista } from "@/lib/serramenti/calcoli";
import type { RigaDocumento } from "@/types/fatturazione";

export interface InterventoBeniSignificativi {
  /** Il servizio: «Sostituzione caldaia», «Fornitura e posa di infissi». */
  intervento: string;
  /** I beni significativi forniti: «Caldaia a condensazione Vaillant ecoTEC». */
  beni: string;
  /** Valore dei beni significativi, imponibile. */
  valoreBeni: number;
  /** Tutto il resto: manodopera, posa, materiali non significativi, imponibile. */
  valoreAltro: number;
}

export interface RipartoBeniSignificativi {
  /** Imponibile al 10%: il resto della prestazione più i beni fino al limite. */
  imponibile10: number;
  /** Imponibile al 22%: la parte dei beni che supera il limite. */
  imponibile22: number;
}

const due = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const euro = (n: number) =>
  `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function ripartoBeniSignificativi(i: Pick<InterventoBeniSignificativi, "valoreBeni" | "valoreAltro">): RipartoBeniSignificativi {
  const m = calcolaIvaMista(Math.max(0, i.valoreBeni || 0), 0, Math.max(0, i.valoreAltro || 0));
  return { imponibile10: due(m.imponibile_10), imponibile22: due(m.bs_quota_22) };
}

/** Le righe da aggiungere alla fattura: una al 10% e, se serve, una al 22%. */
export function righeBeniSignificativi(i: InterventoBeniSignificativi, primoNumero: number): RigaDocumento[] {
  const r = ripartoBeniSignificativi(i);
  const riga = (n: number, descrizione: string, importo: number, aliquota: string): RigaDocumento => ({
    id: crypto.randomUUID(),
    numero_linea: n,
    descrizione,
    quantita: 1,
    unita_misura: "a corpo",
    prezzo_unitario: importo,
    aliquota_iva: aliquota,
    imponibile: 0,
    imposta: 0,
    totale_riga: 0,
  } as RigaDocumento);

  const righe = [
    riga(
      primoNumero,
      `${i.intervento.trim()}. Beni significativi forniti: ${i.beni.trim()}, valore ${euro(due(i.valoreBeni))} ` +
        "(art. 7 c. 1 lett. b L. 488/1999, DM 29/12/1999)",
      r.imponibile10,
      "10",
    ),
  ];
  if (r.imponibile22 > 0) {
    righe.push(riga(
      primoNumero + 1,
      `Parte del valore dei beni significativi (${i.beni.trim()}) che supera il valore delle altre prestazioni: IVA ordinaria`,
      r.imponibile22,
      "22",
    ));
  }
  return righe;
}

// ─── Conto «alla Fabio» (02/10/2026, Renova) ─────────────────────────────────
//
// Il conto che si fa davvero in cantiere parte dal PREZZO CONCORDATO col cliente
// (IVA inclusa), non dal valore dei beni: il prezzo è deciso, il valore dei beni
// significativi è quello che ne risulta. FPR 73/26: totale 27.500 €, altre
// prestazioni al 10% (manodopera, zanzariere, smaltimento, materiale) 11.120 €
// → beni 13.608,52 €, di cui 11.119,99 al 10% (il limite è il valore del resto,
// 11.120) e 2.488,53 al 22%. Il centesimo spostato dal 10% al 22% serve a far
// tornare il totale esatto: l'IVA si arrotonda per aliquota, e senza quel
// centesimo il totale usciva 27.499,99.
//
// Le altre prestazioni restano righe vere della fattura (una per voce): il conto
// le legge da lì. Alla fattura si aggiungono solo le righe dei beni, più le due
// righe informative a importo zero («corrispettivo imponibile pattuito» e «valore
// bene significativo»), come nelle fatture fatte finora.
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";

export interface AltrePrestazioni {
  /** Imponibile delle righe al 10% che non sono beni significativi. */
  al10: number;
  /** Imponibile delle righe al 22% che non sono beni significativi. */
  al22: number;
}

/** Le altre prestazioni lette dalle righe già nella fattura (beni significativi e righe a zero esclusi). */
export function altrePrestazioniDalleRighe(righe: readonly RigaDocumento[]): AltrePrestazioni {
  let al10 = 0;
  let al22 = 0;
  for (const r of righe) {
    if (r.categoria === CATEGORIA_BENE_SIGNIFICATIVO || r.natura_iva) continue;
    const calcolata = calcolaRiga(r);
    if (!(calcolata.imponibile > 0)) continue;
    const aliquota = parseFloat(r.aliquota_iva) || 0;
    if (aliquota === 10) al10 += calcolata.imponibile;
    else if (aliquota === 22) al22 += calcolata.imponibile;
  }
  return { al10: due(al10), al22: due(al22) };
}

/** Segna le righe create dallo strumento: restano fuori dal conto «altre prestazioni». */
export const CATEGORIA_BENE_SIGNIFICATIVO = "bene_significativo";

export interface ContoDalTotale {
  /** Valore dei beni significativi che ne risulta; null se il totale non basta nemmeno per le altre prestazioni. */
  valoreBeni: number;
  /** Dei beni, la parte al 10% (fino al valore del resto). */
  quota10: number;
  /** Dei beni, l'eccedenza al 22%. */
  quota22: number;
}

/**
 * Dal prezzo concordato (IVA inclusa) al valore dei beni.
 *   · se i beni stanno dentro il limite: tutto al 10%  →  G = 1,10 · (S + B) + 1,22 · A
 *   · se lo superano: il limite al 10%, il resto al 22% →  G = 0,98 · S + 1,22 · B + 1,22 · A
 * con G il totale, S le altre prestazioni al 10%, A quelle al 22%.
 */
export function contoDalTotaleConcordato(totaleLordo: number, altre: AltrePrestazioni): ContoDalTotale | null {
  const G = Math.max(0, totaleLordo || 0);
  const S = Math.max(0, altre.al10);
  const A = Math.max(0, altre.al22);
  const tuttoAl10 = (G - 1.22 * A) / 1.1 - S;
  let B: number;
  if (tuttoAl10 <= S) B = tuttoAl10;
  else B = (G - 0.98 * S - 1.22 * A) / 1.22;
  B = due(B);
  if (!(B > 0)) return null;
  const quota10 = due(Math.min(B, S));
  return { valoreBeni: B, quota10, quota22: due(B - quota10) };
}

/** Dal valore dei beni (già noto) al riparto, con le altre prestazioni lette dalla fattura. */
export function contoDalValoreBeni(valoreBeni: number, altre: AltrePrestazioni): ContoDalTotale {
  const B = due(Math.max(0, valoreBeni));
  const quota10 = due(Math.min(B, Math.max(0, altre.al10)));
  return { valoreBeni: B, quota10, quota22: due(B - quota10) };
}

export interface RigheBeniDaAggiungere {
  righe: RigaDocumento[];
  /** Totale del documento con le righe aggiunte, per il controllo. */
  totale: number;
  /** Centesimi spostati dal 10% al 22% per far tornare il totale concordato. */
  centesimiSpostati: number;
}

const numeroPuntato = (n: number) => String(due(n));

/**
 * Le righe da aggiungere: informative a zero, beni al 10% e, se serve, la
 * quota residua al 22%. Con `totaleConcordato` il riparto si ritocca di qualche
 * centesimo finché il totale del documento torna esatto.
 */
export function righeConBeniSignificativi(p: {
  beni: string;
  conto: ContoDalTotale;
  righeEsistenti: readonly RigaDocumento[];
  primoNumero: number;
  totaleConcordato?: number;
  conRigaCorrispettivo?: boolean;
}): RigheBeniDaAggiungere {
  const { conto, righeEsistenti, primoNumero } = p;
  const beni = p.beni.trim();
  const riga = (n: number, descrizione: string, importo: number, aliquota: string): RigaDocumento => ({
    id: crypto.randomUUID(),
    numero_linea: n,
    descrizione,
    quantita: 1,
    unita_misura: "pz",
    prezzo_unitario: importo,
    aliquota_iva: aliquota,
    imponibile: 0,
    imposta: 0,
    totale_riga: 0,
    categoria: CATEGORIA_BENE_SIGNIFICATIVO,
  } as RigaDocumento);

  const costruisci = (q10: number, q22: number): RigaDocumento[] => {
    const out: RigaDocumento[] = [];
    let n = primoNumero;
    if (p.conRigaCorrispettivo) {
      const pattuito = p.totaleConcordato ? due(p.totaleConcordato / 1.1) : due(conto.valoreBeni + (conto.quota10 + 0));
      out.push(riga(n++, `corrispettivo imponibile pattuito ${numeroPuntato(pattuito)} euro`, 0, "10"));
    }
    out.push(riga(n++, `valore bene significativo (dm 29/12/1999) ${numeroPuntato(conto.valoreBeni)}`, 0, "10"));
    if (q10 > 0) out.push(riga(n++, `${beni} bene significativo`, q10, "10"));
    if (q22 > 0) out.push(riga(n++, `${beni} — quota residua beni significativi`, q22, "22"));
    return out;
  };
  const totaleCon = (nuove: RigaDocumento[]) =>
    calcolaTotaliDocumento([...righeEsistenti, ...nuove]).totale_documento;

  let q10 = conto.quota10;
  let q22 = conto.quota22;
  let spostati = 0;
  if (p.totaleConcordato) {
    // Si prova a spostare qualche centesimo; con i beni tutti al 10% si ritocca il 10% stesso.
    const candidati = [0, 1, -1, 2, -2, 3, -3];
    for (const k of candidati) {
      const c = k / 100;
      const prova10 = conto.quota22 > 0 ? due(conto.quota10 - c) : due(conto.quota10 + c);
      const prova22 = conto.quota22 > 0 ? due(conto.quota22 + c) : 0;
      if (prova10 < 0 || prova22 < 0) continue;
      if (due(totaleCon(costruisci(prova10, prova22))) === due(p.totaleConcordato)) {
        q10 = prova10;
        q22 = prova22;
        spostati = k;
        break;
      }
    }
  }
  const righe = costruisci(q10, q22);
  return { righe, totale: due(totaleCon(righe)), centesimiSpostati: spostati };
}

/** La frase che la fattura deve riportare (art. 7 c. 1 lett. b L. 488/1999). */
export function fraseValoreBeniSignificativi(valoreBeni: number): string {
  return `Ai fini dell'art. 7 comma 1 lett. b) L. 488/1999 e DM 29/12/1999 il valore complessivo dei beni significativi è pari a € ${numeroPuntato(valoreBeni)}`;
}

/** Aggiunge la frase alle note, una volta sola (sostituisce il valore se già c'è). */
export function noteConValoreBeni(note: string | null | undefined, valoreBeni: number): string {
  const frase = fraseValoreBeniSignificativi(valoreBeni);
  const attuale = (note ?? "").trimEnd();
  const esistente = /Ai fini dell'art\. 7 comma 1 lett\. b\)[^\n]*valore complessivo dei beni significativi[^\n]*/;
  if (esistente.test(attuale)) return attuale.replace(esistente, frase) + "\n";
  return attuale ? `${attuale}\n${frase}\n` : `${frase}\n`;
}

/**
 * Lo stesso, per la Causale: è l'unico testo libero che arriva nell'XML allo SDI
 * (le note del documento restano sul PDF). La frase del valore dei beni sta qui,
 * una volta sola; se c'era già con un altro valore, si aggiorna.
 */
export function causaliConValoreBeni(causali: readonly string[] | null | undefined, valoreBeni: number): string[] {
  const frase = fraseValoreBeniSignificativi(valoreBeni);
  const attuali = [...(causali ?? [])];
  const i = attuali.findIndex((c) => /valore complessivo dei beni significativi/i.test(c));
  if (i >= 0) attuali[i] = frase;
  else attuali.push(frase);
  return attuali;
}
