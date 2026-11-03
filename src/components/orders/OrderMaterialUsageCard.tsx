import { useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ContatoriFiltro } from '@/components/orders/ContatoriFiltro';
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella } from '@/components/orders/TabellaCommessa';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { useOrderMaterialUsage } from '@/hooks/useOrderMaterialUsage';

type Riga = NonNullable<ReturnType<typeof useOrderMaterialUsage>['data']>['rows'][number];
type Filtro = 'verifica' | 'residuo' | 'reso';

const FILTRI: Record<Filtro, (r: Riga) => boolean> = {
  verifica: r => r.review,
  residuo: r => r.remaining !== 0,
  reso: r => r.returned !== 0,
};
/** Prima quello che chiede uno sguardo. */
const peso = (r: Riga) => (r.review ? 0 : r.remaining !== 0 ? 1 : 2);
const quantita = (n: number, unita: string | null | undefined) =>
  n === 0 ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 3 })}${unita ? ` ${unita}` : ''}`;

export function OrderMaterialUsageCard({ orderId, showCosts }: { orderId: string; showCosts: boolean }) {
  const { effectiveCompany } = useAuth();
  const query = useOrderMaterialUsage(effectiveCompany?.id, orderId);
  const [expanded, setExpanded] = useState(false);
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const data = query.data;
  const rows = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => peso(a) - peso(b)), [data?.rows]);

  const icona = <PackageCheck className="h-4 w-4 text-primary" aria-hidden />;
  if (query.isLoading || query.isError) {
    return <Card><CardContent className="p-4">
      {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Verifico consegne e rapportini…</p>
        : <div role="alert" className="text-sm">Non riesco a leggere i consumi.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => void query.refetch()}>Riprova</Button></div>}
    </CardContent></Card>;
  }

  const valori = rows.filter(r => !r.review && r.estimatedUsedValue != null);
  const totaleUsato = valori.reduce((t, r) => t + (r.estimatedUsedValue ?? 0), 0);
  const filtrate = filtro ? rows.filter(FILTRI[filtro]) : rows;
  const visibili = filtro || expanded ? filtrate : filtrate.slice(0, 6);
  const conta = (f: Filtro) => rows.filter(FILTRI[f]).length;

  const colonne: ColonnaTabella<Riga>[] = [
    { titolo: 'Articolo', principale: true, cella: r => <span className="flex flex-wrap items-center gap-2 font-medium break-words">{r.name}{r.review && <StatoPill tono="ambra">Da verificare</StatoPill>}</span> },
    { titolo: 'Consegnato', destra: true, cella: r => quantita(r.delivered, r.unit) },
    { titolo: 'Usato', destra: true, cella: r => quantita(r.used, r.unit) },
    { titolo: 'Reso', destra: true, cella: r => quantita(r.returned, r.unit) },
    { titolo: 'Residuo', destra: true, cella: r => <span className={r.remaining !== 0 ? 'font-medium text-amber-700' : undefined}>{quantita(r.remaining, r.unit)}</span> },
    ...(showCosts ? [{ titolo: 'Valore usato', destra: true, cella: (r: Riga) => (r.estimatedUsedValue != null && !r.review ? `≈ ${formatCurrency(r.estimatedUsedValue)}` : '—') }] : []),
  ];

  return <RiquadroCommessa icona={icona} titolo="Materiali in cantiere" conteggio={rows.length}
    riassunto={showCosts && totaleUsato > 0 ? `≈ ${formatCurrency(totaleUsato)} usati` : undefined}
    numeri={rows.length > 0 ? <ContatoriFiltro etichetta="Filtra i materiali" attivo={filtro} onScegli={c => setFiltro(c as Filtro | null)} voci={[
      { chiave: 'verifica', etichetta: 'Da verificare', valore: conta('verifica'), avviso: true },
      { chiave: 'residuo', etichetta: 'Con residuo', valore: conta('residuo'), avviso: true },
      { chiave: 'reso', etichetta: 'Con reso', valore: conta('reso') },
    ]} /> : undefined}>
    <div className="space-y-3">
      {data?.unlinked ? <p className="text-xs text-amber-700">{data.unlinked} voci nei rapportini non collegate a un articolo di magazzino: escluse dal conteggio.</p> : null}
      {!rows.length ? <p className="text-sm text-muted-foreground">Nessun materiale tracciato per questa commessa.</p>
        : <TabellaCommessa etichetta="Materiali in cantiere" colonne={colonne} righe={visibili} chiave={r => r.id} />}
      {!filtro && rows.length > 6 && <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Mostra meno' : `Tutti gli articoli (${rows.length})`}</Button>}
      {rows.length > 0 && <p className="text-xs text-muted-foreground max-sm:hidden">
        Usato = rapportini approvati. Il residuo è da verificare in cantiere, non è una giacenza certificata.
        {showCosts ? ' Valori indicativi al costo medio delle consegne: non aggiungono costi agli OdA.' : ''}
      </p>}
    </div>
  </RiquadroCommessa>;
}
