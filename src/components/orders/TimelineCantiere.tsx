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
import { EmptyRow } from "./EmptyRow";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

interface TimelineCantiereProp {
  orderId: string;
  companyId: string;
  /** false = vista cliente (solo visibili), true = vista admin (tutti) */
  adminView?: boolean;
}

import { variationStatusLabel } from '@/lib/orders/contractValue';

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

// Icona + colore + nome per tipo di evento
const typeConfig = {
  stato:      { Icon: RefreshCw, color: 'bg-blue-500',   label: 'Stati' },
  lavori:     { Icon: Hammer,    color: 'bg-orange-500', label: 'Lavori' },
  sal:        { Icon: Euro,      color: 'bg-green-600',  label: 'SAL' },
  variante:   { Icon: GitBranch, color: 'bg-purple-600', label: 'Varianti' },
  // sono i rapportini d'intervento firmati (assistenza): «Rapportino» qui si
  // confondeva con i Rapportini Campo, che stanno nella scheda sopra.
  rapportino: { Icon: Wrench,    color: 'bg-slate-600',  label: 'Interventi' },
} as const;

const ORDINE_TIPI: EventType[] = ['stato', 'lavori', 'sal', 'variante', 'rapportino'];

function safeParseDate(dateStr: string): Date | null {
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/** Una riga della cronologia: icona piccola, titolo e data sulla stessa riga. */
function RigaEvento({ ev }: { ev: TimelineEvent }) {
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const { Icon, color } = typeConfig[ev.type];
  const parsedDate = safeParseDate(ev.date);

  return (
    <li className="flex gap-3 p-3">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`} aria-hidden="true">
        <Icon className="h-3.5 w-3.5 text-white" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium leading-snug text-foreground">{ev.title}</p>
          {parsedDate && (
            <time dateTime={ev.date} className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {format(parsedDate, 'd MMM yyyy', { locale: it })}
            </time>
          )}
        </div>

        {/* Badge stato */}
        {ev.badge && (
          <Badge
            className="mt-1.5 text-[11px]"
            style={{ backgroundColor: ev.badgeColor ?? '#475569', color: '#fff' }}
          >
            {ev.badge}
          </Badge>
        )}

        {/* Avanzamento: una barra corta accanto alla percentuale */}
        {ev.progressPct != null && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Avanzamento</span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(0, ev.progressPct))}%` }} />
            </span>
            <span className="font-medium tabular-nums text-foreground">{ev.progressPct}%</span>
          </div>
        )}

        {/* Meta: operai + meteo */}
        {(ev.operai || ev.meteo) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {ev.operai && <span>{ev.operai} {ev.operai === 1 ? 'operaio' : 'operai'}</span>}
            {ev.meteo && (
              <span>
                <Cloud className="mr-0.5 inline h-3 w-3" />
                {ev.meteo}
              </span>
            )}
          </div>
        )}

        {/* Importo della variante approvata */}
        {ev.amount != null && ev.type === 'variante' && (
          <p className="mt-1.5 text-xs font-medium text-green-700">
            Importo variante: {ev.amount > 0 ? '+' : ''}{formatCurrency(ev.amount)}
          </p>
        )}

        {/* Foto miniature */}
        {ev.photos && ev.photos.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={photoExpanded}
              onClick={() => setPhotoExpanded(v => !v)}
              className="mb-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Camera className="h-3 w-3" />
              {ev.photos.length} foto
              {photoExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {photoExpanded && (
              <div className="flex flex-wrap gap-2">
                {ev.photos.slice(0, 8).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-16 w-16 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                  >
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </a>
                ))}
                {ev.photos.length > 8 && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                    +{ev.photos.length - 8}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TimelineCantiere({ orderId, companyId, adminView = false }: TimelineCantiereProp) {
  const [filtro, setFiltro] = useState<EventType | 'tutti'>('tutti');
  const [visibili, setVisibili] = useState(10);
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
        badge: variationStatusLabel(v.status),
        badgeColor: v.status === 'approvato' ? '#16A34A' : '#DC2626',
        amount: v.status === 'approvato' ? (v.impatto_economico ?? undefined) : undefined,
      })),
    ...rapportini.map((r: any) => ({
      id: `rapportino-${r.id as string}`,
      type: 'rapportino' as EventType,
      date: r.data_intervento as string,
      title: `Intervento #${r.numero as number}: ` +
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

  // Riepilogo economico, filtro per tipo e raggruppamento per mese.
  const { riepilogo, tipiPresenti, gruppi, totaleFiltrati } = useMemo(() => {
    const conteggi: Record<EventType, number> = { stato: 0, lavori: 0, sal: 0, variante: 0, rapportino: 0 };
    for (const e of events) conteggi[e.type] += 1;
    const tipiPresenti = ORDINE_TIPI.filter(t => conteggi[t] > 0).map(t => ({ tipo: t, n: conteggi[t] }));

    // «Storico economico»: quanto hanno spostato le varianti approvate e quanti SAL sono usciti.
    const variantiApprovate = varianti.filter(v => v.status === 'approvato');
    const riepilogo = {
      varianti: variantiApprovate.length,
      impattoVarianti: variantiApprovate.reduce((tot, v) => tot + (Number(v.impatto_economico) || 0), 0),
      sal: sal.length,
      importoSal: sal.reduce((tot, x) => tot + (Number(x.importo_totale) || 0), 0),
    };

    const filtrati = filtro === 'tutti' ? events : events.filter(e => e.type === filtro);
    const gruppi: Array<{ mese: string; etichetta: string; eventi: TimelineEvent[] }> = [];
    for (const ev of filtrati.slice(0, visibili)) {
      const d = safeParseDate(ev.date);
      const mese = d ? format(d, 'yyyy-MM') : '';
      let g = gruppi[gruppi.length - 1];
      if (!g || g.mese !== mese) {
        g = { mese, etichetta: d ? format(d, 'LLLL yyyy', { locale: it }) : 'Senza data', eventi: [] };
        gruppi.push(g);
      }
      g.eventi.push(ev);
    }
    return { riepilogo, tipiPresenti, gruppi, totaleFiltrati: filtrati.length };
  }, [events, varianti, sal, filtro, visibili]);

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
      /* Riga compatta: py-10 centrato faceva 186px di vuoto accanto ai rapportini. */
      <EmptyRow icon={RefreshCw}>Nessun aggiornamento su questa commessa</EmptyRow>
    );
  }

  return (
    <div className="space-y-4">
      {/* Solo per l'ufficio: quanto pesano varianti e SAL sulla commessa. */}
      {adminView && (riepilogo.varianti > 0 || riepilogo.sal > 0) && (
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {riepilogo.varianti > 0 && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {riepilogo.varianti === 1 ? 'Variante approvata' : 'Varianti approvate'} ({riepilogo.varianti})
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {riepilogo.impattoVarianti > 0 ? '+' : ''}{formatCurrency(riepilogo.impattoVarianti)}
              </dd>
            </div>
          )}
          {riepilogo.sal > 0 && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                SAL emessi ({riepilogo.sal})
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(riepilogo.importoSal)}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Filtro per tipo, solo se ce n'è più d'uno */}
      {tipiPresenti.length > 1 && (
        <div role="group" aria-label="Filtra la cronologia" className="flex flex-wrap gap-1.5">
          {([{ tipo: 'tutti' as const, n: events.length }, ...tipiPresenti]).map(({ tipo, n }) => (
            <button
              key={tipo}
              type="button"
              aria-pressed={filtro === tipo}
              onClick={() => { setFiltro(tipo); setVisibili(10); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filtro === tipo
                  ? 'border-blue-950 bg-blue-950 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
              )}
            >
              {tipo === 'tutti' ? 'Tutti' : typeConfig[tipo].label}
              <span className={cn('tabular-nums', filtro === tipo ? 'text-white/80' : 'text-slate-500')}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {gruppi.map(g => (
        <section key={g.mese || 'senza-data'} aria-label={g.etichetta} className="space-y-2">
          <h4 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{g.etichetta}</h4>
          <ol className="divide-y overflow-hidden rounded-lg border bg-card">
            {g.eventi.map(ev => (
              <RigaEvento key={ev.id} ev={ev} />
            ))}
          </ol>
        </section>
      ))}

      {totaleFiltrati > visibili && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Mostrati {Math.min(visibili, totaleFiltrati)} di {totaleFiltrati}
          </p>
          <Button variant="outline" size="sm" onClick={() => setVisibili(v => v + 10)}>Mostra altri 10</Button>
        </div>
      )}
    </div>
  );
}
