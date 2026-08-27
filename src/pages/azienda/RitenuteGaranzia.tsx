// ============================================================================
// Ritenute di Garanzia — il registro dei soldi parcheggiati (capp. 29, 73-74)
// ============================================================================
// Due direzioni: ATTIVE (il committente le trattiene a noi sui SAL — soldi
// gia' maturati che tornano solo se il rapporto finisce bene) e PASSIVE
// (quelle che noi tratteniamo ai subappaltatori, back-to-back). Il registro
// esiste perche' senza nessuno le va a riprendere: svincolo previsto,
// scaduto da svincolare, fideiussione come alternativa.
// ============================================================================
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { FiscalitaNavigation } from '@/components/fatturazione/FiscalitaNavigation';
import { RitenutaBadge } from '@/components/ritenute/RitenutaBadge';
import { NavyStatCard } from '@/components/costi/KpiCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CalendarClock, CheckCircle2, Plus, ShieldCheck, Landmark } from 'lucide-react';

interface Ritenuta {
  id: string;
  contratto_id: string | null;
  order_id: string | null;
  direzione: 'attiva' | 'passiva';
  controparte: string | null;
  importo: number;
  percentuale_applicata: number | null;
  stato: 'trattenuta' | 'svincolata' | 'persa';
  data_svincolo_prevista: string | null;
  data_svincolo_effettiva: string | null;
  fideiussione: boolean;
  note: string | null;
  created_at: string;
  orders?: { order_code: string | null; description: string | null } | null;
  contratti_subappalto?: { subappaltatori_sicurezza: { ragione_sociale: string | null } | null } | null;
}

const OGGI = () => new Date().toISOString().slice(0, 10);

export default function RitenuteGaranzia() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [direzione, setDirezione] = useState<'attiva' | 'passiva'>('attiva');
  const [nuovaOpen, setNuovaOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ritenute-garanzia', 'all', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ritenute_garanzia')
        .select('id, contratto_id, order_id, direzione, controparte, importo, percentuale_applicata, stato, data_svincolo_prevista, data_svincolo_effettiva, fideiussione, note, created_at, orders(order_code, description), contratti_subappalto(subappaltatori_sicurezza(ragione_sociale))')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ritenuta[];
    },
  });

  const ritenute = useMemo(() => data ?? [], [data]);
  const attive = ritenute.filter((r) => r.direzione === 'attiva');
  const passive = ritenute.filter((r) => r.direzione === 'passiva');
  const lista = direzione === 'attiva' ? attive : passive;

  const aperteAttive = attive.filter((r) => r.stato === 'trattenuta');
  const trattenutoAttivo = aperteAttive.reduce((s, r) => s + Number(r.importo || 0), 0);
  const trattenutoPassivo = passive.filter((r) => r.stato === 'trattenuta').reduce((s, r) => s + Number(r.importo || 0), 0);
  const daSvincolare = aperteAttive.filter((r) => r.data_svincolo_prevista && r.data_svincolo_prevista <= OGGI());
  const svincolatoAnno = ritenute
    .filter((r) => r.direzione === 'attiva' && r.stato === 'svincolata' && (r.data_svincolo_effettiva ?? '').slice(0, 4) === OGGI().slice(0, 4))
    .reduce((s, r) => s + Number(r.importo || 0), 0);

  const svincola = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('ritenute_garanzia')
        .update({ stato: 'svincolata', data_svincolo_effettiva: OGGI() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ritenute-garanzia'] });
      toast({ title: 'Ritenuta svincolata', description: 'Soldi tornati in cassa: registrali in Prima Nota quando arriva il bonifico.' });
    },
    onError: (e: Error) => toast({ title: 'Errore', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="container mx-auto space-y-6 p-6">
      <FiscalitaNavigation />

      {/* Testata navy di famiglia: i soldi parcheggiati, in chiaro. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Ritenute di garanzia</p>
                <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">Soldi tuoi, parcheggiati</h2>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setNuovaOpen(true)}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
            >
              <Plus className="mr-1 h-4 w-4" /> Nuova ritenuta
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label="Trattenuto a te"
              value={formatCurrency(trattenutoAttivo)}
              sub={`${aperteAttive.length} ritenute aperte sui tuoi SAL`}
              icon={ShieldCheck}
              tone="text-orange-100"
            />
            <NavyStatCard
              label="Da svincolare ora"
              value={String(daSvincolare.length)}
              sub={daSvincolare.length > 0 ? `${formatCurrency(daSvincolare.reduce((s, r) => s + Number(r.importo || 0), 0))} oltre la data prevista: vai a riprenderli` : 'niente oltre la data prevista'}
              icon={CalendarClock}
              tone={daSvincolare.length > 0 ? 'text-orange-300' : 'text-emerald-200'}
            />
            <NavyStatCard
              label="Trattenuto ai sub"
              value={formatCurrency(trattenutoPassivo)}
              sub="back-to-back: specchio di quello che subisci"
              icon={Landmark}
            />
            <NavyStatCard
              label={`Svincolato ${OGGI().slice(0, 4)}`}
              value={formatCurrency(svincolatoAnno)}
              sub="tornato in cassa quest'anno"
              icon={CheckCircle2}
              tone="text-emerald-200"
            />
          </div>
        </div>
      </div>

      {/* La regola del manuale, in una riga. */}
      <p className="text-sm text-muted-foreground">
        Nel privato la ritenuta <strong className="text-foreground">non è obbligatoria</strong>: esiste solo se è scritta
        nel contratto, e si negozia come tutto il resto. Quando c'è, torna solo se il rapporto finisce bene — e tocca a te andarla a riprendere.
        Le tre mosse: negozia la <strong className="text-foreground">durata</strong> (6 mesi, non 24), offri una{' '}
        <strong className="text-foreground">fideiussione</strong> al posto della trattenuta, mettila a budget con probabilità d'incasso al 70%.
      </p>

      {/* Selettore direzione + tabella */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-0.5">
        {([['attiva', `Trattenute a te (${attive.length})`], ['passiva', `Ai subappaltatori (${passive.length})`]] as const).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setDirezione(val)}
            className={
              direzione === val
                ? 'rounded-md bg-white px-3 py-1 text-sm font-medium shadow-sm'
                : 'rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{direzione === 'attiva' ? 'Commessa · committente' : 'Subappaltatore'}</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Svincolo previsto</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : lista.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {direzione === 'attiva' ? (
                      <>
                        <p className="mb-1 font-medium text-foreground">Nessuna ritenuta registrata sui tuoi SAL</p>
                        <p className="text-sm">Quando un committente trattiene il 5% su un pagamento, registralo qui: è l'unico modo per andarselo a riprendere alla scadenza.</p>
                      </>
                    ) : (
                      <p>Nessuna ritenuta trattenuta ai subappaltatori.</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                lista.map((r) => {
                  const scaduta = r.stato === 'trattenuta' && r.data_svincolo_prevista && r.data_svincolo_prevista <= OGGI();
                  return (
                    <TableRow key={r.id} className={scaduta ? 'bg-orange-50/60' : undefined}>
                      <TableCell>
                        <p className="font-medium">
                          {r.orders?.order_code ?? r.contratti_subappalto?.subappaltatori_sicurezza?.ragione_sociale ?? r.controparte ?? '—'}
                          {r.fideiussione && <Badge variant="outline" className="ml-2 border-sky-300 text-[10px] text-sky-700">fideiussione</Badge>}
                        </p>
                        <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {r.orders?.order_code ? (r.controparte ?? r.orders?.description ?? '') : (r.note ?? '')}
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(Number(r.importo || 0))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.percentuale_applicata != null ? `${Number(r.percentuale_applicata).toLocaleString('it-IT')}%` : '—'}
                      </TableCell>
                      <TableCell><RitenutaBadge stato={r.stato} /></TableCell>
                      <TableCell className={scaduta ? 'font-medium text-orange-700' : undefined}>
                        {r.data_svincolo_prevista ? formatDate(r.data_svincolo_prevista) : '—'}
                        {scaduta && <span className="block text-[10px]">da riprendere</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.stato === 'trattenuta' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50"
                            disabled={svincola.isPending}
                            onClick={() => svincola.mutate(r.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Svincolata
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NuovaRitenutaDialog
        open={nuovaOpen}
        onOpenChange={setNuovaOpen}
        companyId={companyId}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['ritenute-garanzia'] })}
      />
    </div>
  );
}

function NuovaRitenutaDialog({
  open, onOpenChange, companyId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | undefined;
  onCreated: () => void;
}) {
  const [direzione, setDirezione] = useState<'attiva' | 'passiva'>('attiva');
  const [orderId, setOrderId] = useState<string>('');
  const [controparte, setControparte] = useState('');
  const [importo, setImporto] = useState('');
  const [percentuale, setPercentuale] = useState('5');
  const [svincoloPrevisto, setSvincoloPrevisto] = useState('');
  const [fideiussione, setFideiussione] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: commesse = [] } = useQuery({
    queryKey: ['ritenute-commesse-picker', companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, description')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const salva = async () => {
    const imp = Number(importo.replace(/\./g, '').replace(',', '.'));
    if (!imp || imp <= 0) {
      toast({ title: 'Importo mancante', description: "Inserisci l'importo trattenuto.", variant: 'destructive' });
      return;
    }
    if (direzione === 'attiva' && !orderId) {
      toast({ title: 'Commessa mancante', description: 'Una ritenuta attiva vive su una commessa: scegli quale.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('ritenute_garanzia').insert({
        company_id: companyId,
        direzione,
        order_id: direzione === 'attiva' && orderId ? orderId : null,
        controparte: controparte || null,
        importo: imp,
        percentuale_applicata: Number(percentuale.replace(',', '.')) || null,
        stato: 'trattenuta',
        data_svincolo_prevista: svincoloPrevisto || null,
        fideiussione,
      });
      if (error) throw error;
      toast({ title: 'Ritenuta registrata' });
      onCreated();
      onOpenChange(false);
      setOrderId(''); setControparte(''); setImporto(''); setSvincoloPrevisto(''); setFideiussione(false);
    } catch (e) {
      toast({ title: 'Errore', description: e instanceof Error ? e.message : 'Riprova.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuova ritenuta di garanzia</DialogTitle>
          <DialogDescription>
            Registra la trattenuta appena compare su un pagamento: la data di svincolo è quella che poi ti ricorda di andare a riprenderla.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Direzione</Label>
            <Select value={direzione} onValueChange={(v) => setDirezione(v as 'attiva' | 'passiva')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attiva">Trattenuta a me (dal committente)</SelectItem>
                <SelectItem value="passiva">La trattengo io (al subappaltatore)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {direzione === 'attiva' && (
            <div className="space-y-1.5">
              <Label>Commessa</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Scegli la commessa" /></SelectTrigger>
                <SelectContent>
                  {commesse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.order_code ?? c.id.slice(0, 8)}{c.description ? ` · ${c.description.slice(0, 40)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{direzione === 'attiva' ? 'Committente' : 'Subappaltatore'}</Label>
            <Input value={controparte} onChange={(e) => setControparte(e.target.value)} placeholder="Nome" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Importo trattenuto (€)</Label>
              <Input inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} placeholder="es. 7.500" />
            </div>
            <div className="space-y-1.5">
              <Label>% applicata</Label>
              <Input inputMode="decimal" value={percentuale} onChange={(e) => setPercentuale(e.target.value)} placeholder="5" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Svincolo previsto</Label>
            <Input type="date" value={svincoloPrevisto} onChange={(e) => setSvincoloPrevisto(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Negozia 6 mesi dalla fine lavori, non 12 o 24.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={fideiussione} onChange={(e) => setFideiussione(e.target.checked)} className="h-4 w-4" />
            Sostituita da polizza fideiussoria (i soldi restano in cassa)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600">
            {saving ? 'Salvataggio…' : 'Registra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
