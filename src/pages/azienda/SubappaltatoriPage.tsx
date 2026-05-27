import { useState, useMemo } from 'react';
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
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
  HardHat, Plus, Search, Euro, AlertTriangle, Phone, ExternalLink, Loader2, Mail, MapPin, Link2, Link2Off, ShieldCheck,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { SubappaltatoreConDashboard, StatoContratto } from '@/types/subappaltatori';
import { OperationalKpiCard } from '@/components/orders/OperationalKpiCard';

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

function isMissingCampoLinkColumn(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return message.includes('campo_subappaltatore_id') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

export default function SubappaltatoriPage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const queryClient = useQueryClient();
  const { isScopriPlan } = useSubscriptionLimits();

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
    piva: '',
    email: '',
    pec: '',
    indirizzo: '',
    durc_scadenza: '',
    ordine_id: '',
    note: '',
  });

  const findOrCreateCampoSubappaltatore = async () => {
    const ragioneSociale = form.ragione_sociale.trim();
    const piva = form.piva.trim();
    const email = form.email.trim() || form.pec.trim();

    let query = (supabase as any)
      .from('subappaltatori')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    if (piva) {
      query = query.eq('piva', piva);
    } else if (email) {
      query = query.or(`email.eq.${email},user_email.eq.${email}`);
    } else {
      query = query.ilike('ragione_sociale', ragioneSociale);
    }

    const { data: existing, error: findError } = await query.maybeSingle();
    if (findError) throw findError;
    if (existing?.id) return existing.id as string;

    const { data: created, error: createError } = await (supabase as any)
      .from('subappaltatori')
      .insert({
        company_id: companyId,
        ragione_sociale: ragioneSociale,
        responsabile: form.responsabile.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        piva: piva || null,
        indirizzo: form.indirizzo.trim() || null,
        user_email: email || null,
        notes: form.note.trim() || null,
        is_active: true,
      })
      .select('id')
      .single();
    if (createError) throw createError;
    return created.id as string;
  };

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
      // 2026-05-27 (UX audit): .limit(50) → 500 — vedi nota in GiornaleLavori
      const { data } = await supabase
        .from('orders')
        .select('id, order_code, description')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);
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
      const term = search.toLowerCase();
      if (search && !s.ragione_sociale.toLowerCase().includes(term) &&
          !(s.tipo_lavori ?? '').toLowerCase().includes(term) &&
          !(s.piva ?? '').toLowerCase().includes(term) &&
          !(s.email ?? '').toLowerCase().includes(term)) return false;
      if (filtroOrdine !== '__all__' && s.order_id !== filtroOrdine) return false;
      if (filtroStato !== '__all__' && s.stato_contratto !== filtroStato) return false;
      return true;
    });
  }, [subappaltatori, search, filtroOrdine, filtroStato]);

  // ── Mutation nuovo subappaltatore ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.ragione_sociale.trim()) throw new Error('Ragione sociale obbligatoria');
      const campoSubappaltatoreId = await findOrCreateCampoSubappaltatore();
      const payload: Record<string, unknown> = {
          company_id: companyId,
          campo_subappaltatore_id: campoSubappaltatoreId,
          order_id: (form.ordine_id && form.ordine_id !== 'none') ? form.ordine_id : null,
          ragione_sociale: form.ragione_sociale.trim(),
          tipo_lavori: form.tipo_lavori.trim() || null,
          responsabile: form.responsabile.trim() || null,
          telefono: form.telefono.trim() || null,
          piva: form.piva.trim() || null,
          email: form.email.trim() || null,
          pec: form.pec.trim() || null,
          indirizzo: form.indirizzo.trim() || null,
          durc_scadenza: form.durc_scadenza || null,
          note: form.note.trim() || null,
      };
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .insert(payload);
      if (error && isMissingCampoLinkColumn(error)) {
        delete payload.campo_subappaltatore_id;
        const { error: retryError } = await (supabase as any)
          .from('subappaltatori_sicurezza')
          .insert(payload);
        if (retryError) throw new Error(retryError.message || retryError.details || retryError.hint || "Errore");
        return;
      }
      if (error) throw new Error(error.message || error.details || error.hint || "Errore");
    },
    onSuccess: () => {
      toast.success('Subappaltatore aggiunto con successo');
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      setDialogOpen(false);
      setForm({
        ragione_sociale: '',
        tipo_lavori: '',
        responsabile: '',
        telefono: '',
        piva: '',
        email: '',
        pec: '',
        indirizzo: '',
        durc_scadenza: '',
        ordine_id: '',
        note: '',
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <HardHat className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Subappaltatori</h1>
              <p className="mt-0.5 text-sm text-slate-500">Gestione contratti, SAL, DURC e ritenute operative.</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="self-start gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuovo Subappaltatore</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OperationalKpiCard icon={HardHat} label="Attivi" value={stats.attivi} hint="contratti operativi" tone="green" />
        <OperationalKpiCard icon={Euro} label="Valore contratti" value={`€${stats.importoContratti.toLocaleString('it-IT')}`} hint="importo complessivo" tone="blue" />
        <OperationalKpiCard icon={ShieldCheck} label="Ritenute in corso" value={`€${stats.ritenuteTotali.toLocaleString('it-IT')}`} hint="da monitorare" tone="amber" />
        <OperationalKpiCard icon={AlertTriangle} label="DURC in scadenza" value={stats.durcScaduti} hint={stats.durcScaduti > 0 ? "richiede controllo" : "documenti ok"} tone={stats.durcScaduti > 0 ? "red" : "green"} />
      </div>

      {/* Filtri */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cerca per ragione sociale, P.IVA, email o tipo lavori..."
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
            const lordo = sub.totale_sal_lordo ?? 0;
            const contratto = sub.importo_contrattuale ?? 0;
            const pct = contratto > 0
              ? Math.min(100, Math.round((lordo / contratto) * 100))
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
                          {sub.campo_subappaltatore_id ? (
                            <Badge variant="outline" className="text-xs border-green-200 bg-green-50 text-green-700">
                              <Link2 className="mr-1 h-3 w-3" />
                              {sub.campo_user_id ? 'Account app cantiere attivo' : 'Anagrafica app cantiere collegata'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">
                              <Link2Off className="mr-1 h-3 w-3" />
                              Account app cantiere da collegare
                            </Badge>
                          )}
                          <DurcBadge scadenza={sub.durc_scadenza} />
                          <StatoBadge stato={sub.stato_contratto} />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                        {sub.responsabile && <span>{sub.responsabile}</span>}
                        {sub.piva && <span>P.IVA {sub.piva}</span>}
                        {(sub as any).telefono && (
                          <a
                            href={`tel:${(sub as any).telefono}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <Phone className="h-3 w-3" />
                            {(sub as any).telefono}
                          </a>
                        )}
                        {sub.email && (
                          <a
                            href={`mailto:${sub.email}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <Mail className="h-3 w-3" />
                            {sub.email}
                          </a>
                        )}
                        {sub.indirizzo && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {sub.indirizzo}
                          </span>
                        )}
                        {(sub.ritenute_in_corso ?? 0) > 0 && (
                          <span className="text-amber-600 font-medium">
                            <Euro className="inline h-3 w-3 mr-0.5" />
                            {(sub.ritenute_in_corso ?? 0).toLocaleString('it-IT')} in garanzia
                          </span>
                        )}
                      </div>

                      {contratto > 0 && (
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
                            <span>€{lordo.toLocaleString('it-IT')} eseguiti</span>
                            <span>€{contratto.toLocaleString('it-IT')} totale</span>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-500" />
              Nuovo Subappaltatore
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
              <Label>Ragione sociale <span className="text-destructive">*</span></Label>
              <Input
                value={form.ragione_sociale}
                onChange={(e) => setForm(f => ({ ...f, ragione_sociale: e.target.value }))}
                placeholder="Es. Rossi Costruzioni S.r.l."
              />
              </div>
              <div className="space-y-1.5">
                <Label>P.IVA / Codice fiscale</Label>
                <Input
                  value={form.piva}
                  onChange={(e) => setForm(f => ({ ...f, piva: e.target.value }))}
                  placeholder="Es. 01234567890"
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="amministrazione@azienda.it"
                />
              </div>
              <div className="space-y-1.5">
                <Label>PEC</Label>
                <Input
                  type="email"
                  value={form.pec}
                  onChange={(e) => setForm(f => ({ ...f, pec: e.target.value }))}
                  placeholder="azienda@pec.it"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Indirizzo sede</Label>
              <Input
                value={form.indirizzo}
                onChange={(e) => setForm(f => ({ ...f, indirizzo: e.target.value }))}
                placeholder="Via, CAP, città, provincia"
              />
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
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Note operative, condizioni, referente amministrativo..."
              />
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
