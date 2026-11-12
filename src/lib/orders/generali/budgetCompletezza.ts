import type { VocePiano } from "./pianoConti";

export const DA_STIMARE = "[EIC:DA_STIMARE]";
export const stimaMancante = (v: Pick<VocePiano, "nota">) => (v.nota ?? "").includes(DA_STIMARE);
export function controllaBudget<T extends Pick<VocePiano, "descrizione" | "importo" | "mese" | "nota">>(
  voci: T[],
) {
  const problemi: string[] = [];
  if (!voci.length) problemi.push("Aggiungi almeno una voce al piano.");
  else if (!voci.some((v) => v.importo > 0))
    problemi.push("Il budget è interamente a zero: inserisci le stime dell'operazione prima di approvare.");
  const mancanti = voci.filter(stimaMancante);
  if (mancanti.length)
    problemi.push(
      `${mancanti.length} voci hanno ancora un importo da stimare. Uno zero va confermato esplicitamente.`,
    );
  if (voci.some((v) => !v.descrizione.trim() || !Number.isFinite(v.importo) || v.importo < 0))
    problemi.push("Completa descrizioni e importi validi di tutte le voci.");
  const calendario = voci.filter((v) => v.importo > 0 && !v.mese);
  if (calendario.length)
    problemi.push(`${calendario.length} voci valorizzate non hanno il mese di incasso o pagamento.`);
  if (voci.some((v) => /\b[1-9]\d* voci da correggere escluse\b/.test(v.nota ?? "")))
    problemi.push(
      "Una precedente importazione ha escluso stime mancanti: reimporta il file in una nuova bozza includendo le voci da completare.",
    );
  return { completo: problemi.length === 0, problemi, mancanti, calendario };
}
export function riferimentoImportazione(hash: string, foglio: string, riga: number) {
  return `[EIC-BP:${hash}:${encodeURIComponent(foglio)}:${riga}]`;
}
export function fonteImportazione(nota: string | null) {
  return (
    /\[EIC-BP:([a-f0-9]{64}):([^\]]+):\d+\]/
      .exec(nota ?? "")
      ?.slice(1, 3)
      .join(":") ?? null
  );
}
