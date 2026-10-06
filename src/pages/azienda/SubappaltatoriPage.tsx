import { useState, useMemo } from 'react';
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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
  HardHat, Plus, Search, FileText, FileX2, AlertTriangle, Phone, ExternalLink, Loader2, Mail, ShieldCheck, Trash2, CheckCircle2, XCircle, X, Building2,
} from 'lucide-react';
import type { SubappaltatoreConDashboard, StatoContratto } from '@/types/subappaltatori';
import { OperationalKpiCard } from '@/components/orders/OperationalKpiCard';
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from '@/components/mobile/FiltriMobile';
import { DATA_MASSIMA, dataPlausibile } from '@/lib/dataPlausibile';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/usePermissions';
import { useContrattiDitte } from '@/hooks/useContrattiDitte';
import {
  CATEGORIE_SUGGERITE, durcDaGuardare, mancanzeDitta, numeroWhatsApp, richiestaDocumenti, vistaPredefinita, type VistaDitte,
} from '@/lib/subappaltatori/gruppi';
import { DurcPastiglia, VistaCantieri, VistaPerLavoro, VistaPerZona, type InfoDitta } from '@/components/subappaltatori/VisteDitte';
import { cn } from '@/lib/utils';

/** Le viste della pagina (06/10/2026): da telefono solo le due raggruppate. */
const VISTE: Array<{ v: VistaDitte; etichetta: string }> = [
  { v: 'lavoro', etichetta: 'Per lavoro' },
  { v: 'zona', etichetta: 'Per zona' },
  { v: 'cantieri', etichetta: 'Cantieri' },
  { v: 'elenco', etichetta: 'Elenco' },
];
const VISTE_TELEFONO: ReadonlySet<VistaDitte> = new Set(['lavoro', 'zona']);

/** Oggi, «yyyy-MM-dd», nel fuso di chi guarda. */
function oggiLocale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    ? <Badge className="whitespace-nowrap text-xs bg-green-600 text-white">Attivo</Badge>
    : <Badge variant="secondary" className="whitespace-nowrap text-xs">Non attivo</Badge>;
}

function isMissingCampoLinkColumn(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return message.includes('campo_subappaltatore_id') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

/**
 * `incorporata`: dentro Manodopera e Mezzi il titolo lo dà la pagina che la
 * contiene; qui restano la frase e il bottone.
 */
export default function SubappaltatoriPage({ incorporata = false }: { incorporata?: boolean } = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const queryClient = useQueryClient();
  const { isScopriPlan } = useSubscriptionLimits();

  const isMobile = useIsMobile();
  const { canViewCosts } = usePermissions();
  const oggi = oggiLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // Ditte con un contratto attivo: il riquadro «Al lavoro».
  const [soloAlLavoro, setSoloAlLavoro] = useState(false);
  const [filtroDoc, setFiltroDoc] = useState('__all__');
  const [filtroStato, setFiltroStato] = useState('__all__');
  // DURC scaduto, entro 30 giorni o mancante: il riquadro «DURC da controllare».
  const [soloDurcInScadenza, setSoloDurcInScadenza] = useState(false);
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
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

  // ── Fascicolo (documenti) per subappaltatore ─────────────────────────────
  // Anagrafica_id → quanti documenti attivi (subappaltatori_documenti) e di
  // che tipo: serve a dire cosa manca (visura, DVR, POS, polizza RC).
  const { data: fascicoli = {} } = useQuery({
    queryKey: ['sub-fascicoli', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori_documenti')
        .select('subappaltatore_id, tipo')
        .eq('company_id', companyId)
        .neq('status', 'superseded');
      if (error) throw error;
      const m: Record<string, { n: number; tipi: string[] }> = {};
      for (const r of (data ?? []) as Array<{ subappaltatore_id: string | null; tipo: string | null }>) {
        if (!r.subappaltatore_id) continue;
        const f = (m[r.subappaltatore_id] ??= { n: 0, tipi: [] });
        f.n += 1;
        if (r.tipo && !f.tipi.includes(r.tipo)) f.tipi.push(r.tipo);
      }
      return m;
    },
  });
  const fascicoloPer = useMemo(() => new Map(subappaltatori.map((s) => {
    const f = s.campo_subappaltatore_id ? fascicoli[s.campo_subappaltatore_id] : undefined;
    return [s.id, { n: f?.n ?? 0, tipi: new Set(f?.tipi ?? []) }] as const;
  })), [subappaltatori, fascicoli]);
  const docCountFor = (s: SubappaltatoreConDashboard) => fascicoloPer.get(s.id)?.n ?? 0;

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

  // ── Contratti: su quali cantieri lavora ogni ditta ──────────────────────
  const { data: contratti = [] } = useContrattiDitte();
  const { alLavoroIds, cantieriPer } = useMemo(() => {
    const alLavoro = new Set<string>();
    const cantieri = new Map<string, Set<string>>();
    for (const c of contratti) {
      if (c.stato === 'attivo') alLavoro.add(c.schedaId);
      if ((c.stato === 'attivo' || c.stato === 'sospeso') && c.orderId) {
        const set = cantieri.get(c.schedaId) ?? new Set<string>();
        set.add(c.orderId);
        cantieri.set(c.schedaId, set);
      }
    }
    return { alLavoroIds: alLavoro, cantieriPer: cantieri };
  }, [contratti]);
  const nomeAzienda = effectiveCompany?.name ?? 'la nostra impresa';
  const mancanzePer = useMemo(() => new Map(subappaltatori.map((s) => [
    s.id,
    mancanzeDitta(s, fascicoloPer.get(s.id) ?? { n: 0, tipi: new Set<string>() }, cantieriPer.get(s.id)?.size ?? 0, oggi),
  ] as const)), [subappaltatori, fascicoloPer, cantieriPer, oggi]);
  const mancanzeDi = (s: SubappaltatoreConDashboard) => mancanzePer.get(s.id) ?? [];

  const info = (s: SubappaltatoreConDashboard): InfoDitta => {
    const mancanze = mancanzeDi(s);
    const daChiedere = mancanze.filter((m) => m.chiave !== 'piva');
    let richiesta: InfoDitta['richiesta'] = null;
    if (daChiedere.length > 0) {
      const { oggetto, testo } = richiestaDocumenti(s, daChiedere, nomeAzienda);
      const email = s.email?.trim() || s.pec?.trim();
      const wa = numeroWhatsApp(s.telefono);
      if (email) richiesta = { canale: 'email', href: `mailto:${email}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}` };
      else if (wa) richiesta = { canale: 'whatsapp', href: `https://wa.me/${wa}?text=${encodeURIComponent(testo)}` };
    }
    return {
      cantieriInCorso: cantieriPer.get(s.id)?.size ?? 0,
      alLavoro: alLavoroIds.has(s.id),
      documenti: docCountFor(s),
      mancanze,
      richiesta,
    };
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const senzaDocumenti = subappaltatori.filter(s => (mancanzePer.get(s.id) ?? []).some(m => m.chiave !== 'piva')).length;
    const durcScaduti = subappaltatori.filter(s => durcDaGuardare(s.durc_scadenza, oggi)).length;
    const alLavoro = subappaltatori.filter(s => alLavoroIds.has(s.id)).length;
    return { ditte: subappaltatori.length, alLavoro, senzaDocumenti, durcScaduti };
  }, [subappaltatori, mancanzePer, oggi, alLavoroIds]);

  // ── Vista: dall'indirizzo, altrimenti quella che i dati dell'azienda reggono ─
  const visteDisponibili = isMobile ? VISTE.filter(x => VISTE_TELEFONO.has(x.v)) : VISTE;
  const predefinita = useMemo(() => vistaPredefinita(subappaltatori), [subappaltatori]);
  const richiesta = searchParams.get('vista') as VistaDitte | null;
  const vista: VistaDitte = richiesta && visteDisponibili.some(x => x.v === richiesta)
    ? richiesta
    : visteDisponibili.some(x => x.v === predefinita) ? predefinita : 'lavoro';
  const cambiaVista = (v: VistaDitte) => {
    const next = new URLSearchParams(searchParams);
    next.set('vista', v);
    setSearchParams(next, { replace: true });
  };

  // ── Filtro locale ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return subappaltatori.filter(s => {
      const term = search.toLowerCase();
      if (search && !s.ragione_sociale.toLowerCase().includes(term) &&
          !(s.tipo_lavori ?? '').toLowerCase().includes(term) &&
          !(s.piva ?? '').toLowerCase().includes(term) &&
          !(s.email ?? '').toLowerCase().includes(term)) return false;
      if (filtroDoc === '__con__' && (fascicoloPer.get(s.id)?.n ?? 0) === 0) return false;
      if (filtroDoc === '__senza__' && !(mancanzePer.get(s.id) ?? []).some(m => m.chiave !== 'piva')) return false;
      if (filtroStato === '__active__' && !s.campo_is_active) return false;
      if (filtroStato === '__inactive__' && s.campo_is_active) return false;
      if (filtroStato !== '__all__' && filtroStato !== '__active__' && filtroStato !== '__inactive__'
          && s.stato_contratto !== filtroStato) return false;
      if (soloDurcInScadenza && !durcDaGuardare(s.durc_scadenza, oggi)) return false;
      if (soloAlLavoro && !alLavoroIds.has(s.id)) return false;
      return true;
    });
  }, [subappaltatori, search, filtroDoc, filtroStato, soloDurcInScadenza, soloAlLavoro, alLavoroIds, oggi, fascicoloPer, mancanzePer]);
  const nFiltriMobile = [filtroDoc !== '__all__', filtroStato !== '__all__', soloDurcInScadenza].filter(Boolean).length;
  const togliFiltri = () => { setSearch(''); setFiltroDoc('__all__'); setFiltroStato('__all__'); setSoloDurcInScadenza(false); setSoloAlLavoro(false); };

  // ── Mutation nuovo subappaltatore ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.ragione_sociale.trim()) throw new Error('Ragione sociale obbligatoria');
      if (!dataPlausibile(form.durc_scadenza)) throw new Error('Scadenza DURC non valida: controlla l\'anno');
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
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header */}
      {incorporata ? (
        <div className="flex items-center justify-between gap-3">
          {/* Le ditte divise per lavoro, zona o cantiere, come gli operai nelle squadre (06/10/2026) */}
          <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {visteDisponibili.map(({ v, etichetta }) => (
              <button
                key={v}
                type="button"
                aria-pressed={vista === v}
                onClick={() => cambiaVista(v)}
                className={cn(
                  'tap-compact rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-sm:px-2.5',
                  vista === v ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {etichetta}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="ml-auto gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuovo subappaltatore</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        </div>
      ) : (
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
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
            className="self-start gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuovo Subappaltatore</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        </div>
      </div>
      )}

      {/* Mobile: solo i due numeri che chiedono di fare qualcosa, e fanno da filtro. */}
      {!incorporata && (
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {visteDisponibili.map(({ v, etichetta }) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => cambiaVista(v)}
              className={cn('tap-compact rounded-md px-3 py-1.5 text-sm font-medium transition-colors', vista === v ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:text-slate-900')}>
              {etichetta}
            </button>
          ))}
        </div>
      )}
      <KpiMobili
        className="sm:hidden"
        voci={[
          {
            label: 'Fascicolo da completare',
            valore: String(stats.senzaDocumenti),
            tono: stats.senzaDocumenti > 0 ? 'text-amber-600' : undefined,
            onClick: () => setFiltroDoc(filtroDoc === '__senza__' ? '__all__' : '__senza__'),
            attivo: filtroDoc === '__senza__',
          },
          {
            label: 'DURC da controllare',
            valore: String(stats.durcScaduti),
            tono: stats.durcScaduti > 0 ? 'text-red-600' : undefined,
            onClick: () => setSoloDurcInScadenza(v => !v),
            attivo: soloDurcInScadenza,
          },
        ]}
      />

      {/* Stats */}
      {/* I riquadri fanno da filtro, come negli operai: «Attivi» (l'app di cantiere
          accesa) non diceva niente a chi guarda le ditte, e stava quasi sempre a 0. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-sm:hidden">
        <OperationalKpiCard icon={Building2} label="Ditte" value={stats.ditte} hint="in subappalto" tone="blue" isLoading={isLoading}
          active={!soloAlLavoro && !soloDurcInScadenza && filtroDoc === '__all__'} onClick={togliFiltri} />
        <OperationalKpiCard icon={HardHat} label="Al lavoro" value={stats.alLavoro} hint="con un contratto in corso" tone="green" isLoading={isLoading}
          active={soloAlLavoro} onClick={() => setSoloAlLavoro(v => !v)} />
        <OperationalKpiCard icon={AlertTriangle} label="DURC da controllare" value={stats.durcScaduti} hint={stats.durcScaduti > 0 ? "scaduti, in scadenza o mancanti" : "tutti in regola"} tone={stats.durcScaduti > 0 ? "red" : "green"} isLoading={isLoading}
          active={soloDurcInScadenza} onClick={() => setSoloDurcInScadenza(v => !v)} />
        <OperationalKpiCard icon={FileX2} label="Fascicolo da completare" value={stats.senzaDocumenti} hint={stats.senzaDocumenti > 0 ? "manca almeno un documento" : "tutti in regola"} tone={stats.senzaDocumenti > 0 ? "amber" : "green"} isLoading={isLoading}
          active={filtroDoc === '__senza__'} onClick={() => setFiltroDoc(filtroDoc === '__senza__' ? '__all__' : '__senza__')} />
      </div>

      <CercaConFiltri
        className="sm:hidden"
        valore={search}
        onCambia={setSearch}
        filtriAttivi={nFiltriMobile}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Filtri */}
      {/* Filtri sullo sfondo, senza riquadro, come nelle altre liste. */}
      <div className="flex flex-col gap-2 sm:flex-row max-sm:hidden">
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
            <SelectItem value="__senza__">Fascicolo da completare</SelectItem>
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
      {vista === 'elenco' && selected.size > 0 && (
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
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-sm:space-y-2 max-sm:py-8">
            <HardHat className="h-16 w-16 text-muted-foreground/40 max-sm:h-10 max-sm:w-10" />
            <div>
              <p className="font-semibold text-lg max-sm:text-sm">Nessun subappaltatore</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || filtroDoc !== '__all__' || filtroStato !== '__all__' || soloAlLavoro || soloDurcInScadenza
                  ? 'Nessun risultato per i filtri selezionati.'
                  : 'Aggiungi il primo subappaltatore con il pulsante in alto.'}
              </p>
              {(search || filtroDoc !== '__all__' || filtroStato !== '__all__' || soloAlLavoro || soloDurcInScadenza) && (
                <button type="button" className="mt-2 text-sm font-medium text-orange-700 hover:underline" onClick={togliFiltri}>Togli i filtri</button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : vista === 'lavoro' ? (
        <VistaPerLavoro ditte={filtered} info={info} oggi={oggi} />
      ) : vista === 'zona' ? (
        <VistaPerZona ditte={filtered} info={info} oggi={oggi} />
      ) : vista === 'cantieri' ? (
        <VistaCantieri ditte={filtered} contratti={contratti} oggi={oggi} vedeImporti={canViewCosts} />
      ) : (
        <>
        {/* ── Tabella desktop (md+) ─────────────────────────────────────── */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {/* Contatti da 1280 e documenti da 1024, celle più strette sotto i
                  1280: a 768 la tabella era larga 918px e lo stato restava fuori. */}
              <Table className="[&_td]:px-2.5 [&_th]:px-2.5 xl:[&_td]:px-4 xl:[&_th]:px-4">
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
                    {/* P.IVA e sede da 1536px: stanno nel dettaglio, e con i contatti
                        e le pastiglie la tabella non stava nella pagina. */}
                    <TableHead className="hidden 2xl:table-cell">P.IVA / C.F.</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Sede</TableHead>
                    <TableHead className="hidden xl:table-cell">Contatti</TableHead>
                    <TableHead>DURC</TableHead>
                    <TableHead className="hidden lg:table-cell">Documenti</TableHead>
                    <TableHead title="Accesso della ditta all'app di cantiere">App cantiere</TableHead>
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
                      <TableCell className="hidden 2xl:table-cell text-sm">
                        {sub.piva && <div>P.IVA {sub.piva}</div>}
                        {sub.codice_fiscale && (
                          <div className="text-xs text-muted-foreground">C.F. {sub.codice_fiscale}</div>
                        )}
                        {!sub.piva && !sub.codice_fiscale && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {/* Sede */}
                      <TableCell className="hidden 2xl:table-cell max-w-[180px] text-sm">
                        {sub.indirizzo
                          ? <span className="block truncate" title={sub.indirizzo}>{sub.indirizzo}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {/* Contatti */}
                      <TableCell className="hidden xl:table-cell">
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
                      <TableCell><DurcPastiglia scadenza={sub.durc_scadenza} oggi={oggi} /></TableCell>
                      {/* Documenti */}
                      <TableCell className="hidden lg:table-cell">
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
                        {/* Icona: il bottone «Dettaglio» con la scritta, uguale su
                            ogni riga, era la colonna più larga dopo la ditta. */}
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Apri il dettaglio">
                          <Link to={`/azienda/subappaltatori/${sub.id}`} aria-label={`Apri ${sub.ragione_sociale}`}>
                            <ExternalLink className="h-4 w-4" />
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

        </>
      )}

      {/* Dialog nuovo subappaltatore */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-500 max-sm:hidden" />
              Nuovo Subappaltatore
            </DialogTitle>
          </DialogHeader>

          {/* Mobile: i campi per iniziare, a due colonne; codice fiscale, PEC, sede,
              cantiere e note si completano dal dettaglio. */}
          <div className="space-y-4 max-sm:space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-3">
              <div className="space-y-1.5 sm:col-span-2 max-sm:col-span-2">
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
                  placeholder="01234567890"
                />
              </div>
              <div className="space-y-1.5">
              <Label>Tipo lavori</Label>
              {/* I suggerimenti tengono insieme le ditte dello stesso lavoro nella vista «Per lavoro» */}
              <Input
                list="tipi-lavoro-suggeriti"
                value={form.tipo_lavori}
                onChange={(e) => setForm(f => ({ ...f, tipo_lavori: e.target.value }))}
                placeholder="Es. Impianti elettrici"
              />
              <datalist id="tipi-lavoro-suggeriti">
                {CATEGORIE_SUGGERITE.map((c) => <option key={c} value={c} />)}
              </datalist>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="amministrazione@azienda.it"
                />
              </div>
              <div className="space-y-1.5 max-sm:hidden">
                <Label>PEC</Label>
                <Input
                  type="email"
                  value={form.pec}
                  onChange={(e) => setForm(f => ({ ...f, pec: e.target.value }))}
                  placeholder="azienda@pec.it"
                />
              </div>
              <div className="space-y-1.5 sm:hidden">
                <Label>Scadenza DURC</Label>
                <Input
                  type="date"
                  max={DATA_MASSIMA}
                  value={form.durc_scadenza}
                  onChange={(e) => setForm(f => ({ ...f, durc_scadenza: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5 max-sm:hidden">
              <Label>Codice Fiscale</Label>
              <Input
                value={form.codice_fiscale}
                onChange={(e) => setForm(f => ({ ...f, codice_fiscale: e.target.value }))}
                placeholder="Es. RSSMRA80A01H501U (utile per ditte individuali)"
              />
            </div>
            <div className="space-y-1.5 max-sm:hidden">
              <Label>Indirizzo sede</Label>
              <Input
                value={form.indirizzo}
                onChange={(e) => setForm(f => ({ ...f, indirizzo: e.target.value }))}
                placeholder="Via Roma 1, 35100 Padova (PD)"
              />
            </div>
            <div className="space-y-1.5 max-sm:hidden">
              <Label>Scadenza DURC</Label>
              <Input
                type="date"
                max={DATA_MASSIMA}
                value={form.durc_scadenza}
                onChange={(e) => setForm(f => ({ ...f, durc_scadenza: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 max-sm:hidden">
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
            <div className="space-y-1.5 max-sm:hidden">
              <Label>Note</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Note operative, condizioni, referente amministrativo..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
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

      {/* Filtri su telefono: documenti, stato e DURC a pillole. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={nFiltriMobile}
        onAzzera={() => { setFiltroDoc('__all__'); setFiltroStato('__all__'); setSoloDurcInScadenza(false); }}
        risultati={filtered.length}
      >
        <PilloleFiltro
          titolo="Documenti"
          valore={filtroDoc}
          onScegli={setFiltroDoc}
          scelte={[
            { value: '__all__', label: 'Tutti' },
            { value: '__con__', label: 'Con documenti' },
            { value: '__senza__', label: 'Da completare' },
          ]}
        />
        <PilloleFiltro
          titolo="DURC"
          valore={soloDurcInScadenza ? 'scadenza' : 'tutti'}
          onScegli={(v) => setSoloDurcInScadenza(v === 'scadenza')}
          scelte={[
            { value: 'tutti', label: 'Tutti' },
            { value: 'scadenza', label: 'Scaduto o in scadenza' },
          ]}
        />
        <PilloleFiltro
          titolo="Stato"
          valore={filtroStato}
          onScegli={setFiltroStato}
          scelte={[
            { value: '__all__', label: 'Tutti' },
            { value: '__active__', label: 'Attivi' },
            { value: '__inactive__', label: 'Non attivi' },
            { value: 'attivo', label: 'Contratto attivo' },
            { value: 'sospeso', label: 'Sospeso' },
            { value: 'completato', label: 'Completato' },
          ]}
        />
      </PannelloFiltri>

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
