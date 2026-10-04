import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { FotoCantiere } from '@/hooks/useFotoCantiere';
import { formatDateTime } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FotoCard } from './FotoCard';

interface Props {
  foto: FotoCantiere[];
  isLoading: boolean;
  onElimina: (foto: FotoCantiere) => void;
  getSignedUrl: (path: string) => Promise<string | null>;
}

const GRIGLIA = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
/** Oltre questo numero le foto si raggruppano per giorno. */
const SOGLIA_GIORNI = 12;

/** La foto aperta in grande, con frecce (e tasti ← →) per scorrere le altre. */
function FotoInGrande({
  foto, indice, onVai, onChiudi, onElimina, getSignedUrl,
}: {
  foto: FotoCantiere[];
  indice: number;
  onVai: (i: number) => void;
  onChiudi: () => void;
  onElimina: (foto: FotoCantiere) => void;
  getSignedUrl: (path: string) => Promise<string | null>;
}) {
  const corrente = foto[indice];
  const [url, setUrl] = useState<string | null>(null);
  const [carica, setCarica] = useState(true);

  useEffect(() => {
    let annullato = false;
    setCarica(true);
    getSignedUrl(corrente.storage_path).then((u) => {
      if (!annullato) { setUrl(u); setCarica(false); }
    });
    return () => { annullato = true; };
  }, [corrente.storage_path, getSignedUrl]);

  const haGps = corrente.latitudine != null && corrente.longitudine != null;
  const prima = indice > 0;
  const dopo = indice < foto.length - 1;

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto) onChiudi(); }}>
      <DialogContent
        className="max-w-4xl gap-0 overflow-hidden p-0"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && prima) onVai(indice - 1);
          if (e.key === 'ArrowRight' && dopo) onVai(indice + 1);
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Foto cantiere</DialogTitle>
          <DialogDescription>Foto {indice + 1} di {foto.length}. Usa le frecce per scorrere.</DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-[240px] max-h-[70vh] items-center justify-center bg-black">
          {carica ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-label="Caricamento foto" />
          ) : url ? (
            <img src={url} alt={corrente.descrizione ?? 'Foto cantiere'} className="max-h-[70vh] w-auto max-w-full object-contain" />
          ) : (
            <p className="text-sm text-white/70">Immagine non disponibile</p>
          )}
          {prima && (
            <button
              type="button"
              onClick={() => onVai(indice - 1)}
              aria-label="Foto precedente"
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {dopo && (
            <button
              type="button"
              onClick={() => onVai(indice + 1)}
              aria-label="Foto successiva"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-2 p-4">
          {corrente.descrizione && <p className="text-sm leading-snug text-slate-800">{corrente.descrizione}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={corrente.taken_at} className="tabular-nums">{formatDateTime(corrente.taken_at)}</time>
            {haGps ? (
              <a
                href={`https://www.google.com/maps?q=${corrente.latitudine},${corrente.longitudine}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Apri la posizione sulla mappa
                {corrente.accuracy_meters != null && <span className="font-normal text-muted-foreground">(± {Math.round(corrente.accuracy_meters)} m)</span>}
              </a>
            ) : (
              <span>Senza posizione GPS</span>
            )}
            <span className="ml-auto tabular-nums">{indice + 1} di {foto.length}</span>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                if (window.confirm('Eliminare questa foto? L\'operazione non è reversibile.')) {
                  onElimina(corrente);
                  onChiudi();
                }
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />Elimina
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FotoGrid({ foto, isLoading, onElimina, getSignedUrl }: Props) {
  const [aperta, setAperta] = useState<number | null>(null);

  // Dalla più recente. Con poche foto una griglia sola (ogni scheda ha già la
  // sua data); da una dozzina in su i titoli per giorno aiutano a ritrovare un
  // momento. L'indice è quello della lista ordinata: è lo stesso che usa
  // l'ingrandimento per scorrere.
  const { ordinate, gruppi } = useMemo(() => {
    const ordinate = [...foto].sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime());
    const raggruppa = ordinate.length > SOGLIA_GIORNI;
    const gruppi: Array<{ giorno: string; etichetta: string | null; righe: Array<{ foto: FotoCantiere; indice: number }> }> = [];
    ordinate.forEach((f, indice) => {
      const d = parseISO(f.taken_at);
      const valida = !Number.isNaN(d.getTime());
      const giorno = raggruppa ? (valida ? format(d, 'yyyy-MM-dd') : 'senza-data') : 'tutte';
      let g = gruppi[gruppi.length - 1];
      if (!g || g.giorno !== giorno) {
        g = {
          giorno,
          etichetta: raggruppa ? (valida ? format(d, 'd MMMM yyyy', { locale: it }) : 'Senza data') : null,
          righe: [],
        };
        gruppi.push(g);
      }
      g.righe.push({ foto: f, indice });
    });
    return { ordinate, gruppi };
  }, [foto]);

  if (isLoading) {
    return (
      <div className={GRIGLIA}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-lg bg-slate-200" />
        ))}
      </div>
    );
  }

  if (foto.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-8 text-center text-slate-500">
        <Camera className="h-6 w-6" aria-hidden="true" />
        <p className="text-sm font-medium">Nessuna foto caricata</p>
        <p className="text-xs">Le foto scattate dal campo arrivano qui con data e posizione.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {gruppi.map((g) => (
        <section key={g.giorno} aria-label={g.etichetta ?? 'Foto del cantiere'} className="space-y-2">
          {g.etichetta && (
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {g.etichetta}
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">{g.righe.length} foto</span>
            </h4>
          )}
          <div className={GRIGLIA}>
            {g.righe.map(({ foto: f, indice }) => (
              <FotoCard
                key={f.id}
                foto={f}
                onElimina={onElimina}
                getSignedUrl={getSignedUrl}
                onApri={() => setAperta(indice)}
              />
            ))}
          </div>
        </section>
      ))}

      {aperta != null && ordinate[aperta] && (
        <FotoInGrande
          foto={ordinate}
          indice={aperta}
          onVai={setAperta}
          onChiudi={() => setAperta(null)}
          onElimina={onElimina}
          getSignedUrl={getSignedUrl}
        />
      )}
    </div>
  );
}
