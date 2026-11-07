/**
 * Le carte della ditta che scadono, in una riga, dentro Attività.
 *
 * Senza niente di scaduto o in scadenza non occupa posto, e chi non può vedere
 * le impostazioni dell'azienda non la vede affatto: la riga porta su una pagina
 * che a lui sarebbe chiusa.
 */
import { Link } from 'react-router-dom';
import { ChevronRight, FileWarning } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConteggioScadenzeAzienda } from '@/hooks/useDocumentiAzienda';
import { frasiScadenze } from '@/lib/documentiAzienda/rigaScadenze';

export function ScadenzeDittaBox() {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const puoVedere = !!(permessi.isAdmin || permessi.canViewSettingsProfile);
  const conteggio = useConteggioScadenzeAzienda(effectiveCompany?.id, puoVedere);
  const frase = conteggio.data ? frasiScadenze(conteggio.data) : null;
  if (!puoVedere || !frase) return null;

  // Rosso se c'è già qualcosa di scaduto, ambra se si è ancora in tempo: il
  // colore dice da solo se è una cosa da oggi o da questo mese.
  const urgente = (conteggio.data?.scadute ?? 0) > 0;
  return (
    <Link
      to="/azienda/impostazioni/documenti-azienda"
      className={
        urgente
          ? 'flex items-center gap-2 rounded-xl border border-red-200 bg-card px-4 py-2.5 text-sm transition-colors hover:bg-red-50/50'
          : 'flex items-center gap-2 rounded-xl border border-amber-200 bg-card px-4 py-2.5 text-sm transition-colors hover:bg-amber-50/50'
      }
    >
      <FileWarning
        className={urgente ? 'h-4 w-4 shrink-0 text-red-600' : 'h-4 w-4 shrink-0 text-amber-600'}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-semibold">Carte della ditta</span>
      <span
        className={
          urgente
            ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800'
            : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900'
        }
      >
        {frase}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
    </Link>
  );
}
