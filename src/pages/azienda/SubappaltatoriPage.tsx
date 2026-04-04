import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  HardHat, Plus, Search, Euro, AlertTriangle, Phone, ExternalLink, Loader2,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { SubappaltatoreConDashboard, StatoContratto } from '@/types/subappaltatori';

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  if (!scadenza) return <Badge variant="outline" className="text-xs">DURC mancante</Badge>;
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="text-xs bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="text-xs bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="text-xs bg-green-600 text-white">DURC OK</Badge>;
}

function StatoBadge({ stato }: { stato: StatoContratto | null }) {
  const map: Record<string, { label: string; className: string }> = {
    bozza:      { label: 'Bozza',      className: 'bg-slate-400 text-white' },
    attivo:     { label: 'Attivo',     className: 'bg-blue-600 text-white' },
    completato: { label: 'Completato', className: 'bg-green-600 text-white' },
    risolto:    { label: 'Risolto',    className: 'bg-purple-600 text-white' },
    sospeso:    { label: 'Sospeso',    className: 'bg-amber-500 text-white' },
  };
  if (!stato) return null;
  const cfg = map[stato] ?? { label: stato, className: 'bg-slate-400 text-white' };
  return <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

export default function SubappaltatoriPage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filtroOrdine, setFiltroOrdine] = useState('__all__');
  const [filtroStato, setFiltroStato] = useState('__all__');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form nuovo subappaltatore
  const [form, setForm] = useState({
    ragione_sociale: '',
    tipo_lavori: '',
    responsabile: '',
    telefono: '',
    durc_scadenza: '',
    ordine_id: '',
  });

  // ── Fetch view dashboard ──────────────────────────────────────────────────
  const { data: subappaltatori = [], isLoading } = useQuery({
    queryKey: ['subappaltatori-page', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_subappaltatori_dashboard')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data ?? []) as SubappaltatoreConDashboard[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  // ── Fetch ordini per filtro ───────────────────────────────────────────────
  const { data: ordini = [] } = useQuery({
    queryKey: ['ordini-select', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_code, description')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const attivi = subappaltatori.filter(s => s.stato_contratto === 'attivo').length;
    const importoContratti = subappaltatori.reduce((a, s) => a + (s.importo_contrattuale ?? 0), 0);
    const ritenuteTotali = subappaltatori.reduce((a, s) => a + (s.ritenute_in_corso ?? 0), 0);
    const durcScaduti = subappaltatori.filter(s => {
      if (!s.durc_scadenza) return false;
      return differenceInDays(parseISO(s.durc_scadenza), new Date()) <= 30;
    }).length;
    return { attivi, importoContratti, ritenuteTotali, durcScaduti };
  }, [subappaltatori]);

  // ── Filtro locale ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return subappaltatori.filter(s => {
      if (search && !s.ragione_sociale.toLowerCase().includes(search.toLowerCase()) &&
          !(s.tipo_lavori ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      if (filtroOrdine !== '__all__' && s.order_id !== filtroOrdine) return false;
      if (filtroStato !== '__all__' && s.stato_contratto !== filtroStato) return false;
      return true;
    });
  }, [subappaltatori, search, filtroOrdine, filtroStato]);

  // ── Mutation nuovo subappaltatore ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.ragione_sociale.trim()) throw new Error('Ragione sociale obbligatoria');
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .insert({
          company_id: companyId,
          order_id: (form.ordine_id && form.ordine_id !== 'none') ? form.ordine_id : null,
          ragione_sociale: form.ragione_sociale.trim(),
          tipo_lavori: form.tipo_lavori.trim() || null,
          responsabile: form.responsabile.trim() || null,
          telefono: form.telefono.trim() || null,
          durc_scadenza: form.durc_scadenza || null,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Subappaltatore aggiunto con successo');
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      setDialogOpen(false);
      setForm({ ragione_sociale: '', tipo_lavori: '', responsabile: '', telefono: '', durc_scadenza: '', ordine_id: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardHat className="h-6 w-6 sm:h-7 sm:w-7 text-orange-500 shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Subappaltatori</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Gestione contratti, SAL e ritenute</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Nuovo Subappaltatore</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Attivi</p>
            <p className="text-2xl font-bold">{stats.attivi}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valore contratti</p>
            <p className="text-lg font-bold">€{stats.importoContratti.toLocaleString('it-IT')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ritenute in corso</p>
            <p className="text-lg font-bold text-amber-600">€{stats.ritenuteTotali.toLocaleString('it-IT')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            {stats.durcScaduti > 0 && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
            <div>
              <p className="text-xs text-muted-foreground">DURC in scadenza</p>
              <p className={`text-2xl font-bold ${stats.durcScaduti > 0 ? 'text-red-600' : ''}`}>
                {stats.durcScaduti}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cerca per ragione sociale o tipo lavori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filtroOrdine} onValueChange={setFiltroOrdine}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Tutti i cantieri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti i cantieri</SelectItem>
            {ordini.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>
                {o.order_code ? `#${o.order_code}` : o.description?.substring(0, 30)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti gli stati</SelectItem>
            <SelectItem value="bozza">Bozza</SelectItem>
            <SelectItem value="attivo">Attivo</SelectItem>
            <SelectItem value="completato">Completato</SelectItem>
            <SelectItem value="risolto">Risolto</SelectItem>
            <SelectItem value="sospeso">Sospeso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <HardHat className="h-16 w-16 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">Nessun subappaltatore</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || filtroOrdine !== '__all__' || filtroStato !== '__all__'
                  ? 'Nessun risultato per i filtri selezionati.'
                  : 'Aggiungi il primo subappaltatore con il pulsante in alto.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const pct = sub.importo_contrattuale > 0
              ? Math.min(100, Math.round((sub.totale_sal_lordo / sub.importo_contrattuale) * 100))
              : 0;
            return (
              <Card key={sub.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <HardHat className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold">{sub.ragione_sociale}</p>
                          {sub.tipo_lavori && (
                            <p className="text-sm text-muted-foreground">{sub.tipo_lavori}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <DurcBadge scadenza={sub.durc_scadenza} />
                          <StatoBadge stato={sub.stato_contratto} />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        {sub.responsabile && <span>{sub.responsabile}</span>}
                        {(sub as any).telefono && (
                          <a
                            href={`tel:${(sub as any).telefono}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <Phone className="h-3 w-3" />
                            {(sub as any).telefono}
                          </a>
                        )}
                        {sub.ritenute_in_corso > 0 && (
                          <span className="text-amber-600 font-medium">
                            <Euro className="inline h-3 w-3 mr-0.5" />
                            {sub.ritenute_in_corso.toLocaleString('it-IT')} in garanzia
                          </span>
                        )}
                      </div>

                      {sub.importo_contrattuale > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Contratto eseguito</span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>€{sub.totale_sal_lordo.toLocaleString('it-IT')} eseguiti</span>
                            <span>€{sub.importo_contrattuale.toLocaleString('it-IT')} totale</span>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex justify-end">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/azienda/subappaltatori/${sub.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Dettaglio
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog nuovo subappaltatore */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-500" />
              Nuovo Subappaltatore
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ragione sociale *</Label>
              <Input
                value={form.ragione_sociale}
                onChange={(e) => setForm(f => ({ ...f, ragione_sociale: e.target.value }))}
                placeholder="Es. Rossi Costruzioni S.r.l."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo lavori</Label>
              <Input
                value={form.tipo_lavori}
                onChange={(e) => setForm(f => ({ ...f, tipo_lavori: e.target.value }))}
                placeholder="Es. Impianto elettrico, muratura..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsabile</Label>
                <Input
                  value={form.responsabile}
                  onChange={(e) => setForm(f => ({ ...f, responsabile: e.target.value }))}
                  placeholder="Nome cognome"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+39 ..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza DURC</Label>
              <Input
                type="date"
                value={form.durc_scadenza}
                onChange={(e) => setForm(f => ({ ...f, durc_scadenza: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cantiere / Ordine</Label>
              <Select
                value={form.ordine_id || 'none'}
                onValueChange={(v) => setForm(f => ({ ...f, ordine_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Nessun ordine" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun ordine</SelectItem>
                  {ordini.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `#${o.order_code} — ` : ''}{o.description?.substring(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
              Annulla
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.ragione_sociale.trim()}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
