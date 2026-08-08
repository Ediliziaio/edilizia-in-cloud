// src/components/orders/TimelineCantiere.tsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, Hammer, Camera, Euro, GitBranch, Cloud, ChevronDown, ChevronUp, Wrench,
} from 'lucide-react';

interface TimelineCantiereProp {
  orderId: string;
  companyId: string;
  /** false = vista cliente (solo visibili), true = vista admin (tutti) */
  adminView?: boolean;
}

type EventType = 'stato' | 'lavori' | 'sal' | 'variante' | 'rapportino';

interface TimelineEvent {
  id: string;
  type: EventType;
  date: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  progressPct?: number;
  photos?: string[];
  amount?: number;
  meteo?: string;
  operai?: number;
}

// Icon + color per tipo evento
const typeConfig = {
  stato:    { Icon: RefreshCw,  color: 'bg-blue-500',   label: 'Stato' },
  lavori:   { Icon: Hammer,     color: 'bg-orange-500', label: 'Lavori' },
  sal:      { Icon: Euro,       color: 'bg-green-600',  label: 'SAL' },
  variante:   { Icon: GitBranch,  color: 'bg-purple-600', label: 'Variante' },
  rapportino: { Icon: Wrench,     color: 'bg-slate-600',  label: 'Rapportino' },
};

function safeParseDate(dateStr: string): Date | null {
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function EventCard({ ev }: { ev: TimelineEvent }) {
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const { Icon, color } = typeConfig[ev.type];
  const parsedDate = safeParseDate(ev.date);

  return (
    <div className="flex gap-4 relative">
      {/* Dot */}
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0 z-10 shadow-sm`}>
        <Icon className="h-4 w-4 text-white" />
      </div>

      {/* Content card */}
      <div className="flex-1 bg-card border rounded-lg p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground leading-snug">{ev.title}</p>
          {parsedDate && (
            <span className="text-xs text-muted-foreground shrink-0">
              {format(parsedDate, 'dd MMM yyyy', { locale: it })}
            </span>
          )}
        </div>

        {/* Badge stato */}
        {ev.badge && (
          <Badge
            className="mt-1.5 text-xs"
            style={{ backgroundColor: ev.badgeColor ?? '#475569', color: '#fff' }}
          >
            {ev.badge}
          </Badge>
        )}

        {/* Progress bar avanzamento */}
        {ev.progressPct != null && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Avanzamento lavori</span>
              <span className="font-medium">{ev.progressPct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${ev.progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta: operai + meteo */}
        {(ev.operai || ev.meteo) && (
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            {ev.operai && <span>👷 {ev.operai} operai</span>}
            {ev.meteo && (
              <span>
                <Cloud className="inline h-3 w-3 mr-0.5" />
                {ev.meteo}
              </span>
            )}
          </div>
        )}

        {/* Foto miniature */}
        {ev.photos && ev.photos.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPhotoExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <Camera className="h-3 w-3" />
              {ev.photos.length} foto
              {photoExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {photoExpanded && (
              <div className="flex gap-2 flex-wrap">
                {ev.photos.slice(0, 8).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-16 h-16 rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
                  >
                    <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </a>
                ))}
                {ev.photos.length > 8 && (
                  <div className="w-16 h-16 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    +{ev.photos.length - 8}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Importo variante */}
        {ev.amount != null && ev.type === 'variante' && (
          <p className="mt-1 text-xs font-medium text-green-600">
            Importo variante: +€{ev.amount.toLocaleString('it-IT')}
          </p>
        )}
      </div>
    </div>
  );
}

export function TimelineCantiere({ orderId, companyId, adminView = false }: TimelineCantiereProp) {
  // 1. Fetch status history
  const { data: statusHistory = [], isLoading: loadingStati } = useQuery({
    queryKey: ['timeline-stati', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('id, changed_at, status:order_statuses(name, color, icon)')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // 2. Fetch giornale lavori (+ foto)
  const { data: giornale = [], isLoading: loadingGiornale } = useQuery({
    queryKey: ['timeline-lavori', orderId, adminView],
    queryFn: async () => {
      let q = supabase
        .from('giornale_lavori')
        .select(`
          id, data_lavori, lavorazioni_eseguite, avanzamento_percentuale,
          personale_presente, condizioni_meteo, visibile_cliente,
          foto:giornale_foto(url)
        `)
        .eq('order_id', orderId)
        .order('data_lavori', { ascending: false });
      if (!adminView) q = q.eq('visibile_cliente', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // 3. Fetch SAL records (stati visibili)
  const { data: sal = [], isLoading: loadingSal } = useQuery({
    queryKey: ['timeline-sal', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sal_records')
        .select('id, numero_sal, importo_totale, data_emissione, stato')
        .eq('order_id', orderId)
        .in('stato', ['emesso', 'approvato', 'firmato'])
        .order('data_emissione', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // 4. Fetch varianti (non in proposta)
  const { data: varianti = [], isLoading: loadingVarianti } = useQuery({
    queryKey: ['timeline-varianti', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordini_variazione')
        .select('id, titolo, impatto_economico, status, firmato_il, richiesto_il')
        .eq('order_id', orderId)
        .not('status', 'in', '("proposta","in_attesa")')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // 5. Fetch rapportini intervento firmati con foto
  // Join in 2 step: rapportini.ticket_id -> tickets.order_id
  const { data: rapportini = [], isLoading: loadingRapportini } = useQuery({
    queryKey: ['timeline-rapportini', orderId, companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // Step A: trova tutti i ticket_id collegati a questo ordine
      const { data: ticketRows, error: tErr } = await supabase
        .from('tickets')
        .select('id')
        .eq('order_id', orderId)
        .eq('company_id', companyId);
      if (tErr || !ticketRows?.length) return [];
      const ticketIds = ticketRows.map((t: { id: string }) => t.id);
      // Step B: rapportini firmati di quei ticket con foto
      const { data, error } = await (supabase as any)
        .from('rapportini_intervento')
        .select('id, numero, descrizione, data_intervento, firmato_da, foto_urls, ore_lavoro')
        .in('ticket_id', ticketIds)
        .eq('stato', 'firmato')
        .order('data_intervento', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orderId && !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = loadingStati || loadingGiornale || loadingSal || loadingVarianti || loadingRapportini;

  // Merge e sort tutti gli eventi — memoizzato per evitare re-sort ad ogni render (PRIMA del guard)
  const events: TimelineEvent[] = useMemo(() => isLoading ? [] : [
    ...statusHistory.map(s => ({
      id: `stato-${s.id}`,
      type: 'stato' as EventType,
      date: s.changed_at,
      title: `Stato aggiornato: ${(s.status as any)?.name ?? ''}`,
      badge: (s.status as any)?.name as string | undefined,
      badgeColor: (s.status as any)?.color as string | undefined,
    })),
    ...giornale.map(g => ({
      id: `lavori-${g.id}`,
      type: 'lavori' as EventType,
      date: g.data_lavori,
      title: g.lavorazioni_eseguite ?? 'Aggiornamento lavori',
      progressPct: (g as any).avanzamento_percentuale ?? undefined,
      operai: (g as any).personale_presente ?? undefined,
      meteo: g.condizioni_meteo ?? undefined,
      // Estrae URL in modo sicuro anche se foto non è array
      photos: Array.isArray((g as any).foto)
        ? ((g as any).foto as any[]).map((f: any) => f?.url).filter(Boolean)
        : [],
    })),
    ...sal.map(s => ({
      id: `sal-${s.id}`,
      type: 'sal' as EventType,
      date: s.data_emissione,
      title: `SAL #${s.numero_sal} — €${Number(s.importo_totale).toLocaleString('it-IT')}`,
      badge: s.stato as string | undefined,
      badgeColor: s.stato === 'firmato' ? '#16A34A' : '#CA8A04',
      amount: s.importo_totale,
    })),
    ...varianti
      .filter(v => !!(v.firmato_il || v.richiesto_il))
      .map(v => ({
        id: `odv-${v.id}`,
        type: 'variante' as EventType,
        date: (v.firmato_il ?? v.richiesto_il) as string,
        title: v.titolo ?? 'Variante commessa',
        badge: v.status === 'approvata' ? 'Approvata' : 'Rifiutata',
        badgeColor: v.status === 'approvata' ? '#16A34A' : '#DC2626',
        amount: v.status === 'approvata' ? (v.impatto_economico ?? undefined) : undefined,
      })),
    ...rapportini.map((r: any) => ({
      id: `rapportino-${r.id as string}`,
      type: 'rapportino' as EventType,
      date: r.data_intervento as string,
      title: `Rapportino #${r.numero as number}: ` +
        `${((r.descrizione as string) ?? '').substring(0, 70)}` +
        `${((r.descrizione as string)?.length ?? 0) > 70 ? '...' : ''}`,
      badge: r.firmato_da ? `Firmato da ${r.firmato_da as string}` : 'Firmato',
      badgeColor: '#475569',
      photos: Array.isArray(r.foto_urls) ? (r.foto_urls as string[]).filter(Boolean) : [],
    })),
  ]
    .filter(e => !!e.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),

  [isLoading, statusHistory, giornale, sal, varianti, rapportini]);

  // Guard loading DOPO gli hooks
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <Skeleton className="flex-1 h-20 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nessun aggiornamento disponibile per questa commessa.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Linea verticale */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-6">
        {events.map(ev => (
          <EventCard key={ev.id} ev={ev} />
        ))}
      </div>
    </div>
  );
}
