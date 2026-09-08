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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  HardHat, Plus, Search, FileText, FileX2, AlertTriangle, Phone, ExternalLink, Loader2, Mail, MapPin, Link2, Link2Off, ShieldCheck, Trash2, CheckCircle2, XCircle, X,
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

function AttivoBadge({ attivo }: { attivo: boolean | null }) {
  return attivo
    ? <Badge className="text-xs bg-green-600 text-white">Attivo</Badge>
    : <Badge variant="secondary" className="text-xs">Non attivo</Badge>;
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
  const [filtroDoc, setFiltroDoc] = useState('__all__');
  const [filtroStato, setFiltroStato] = useState('__all__');
  const [dialogOpen, setDialogOpen] = useState(false);
  // Selezione multipla (id = id scheda sicurezza, come le righe del view).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confermaEliminaBulk, setConfermaEliminaBulk] = useState(false);

  // Form nuovo subappaltatore
  const [form, setForm] = useState({
    ragione_sociale: '',
    tipo_lavori: '',
    responsabile: '',
    telefono: '',
    piva: '',
    email: '',
    pec: '',
    codice_fiscale: '',
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
        .eq('company_id', companyId)
        .limit(500); // cap di sicurezza: evita di scaricare l'intera vista
      if (error) throw error;
      return (data ?? []) as SubappaltatoreConDashboard[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  // ── Conteggio documenti (fascicolo) per subappaltatore ─────────────────────
  // Mappa anagrafica_id → n. documenti attivi (subappaltatori_documenti). Serve
  // a mostrare/filtrare chi ha i documenti collegati e chi no.
  const { data: docCountMap = {} } = useQuery({
    queryKey: ['sub-doc-counts', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori_documenti')
        .select('subappaltatore_id')
        .eq('company_id', companyId)
        .neq('status', 'superseded');
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ subappaltatore_id: string | null }>) {
        if (r.subappaltatore_id) m[r.subappaltatore_id] = (m[r.subappaltatore_id] ?? 0) + 1;
      }
      return m;
    },
  });
  const docCountFor = (s: SubappaltatoreConDashboard) =>
    s.campo_subappaltatore_id ? (docCountMap[s.campo_subappaltatore_id] ?? 0) : 0;

  // Ordini per il selettore "Cantiere / Ordine" nel dialog di creazione.
  const { data: ordini = [] } = useQuery({
    queryKey: ['ordini-select', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, description')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const attivi = subappaltatori.filter(s => s.campo_is_active).length;
    const conDocumenti = subappaltatori.filter(s =>
      s.campo_subappaltatore_id ? (docCountMap[s.campo_subappaltatore_id] ?? 0) > 0 : false,
    ).length;
    const senzaDocumenti = subappaltatori.length - conDocumenti;
    const durcScaduti = subappaltatori.filter(s => {
      if (!s.durc_scadenza) return false;
      return differenceInDays(parseISO(s.durc_scadenza), new Date()) <= 30;
    }).length;
    return { attivi, conDocumenti, senzaDocumenti, durcScaduti };
  }, [subappaltatori, docCountMap]);

  // ── Filtro locale ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return subappaltatori.filter(s => {
      const term = search.toLowerCase();
      if (search && !s.ragione_sociale.toLowerCase().includes(term) &&
          !(s.tipo_lavori ?? '').toLowerCase().includes(term) &&
          !(s.piva ?? '').toLowerCase().includes(term) &&
          !(s.email ?? '').toLowerCase().includes(term)) return false;
      if (filtroDoc === '__con__' && docCountFor(s) === 0) return false;
      if (filtroDoc === '__senza__' && docCountFor(s) > 0) return false;
      if (filtroStato === '__active__' && !s.campo_is_active) return false;
      if (filtroStato === '__inactive__' && s.campo_is_active) return false;
      if (filtroStato !== '__all__' && filtroStato !== '__active__' && filtroStato !== '__inactive__'
          && s.stato_contratto !== filtroStato) return false;
      return true;
    });
  }, [subappaltatori, search, filtroDoc, filtroStato, docCountMap]);

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
          codice_fiscale: form.codice_fiscale.trim() || null,
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
        codice_fiscale: '',
        indirizzo: '',
        durc_scadenza: '',
        ordine_id: '',
        note: '',
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Mutation toggle Attivo/Inattivo (anagrafica app cantiere) ─────────────
  const toggleAttivoMutation = useMutation({
    mutationFn: async ({ subappaltatoreId, attivo }: { subappaltatoreId: string; attivo: boolean }) => {
      const { error } = await (supabase as any)
        .from('subappaltatori')
        .update({ is_active: attivo })
        .eq('id', subappaltatoreId);
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.attivo ? 'Subappaltatore attivato' : 'Subappaltatore disattivato');
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Selezione multipla + azioni in blocco ────────────────────────────────
  const visibleIds = filtered.map(s => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const toggleOne = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAllVisible = () => setSelected(prev => {
    const n = new Set(prev);
    if (allVisibleSelected) visibleIds.forEach(id => n.delete(id));
    else visibleIds.forEach(id => n.add(id));
    return n;
  });
  const clearSelezione = () => setSelected(new Set());
  // id scheda selezionati → id anagrafica (campo) per le azioni su `subappaltatori`.
  const campoIdsForSelected = () => subappaltatori
    .filter(s => selected.has(s.id) && s.campo_subappaltatore_id)
    .map(s => s.campo_subappaltatore_id as string);

  const bulkAttivoMutation = useMutation({
    mutationFn: async (attivo: boolean) => {
      const campoIds = campoIdsForSelected();
      if (campoIds.length === 0) return 0;
      const { error } = await (supabase as any)
        .from('subappaltatori').update({ is_active: attivo }).in('id', campoIds);
      if (error) throw new Error(error.message || 'Errore');
      return campoIds.length;
    },
    onSuccess: (n, attivo) => {
      toast.success(`${n} ${n === 1 ? 'subappaltatore' : 'subappaltatori'} ${attivo ? 'attivati' : 'disattivati'}`);
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      clearSelezione();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    // Elimina la SCHEDA (subappaltatori_sicurezza). L'anagrafica non viene
    // toccata, ma contratti_subappalto e documenti_subappaltatore sono ON
    // DELETE CASCADE: il commento di prima ("no cascade") era falso, e 26
    // contratti sarebbero spariti in silenzio. I contratti bloccano; i
    // documenti della scheda vengono eliminati con lei, e il dialog lo dice.
    mutationFn: async () => {
      const schedaIds = Array.from(selected);
      if (schedaIds.length === 0) return 0;
      const { count: contratti, error: errContratti } = await (supabase as any)
        .from('contratti_subappalto').select('id', { count: 'exact', head: true }).in('subappaltatore_id', schedaIds);
      if (errContratti) throw new Error(errContratti.message || 'Errore');
      const nContratti = (contratti as number | null) ?? 0;
      if (nContratti > 0) {
        throw new Error(
          `${nContratti === 1 ? 'C\'è 1 contratto di subappalto collegato' : `Ci sono ${nContratti} contratti di subappalto collegati`}: eliminarlo cancellerebbe anche i contratti. Chiudili o eliminali prima.`
        );
      }
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza').delete().in('id', schedaIds);
      if (error) throw new Error(error.message || 'Errore');
      return schedaIds.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? 'subappaltatore rimosso' : 'subappaltatori rimossi'} dalla lista`);
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      clearSelezione();
      setConfermaEliminaBulk(false);
    },
    onError: (err: Error) => { toast.error(err.message); setConfermaEliminaBulk(false); },
  });

  // Toggle riutilizzabile (tabella desktop + card mobile).
  function AttivoToggle({ sub }: { sub: SubappaltatoreConDashboard }) {
    const linkId = sub.campo_subappaltatore_id;
    const pending = toggleAttivoMutation.isPending
      && toggleAttivoMutation.variables?.subappaltatoreId === linkId;
    const sw = (
      <Switch
        checked={!!sub.campo_is_active}
        disabled={!linkId || pending}
        onCheckedChange={(v) => {
          if (!linkId) return;
          toggleAttivoMutation.mutate({ subappaltatoreId: linkId, attivo: v });
        }}
        aria-label={sub.campo_is_active ? 'Disattiva subappaltatore' : 'Attiva subappaltatore'}
      />
    );
    if (linkId) return sw;
    // Anagrafica non collegata: switch disabilitato + spiegazione.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper: un elemento disabled non emette eventi hover */}
          <span className="inline-flex cursor-not-allowed">{sw}</span>
        </TooltipTrigger>
        <TooltipContent>Collega prima l'anagrafica</TooltipContent>
      </Tooltip>
    );
  }

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
        <OperationalKpiCard icon={HardHat} label="Attivi" value={stats.attivi} hint="collaboratori attivi" tone="green" />
        <OperationalKpiCard icon={FileText} label="Con documenti" value={stats.conDocumenti} hint="fascicolo presente" tone="blue" />
        <OperationalKpiCard icon={FileX2} label="Senza documenti" value={stats.senzaDocumenti} hint={stats.senzaDocumenti > 0 ? "da completare" : "tutti ok"} tone={stats.senzaDocumenti > 0 ? "amber" : "green"} />
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
        <Select value={filtroDoc} onValueChange={setFiltroDoc}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Documenti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti i documenti</SelectItem>
            <SelectItem value="__con__">Con documenti</SelectItem>
            <SelectItem value="__senza__">Senza documenti</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti gli stati</SelectItem>
            <SelectItem value="__active__">Solo attivi</SelectItem>
            <SelectItem value="__inactive__">Solo non attivi</SelectItem>
            <SelectItem value="bozza">Bozza</SelectItem>
            <SelectItem value="attivo">Contratto attivo</SelectItem>
            <SelectItem value="completato">Completato</SelectItem>
            <SelectItem value="risolto">Risolto</SelectItem>
            <SelectItem value="sospeso">Sospeso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Barra azioni in blocco */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2">
          <span className="text-sm font-semibold text-orange-800">{selected.size} selezionati</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => bulkAttivoMutation.mutate(true)} disabled={bulkAttivoMutation.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />Attiva
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkAttivoMutation.mutate(false)} disabled={bulkAttivoMutation.isPending}>
            <XCircle className="h-4 w-4 mr-1.5" />Disattiva
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setConfermaEliminaBulk(true)} disabled={bulkDeleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1.5" />Elimina
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelezione}>
            <X className="h-4 w-4 mr-1.5" />Deseleziona
          </Button>
        </div>
      )}

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
                {search || filtroDoc !== '__all__' || filtroStato !== '__all__'
                  ? 'Nessun risultato per i filtri selezionati.'
                  : 'Aggiungi il primo subappaltatore con il pulsante in alto.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* ── Tabella desktop (md+) ─────────────────────────────────────── */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleAllVisible}
                        aria-label="Seleziona tutti"
                      />
                    </TableHead>
                    <TableHead>Ditta</TableHead>
                    <TableHead>P.IVA / C.F.</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead>Contatti</TableHead>
                    <TableHead>DURC</TableHead>
                    <TableHead>Documenti</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sub) => (
                    <TableRow key={sub.id} className="align-top" data-state={selected.has(sub.id) ? 'selected' : undefined}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={selected.has(sub.id)}
                          onCheckedChange={() => toggleOne(sub.id)}
                          aria-label={`Seleziona ${sub.ragione_sociale}`}
                        />
                      </TableCell>
                      {/* Ditta */}
                      <TableCell className="max-w-[220px]">
                        <p className="font-semibold leading-tight truncate">{sub.ragione_sociale}</p>
                        {sub.responsabile && (
                          <p className="text-xs text-muted-foreground truncate">{sub.responsabile}</p>
                        )}
                        {sub.tipo_lavori && (
                          <p className="text-xs text-muted-foreground truncate">{sub.tipo_lavori}</p>
                        )}
                      </TableCell>
                      {/* P.IVA / C.F. */}
                      <TableCell className="text-sm">
                        {sub.piva && <div>P.IVA {sub.piva}</div>}
                        {sub.codice_fiscale && (
                          <div className="text-xs text-muted-foreground">C.F. {sub.codice_fiscale}</div>
                        )}
                        {!sub.piva && !sub.codice_fiscale && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {/* Sede */}
                      <TableCell className="max-w-[180px] text-sm">
                        {sub.indirizzo
                          ? <span className="block truncate" title={sub.indirizzo}>{sub.indirizzo}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {/* Contatti */}
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {(sub as any).telefono && (
                            <a href={`tel:${(sub as any).telefono}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{(sub as any).telefono}</span>
                            </a>
                          )}
                          {sub.email && (
                            <a href={`mailto:${sub.email}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[160px]">{sub.email}</span>
                            </a>
                          )}
                          {sub.pec && (
                            <a href={`mailto:${sub.pec}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                              <ShieldCheck className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[160px]">{sub.pec}</span>
                            </a>
                          )}
                          {!(sub as any).telefono && !sub.email && !sub.pec && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      {/* DURC */}
                      <TableCell><DurcBadge scadenza={sub.durc_scadenza} /></TableCell>
                      {/* Documenti */}
                      <TableCell>
                        {docCountFor(sub) > 0 ? (
                          <Badge className="text-xs bg-green-600 text-white">
                            <FileText className="h-3 w-3 mr-1" />{docCountFor(sub)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-200">
                            <FileX2 className="h-3 w-3 mr-1" />Nessuno
                          </Badge>
                        )}
                      </TableCell>
                      {/* Stato */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AttivoToggle sub={sub} />
                          <AttivoBadge attivo={sub.campo_is_active} />
                        </div>
                      </TableCell>
                      {/* Azioni */}
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/azienda/subappaltatori/${sub.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Dettaglio
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Card mobile (< md) ────────────────────────────────────────── */}
        <div className="space-y-3 md:hidden">
          {filtered.map((sub) => {
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
                          {docCountFor(sub) > 0 ? (
                            <Badge className="text-xs bg-green-600 text-white">
                              <FileText className="h-3 w-3 mr-1" />{docCountFor(sub)} doc
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-amber-700 border-amber-200">
                              <FileX2 className="h-3 w-3 mr-1" />No doc
                            </Badge>
                          )}
                          <StatoBadge stato={sub.stato_contratto} />
                          <AttivoBadge attivo={sub.campo_is_active} />
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
                      </div>


                      <div className="mt-3 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <AttivoToggle sub={sub} />
                          {sub.campo_is_active ? 'Attivo' : 'Non attivo'}
                        </label>
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
        </>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <Label>Codice Fiscale</Label>
              <Input
                value={form.codice_fiscale}
                onChange={(e) => setForm(f => ({ ...f, codice_fiscale: e.target.value }))}
                placeholder="Es. RSSMRA80A01H501U (utile per ditte individuali)"
              />
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

      {/* Conferma eliminazione in blocco */}
      <Dialog open={confermaEliminaBulk} onOpenChange={setConfermaEliminaBulk}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare {selected.size} subappaltatori?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Verranno rimossi dalla lista subappaltatori. L'anagrafica resta salvata;
            i documenti caricati sulla scheda vengono eliminati con lei. Se ci sono
            contratti di subappalto collegati la cancellazione si ferma.
            L'azione non è annullabile.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfermaEliminaBulk(false)}>Annulla</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate()}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1.5" />Elimina</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
