import { useEffect, useState } from 'react';
import { MapPin, MapPinOff, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatDateTime } from '@/lib/formatters';
import { FotoCantiere } from '@/hooks/useFotoCantiere';
import { cn } from '@/lib/utils';
// 🆕 GAP 5 (Mobile cantiere AI-native): badge AI quality auto-trigger
import { FotoAIQualityBadge } from '@/components/foto-cantiere/FotoAIQualityBadge';

interface Props {
  foto: FotoCantiere;
  onElimina: (foto: FotoCantiere) => void;
  getSignedUrl: (path: string) => Promise<string | null>;
  /** Apre la foto in grande. */
  onApri?: (foto: FotoCantiere) => void;
}

/** Quanto resta «appena caricata» una foto: il tempo di vederne l'analisi comparire. */
export const MINUTI_ANALISI_AUTOMATICA = 10;

export function fotoAppenaCaricata(createdAt: string, adesso: number = Date.now()): boolean {
  const creata = new Date(createdAt).getTime();
  return Number.isFinite(creata) && adesso - creata >= 0 && adesso - creata < MINUTI_ANALISI_AUTOMATICA * 60_000;
}

function dataCorta(value: string): string {
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, "d MMM · HH:mm", { locale: it });
}

export function FotoCard({ foto, onElimina, getSignedUrl, onApri }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSignedUrl(foto.storage_path).then((signed) => {
      if (!cancelled) {
        setUrl(signed);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [foto.storage_path, getSignedUrl]);

  const hasGps = foto.latitudine != null && foto.longitudine != null;

  const handleElimina = () => {
    if (window.confirm('Eliminare questa foto? L\'operazione non è reversibile.')) {
      onElimina(foto);
    }
  };

  const nome = foto.descrizione ? `Apri la foto: ${foto.descrizione}` : 'Apri la foto';

  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[4/3] bg-slate-100">
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-slate-200" />
        ) : url ? (
          <button
            type="button"
            onClick={() => onApri?.(foto)}
            aria-label={nome}
            disabled={!onApri}
            className={cn(
              'absolute inset-0 block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
              onApri ? 'cursor-zoom-in' : 'cursor-default',
            )}
          >
            <img
              src={url}
              alt={foto.descrizione ?? 'Foto cantiere'}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
            />
          </button>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Immagine non disponibile
          </div>
        )}
        {/* Il GPS dà valore di prova alla foto: si vede a colpo d'occhio se c'è, senza gridare quando manca. */}
        <span
          title={hasGps ? 'Foto con posizione GPS' : 'Senza posizione GPS'}
          className={cn(
            'pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm',
            hasGps ? 'bg-emerald-600/90 text-white' : 'bg-black/45 text-white/90',
          )}
        >
          {hasGps ? <MapPin className="h-3 w-3" aria-hidden="true" /> : <MapPinOff className="h-3 w-3" aria-hidden="true" />}
          {hasGps ? 'GPS' : 'Senza GPS'}
        </span>
      </div>

      <figcaption className="space-y-1.5 p-2.5">
        {foto.descrizione && (
          <p className="line-clamp-2 text-sm leading-snug text-slate-800">{foto.descrizione}</p>
        )}
        {/* L'analisi AI parte da sola solo per la foto appena caricata: partendo per OGNI foto senza punteggio a
            ogni apertura della galleria, 60 foto farebbero 60 chiamate AI insieme (e a pagamento). Per le altre
            c'è il pulsante «Analizza con AI». */}
        <FotoAIQualityBadge
          fotoId={foto.id}
          companyId={foto.company_id}
          autoAnalyze={fotoAppenaCaricata(foto.created_at)}
          variant="compact"
        />
        <div className="flex items-center justify-between gap-2">
          <time dateTime={foto.taken_at} className="text-xs tabular-nums text-slate-500">
            {/* sul telefono la scheda è stretta: data corta, senza anno */}
            <span className="sm:hidden">{dataCorta(foto.taken_at)}</span>
            <span className="max-sm:hidden">{formatDateTime(foto.taken_at)}</span>
          </time>
          <button
            type="button"
            onClick={handleElimina}
            aria-label="Elimina la foto"
            title="Elimina la foto"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </figcaption>
    </figure>
  );
}
