import type { ReactNode } from 'react';
import type { StatoSalvataggio } from './PiedePreventivatore';

/** Do not mount PDF/signature controls against an older saved computo. */
export function PdfDatiSalvatiGuard({ stato, onComputo, children }: {
  stato: StatoSalvataggio; onComputo?: () => void; children: ReactNode;
}) {
  if (stato === 'salvato') return <>{children}</>;
  return <section role="alert" className="m-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
    <h2 className="font-semibold">PDF in attesa del salvataggio</h2>
    <p>{stato === 'salvando' ? 'Il PDF sarà disponibile dopo il salvataggio.' : 'Salva le modifiche per ottenere il PDF aggiornato.'}</p>
    {onComputo && <button type="button" onClick={onComputo} className="min-h-11 rounded-lg border border-orange-300 bg-white px-3 py-2 font-medium">Torna al computo per salvare</button>}
  </section>;
}
