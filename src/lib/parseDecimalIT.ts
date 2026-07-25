/**
 * 2026-05-27 (audit Form UX — BUG CRITICO calcoli fiscali):
 *
 * Prima: ovunque si usava `parseFloat(e.target.value) || 0` sui campi
 * importo / quantità / IVA. Se l'utente incolla un valore in formato
 * italiano da Excel o mail del cliente:
 *   "9,50"     → parseFloat → 9 (perde i 50 centesimi)
 *   "1.234,56" → parseFloat → 1.234 (perde 1233 €!)
 *   "€ 9,50"   → parseFloat → NaN
 *
 * Risultato: totali fattura SBAGLIATI, autosalvati in DB, inviati a SDI.
 * Il cliente vede e contesta → reputazione professionista distrutta.
 *
 * ────────────────────────────────────────────────────────────────────
 * 2026-07-25 (secondo giro — stesso bug, altra metà del problema):
 *
 * Il punto era trattato SEMPRE come decimale quando era l'unico
 * separatore, quindi "1.500" → 1.5 e "85.000" → 85. Ma un impresario
 * che digita un importo tondo scrive "1.500", non "1500,00": l'errore
 * ×1000 entrava in preventivi, fatture e DDT in silenzio.
 *
 * La regola giusta esisteva già nel repo — `parseListinoNumber`
 * (src/lib/catalogo/listinoParser.ts) l'aveva ricevuta nel suo audit —
 * ma i due parser erano copie divergenti: la stessa cifra valeva 1.5 se
 * digitata a mano e 1500 se importata da CSV. Ora la logica di
 * normalizzazione dei separatori è UNA sola (`normalizeDecimalSeparators`)
 * e i due helper la condividono; restano distinti solo nel contratto sul
 * valore non numerico (qui 0, nell'import NaN per far vedere l'errore).
 *
 * Formati accettati:
 *   "9,50"      → 9.50
 *   "9.50"      → 9.50
 *   "1.234,56"  → 1234.56
 *   "1,234.56"  → 1234.56 (US: virgola separatore migliaia)
 *   "1.500"     → 1500    (punto separatore migliaia)
 *   "1.234.567" → 1234567
 *   "0.500"     → 0.5     (lo zero davanti esclude le migliaia)
 *   "€ 9,50"    → 9.50
 *   ""/null     → 0
 *
 * Il residuo di ambiguità ("1.500" vale 1500, non 1,5) si copre in UI:
 * i campi importo rimandano a video il valore interpretato con
 * `formatDecimalIT` appena si esce dal campo.
 */

/**
 * Punto come separatore delle MIGLIAIA: 1-3 cifre, poi uno o più gruppi
 * di esattamente 3 cifre, fine stringa. Es. 1.500 / 85.000 / 1.234.567.
 *
 * Lo zero iniziale è escluso di proposito (`[1-9]`): un raggruppamento di
 * migliaia non comincia mai con 0, mentre "0.500" digitato in un campo
 * quantità è mezzo (0,5 m³). Senza questa guardia diventerebbe 500.
 */
const PUNTO_MIGLIAIA = /^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Porta una stringa numerica "all'italiana" (o all'americana, o mista)
 * nella forma canonica con il punto decimale, pronta per parseFloat/Number.
 * Non decide cosa fare del non-numerico: quello spetta al chiamante.
 */
export function normalizeDecimalSeparators(sRaw: string): string {
  let s = sRaw;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Entrambi presenti → l'ultimo è il decimale
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", "."); // IT: 1.234,56
    } else {
      s = s.replace(/,/g, ""); // US: 1,234.56
    }
  } else if (lastComma > -1) {
    // Solo virgola → decimale italiano ("9,50", "1,5")
    s = s.replace(",", ".");
  } else if (PUNTO_MIGLIAIA.test(s)) {
    // Solo punto, in forma di raggruppamento migliaia → "1.500" = 1500
    s = s.replace(/\./g, "");
  }
  // Solo punto in forma decimale ("9.50", "1.5", "1234.56") → invariato.

  return s;
}

export function parseDecimalIT(v: string | number | null | undefined): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : 0;
  }
  if (v == null) return 0;

  // Strip valuta + spazi
  let s = String(v).trim().replace(/[\s€$£]|EUR/gi, "");
  if (!s) return 0;

  // Cattura segno
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  s = normalizeDecimalSeparators(s);

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/**
 * Inverso di `parseDecimalIT` per la UI: rende il numero in formato
 * italiano (virgola decimale, punto migliaia) da rimettere DENTRO al campo
 * appena l'utente lo lascia.
 *
 * È la difesa vera contro l'ambiguità residua del punto: se scrivo "1.500"
 * e al blur il campo mi mostra "1.500,00" so di aver inserito
 * millecinquecento; se volevo 1,5 lo vedo subito, prima del PDF e dello SDI.
 *
 * Garanzia (coperta da test): `parseDecimalIT(formatDecimalIT(n)) === n`.
 */
export function formatDecimalIT(
  v: number | null | undefined,
  { minDecimals = 2, maxDecimals = 2 }: { minDecimals?: number; maxDecimals?: number } = {},
): string {
  if (v == null || !Number.isFinite(v)) return "";
  return v.toLocaleString("it-IT", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    useGrouping: true,
  });
}
