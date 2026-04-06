import { X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { GeofenceBreachNotification } from '@/hooks/useGeofenceAlert';

interface Props {
  violazione: GeofenceBreachNotification;
  onDismiss: () => void;
}

export function GeofenceAlertBanner({ violazione, onDismiss }: Props) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 bg-red-600 text-white px-4 py-3 shadow-lg animate-in slide-in-from-top"
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{violazione.title}</p>
        {violazione.body && (
          <p className="text-xs opacity-90 mt-0.5 truncate">{violazione.body}</p>
        )}
        <p className="text-xs opacity-75 mt-0.5">
          {format(new Date(violazione.created_at), "HH:mm:ss 'del' dd/MM/yyyy", { locale: it })}
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Chiudi allerta"
        className="rounded p-1 hover:bg-red-700 transition-colors flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
