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
