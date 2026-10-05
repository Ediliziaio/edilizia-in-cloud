/**
 * Il totale in testa alla barra delle fasi: sempre in vista, dal primo passo.
 * Lo usano la barra comune (`BarraFasi`) e quella del Fotovoltaico (`FvTabBar`).
 */
interface Props {
  totale: { valore: string; etichetta?: string };
}

export function TotaleBarra({ totale }: Props) {
  return (
    <div className="flex flex-col items-end justify-center leading-tight" aria-live="polite">
      {/* Tra 1024 e 1279 px la barra laterale dell'app toglie 240 px: l'etichetta cede il posto alle fasi. */}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 lg:max-xl:hidden">{totale.etichetta ?? "Totale IVA incl."}</span>
      <span className="text-xl font-bold tabular-nums tracking-tight text-slate-900">{totale.valore}</span>
    </div>
  );
}
