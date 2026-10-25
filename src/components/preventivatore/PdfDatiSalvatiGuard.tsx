import type { ReactNode } from 'react';
import type { StatoSalvataggio } from './PiedePreventivatore';

/** Do not mount PDF/signature controls against an older saved computo. */
export function PdfDatiSalvatiGuard({ stato, onComputo, children }: {
  stato: StatoSalvataggio; onComputo: () => void; children: ReactNode;
}) {
  if (stato === 'salvato') return <>{children}</>;
  return <section role="alert" className="m-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
    <h2 className="font-semibold">Il documento attende le ultime modifiche</h2>
    <p>{stato === 'salvando' ? 'Salvataggio in corso.' : 'Ci sono modifiche non salvate.'} Per evitare un PDF con dati precedenti, anteprima, download e invio restano sospesi. Le voci rimangono nel wizard.</p>
    <button type="button" onClick={onComputo} className="rounded-lg border border-orange-300 bg-white px-3 py-2 font-medium">Torna al computo per salvare</button>
  </section>;
}
