/**
 * Una linea sottile con i valori di ogni giorno: senza assi, con l'ultimo
 * punto in evidenza. Serve a vedere un calo, non a leggere un numero.
 */
export function Sparkline({ valori, larghezza = 132, altezza = 26, titolo }: { valori: number[]; larghezza?: number; altezza?: number; titolo?: string }) {
  if (valori.length < 2) return null;
  const max = Math.max(1, ...valori);
  const passo = larghezza / (valori.length - 1);
  const y = (v: number) => altezza - 2 - (v / max) * (altezza - 4);
  const punti = valori.map((v, i) => `${(i * passo).toFixed(1)},${y(v).toFixed(1)}`);
  const ultimoX = (valori.length - 1) * passo;
  const ultimoY = y(valori[valori.length - 1]);
  return (
    <svg width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} className="shrink-0 overflow-visible text-blue-600 dark:text-blue-400" role="img" aria-label={titolo}>
      {titolo && <title>{titolo}</title>}
      <polygon points={`0,${altezza} ${punti.join(" ")} ${ultimoX.toFixed(1)},${altezza}`} fill="currentColor" opacity={0.12} />
      <polyline points={punti.join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ultimoX} cy={ultimoY} r={2.5} fill="currentColor" />
    </svg>
  );
}
