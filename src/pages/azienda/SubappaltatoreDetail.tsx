import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Alert, AlertDescription,
} from '@/components/ui/alert';
import {
  ArrowLeft, HardHat, FileText, Euro, Loader2, Plus, AlertTriangle, CheckCircle2, ExternalLink, Check,
} from 'lucide-react';
import type {
  ContrattoSubappalto, SALSubappaltatore, RitenutaGaranzia,
  DocumentoSubappaltatore, StatoSALSub, TipoDocumentoSub,
} from '@/types/subappaltatori';

// ── Badge helpers ────────────────────────────────────────────────────────────

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  if (!scadenza) return <Badge variant="outline">DURC mancante</Badge>;
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="bg-green-600 text-white">DURC OK</Badge>;
}

function SALStatoBadge({ stato }: { stato: StatoSALSub }) {
  const map: Record<StatoSALSub, { label: string; className: string }> = {
    ricevuto:   { label: 'Ricevuto',   className: 'bg-blue-500 text-white' },
    verificato: { label: 'Verificato', className: 'bg-amber-500 text-white' },
    pagato:     { label: 'Pagato',     className: 'bg-green-600 text-white' },
    contestato: { label: 'Contestato', className: 'bg-red-600 text-white' },
  };
  const cfg = map[stato];
  return <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

const TIPO_DOC_LABELS: Record<TipoDocumentoSub, string> = {
  durc:                 'DURC',
  visura_camerale:      'Visura Camerale',
  attestazione_soa:     'Attestazione SOA',
  dvr:                  'DVR',
  polizza_rc:           'Polizza RC',
  iso_certificazione:   'Certificazione ISO',
  altro:                'Altro',
};

// ═══════════════════════════════════════════════════════════════════════════════

export default function SubappaltatoreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const queryClient = useQueryClient();

  // ── Fetch subappaltatore ─────────────────────────────────────────────────
  const { data: sub, isLoading: loadingSub } = useQuery({
    queryKey: ['subappaltatore', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  // ── Fetch contratto ──────────────────────────────────────────────────────
  const { data: contratto } = useQuery({
    queryKey: ['contratto-sub', id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('contratti_subappalto')
        .select('*')
        .eq('subappaltatore_id', id!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as ContrattoSubappalto | null;
    },
    enabled: !!id,
  });

  // ── Fetch SAL ────────────────────────────────────────────────────────────
  const { data: salList = [] } = useQuery({
    queryKey: ['sal-sub', contratto?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sal_subappaltatori')
        .select('*')
        .eq('contratto_id', contratto!.id)
        .order('numero_sal');
      if (error) throw error;
      return (data ?? []) as SALSubappaltatore[];
    },
    enabled: !!contratto?.id,
  });

  // ── Fetch ritenute ───────────────────────────────────────────────────────
  const { data: ritenute = [] } = useQuery({
    queryKey: ['ritenute-sub', contratto?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ritenute_garanzia')
        .select('*')
        .eq('contratto_id', contratto!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RitenutaGaranzia[];
    },
    enabled: !!contratto?.id,
  });

  // ── Fetch documenti ──────────────────────────────────────────────────────
  const { data: documenti = [] } = useQuery({
    queryKey: ['documenti-sub', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('documenti_subappaltatore')
        .select('*')
        .eq('subappaltatore_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentoSubappaltatore[];
    },
    enabled: !!id,
  });

  // ═══════════════════════════ MUTATIONS ═══════════════════════════════════

  // ── Crea contratto ───────────────────────────────────────────────────────
  const [contrattoDialog, setContrattoDialog] = useState(false);
  const [contrattoForm, setContrattoForm] = useState({
    descrizione_lavori: '',
    importo_contrattuale: '',
    ritenuta_garanzia_pct: '5',
    data_inizio: '',
    data_fine_prevista: '',
    numero_contratto: '',
    note: '',
  });

  const saveContrattoMutation = useMutation({
    mutationFn: async () => {
      if (!contrattoForm.descrizione_lavori.trim()) throw new Error('Descrizione lavori obbligatoria');
      if (!sub?.order_id) throw new Error('Il subappaltatore deve essere associato a un ordine');
      const payload = {
        company_id: companyId,
        subappaltatore_id: id!,
        order_id: sub.order_id,
        numero_contratto: contrattoForm.numero_contratto.trim() || null,
        descrizione_lavori: contrattoForm.descrizione_lavori.trim(),
        importo_contrattuale: parseFloat(contrattoForm.importo_contrattuale) || 0,
        ritenuta_garanzia_pct: parseFloat(contrattoForm.ritenuta_garanzia_pct) || 5,
        data_inizio: contrattoForm.data_inizio || null,
        data_fine_prevista: contrattoForm.data_fine_prevista || null,
        note: contrattoForm.note.trim() || null,
      };
      if (contratto?.id) {
        const { error } = await (supabase as any)
          .from('contratti_subappalto')
          .update(payload)
          .eq('id', contratto.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await (supabase as any)
          .from('contratti_subappalto')
          .insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(contratto ? 'Contratto aggiornato' : 'Contratto creato');
      queryClient.invalidateQueries({ queryKey: ['contratto-sub', id] });
      setContrattoDialog(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Nuovo SAL ────────────────────────────────────────────────────────────
  const [salDialog, setSalDialog] = useState(false);
  const [salForm, setSalForm] = useState({
    numero_sal: '',
    data_emissione: format(new Date(), 'yyyy-MM-dd'),
    importo_lordo: '',
    ritenuta_pct: contratto?.ritenuta_garanzia_pct != null ? contratto.ritenuta_garanzia_pct.toString() : '5',
    note: '',
    stato: 'ricevuto' as StatoSALSub,
  });

  const saveSalMutation = useMutation({
    mutationFn: async () => {
      if (!contratto?.id) throw new Error('Contratto non trovato');
      const importoLordo = parseFloat(salForm.importo_lordo) || 0;
      const ritenutaPct = parseFloat(salForm.ritenuta_pct) || 5;
      const importoRitenuta = Math.round(importoLordo * ritenutaPct) / 100;

      const { data: salData, error: salError } = await (supabase as any)
        .from('sal_subappaltatori')
        .insert({
          company_id: companyId,
          contratto_id: contratto.id,
          subappaltatore_id: id!,
          order_id: sub?.order_id,
          numero_sal: parseInt(salForm.numero_sal) || (salList.length + 1),
          data_emissione: salForm.data_emissione,
          importo_lordo: importoLordo,
          ritenuta_pct: ritenutaPct,
          stato: salForm.stato,
          note: salForm.note.trim() || null,
        })
        .select('id')
        .single();
      if (salError) throw new Error(salError.message);

      // Auto-create ritenuta record if ritenuta > 0
      if (importoRitenuta > 0 && salData?.id) {
        const { error: ritError } = await (supabase as any)
          .from('ritenute_garanzia')
          .insert({
            company_id: companyId,
            contratto_id: contratto.id,
            sal_id: salData.id,
            importo: importoRitenuta,
            stato: 'trattenuta',
          });
        if (ritError) throw new Error(ritError.message);
      }
    },
    onSuccess: () => {
      toast.success('SAL aggiunto');
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: ['ritenute-sub', contratto?.id] });
      setSalDialog(false);
      setSalForm({ numero_sal: '', data_emissione: format(new Date(), 'yyyy-MM-dd'), importo_lordo: '', ritenuta_pct: contratto?.ritenuta_garanzia_pct?.toString() ?? '5', note: '', stato: 'ricevuto' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Svincola ritenuta ─────────────────────────────────────────────────────
  const svincolaMutation = useMutation({
    mutationFn: async (ritenutaId: string) => {
      const { error } = await (supabase as any)
        .from('ritenute_garanzia')
        .update({ stato: 'svincolata', data_svincolo_effettiva: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', ritenutaId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Ritenuta svincolata');
      queryClient.invalidateQueries({ queryKey: ['ritenute-sub', contratto?.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Approva / Contesta SAL ───────────────────────────────────────────────
  const [contestaNote, setContestaNote] = useState("");
  const [contestaSALId, setContestaId] = useState<string | null>(null);

  const approvaSALMutation = useMutation({
    mutationFn: async (salId: string) => {
      const { error } = await supabase
        .from("sal_subappaltatori")
        .update({ stato: "verificato" })
        .eq("id", salId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SAL approvato");
      queryClient.invalidateQueries({ queryKey: ["subappaltatore-detail"] });
    },
    onError: () => toast.error("Errore durante l'approvazione"),
  });

  const contestaSALMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from("sal_subappaltatori")
        .update({ stato: "contestato", note: note })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SAL contestato");
      setContestaId(null);
      setContestaNote("");
      queryClient.invalidateQueries({ queryKey: ["subappaltatore-detail"] });
    },
    onError: () => toast.error("Errore durante la contestazione"),
  });

  // ─────────────────────────────────────────────────────────────────────────

  if (loadingSub) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Subappaltatore non trovato</p>
        <Button variant="link" onClick={() => navigate('/azienda/subappaltatori')}>Torna alla lista</Button>
      </div>
    );
  }

  const totaleLordo = salList.reduce((a, s) => a + s.importo_lordo, 0);
  const totaleRitenute = salList.reduce((a, s) => a + s.ritenuta_importo, 0);
  const totaleNetto = salList.reduce((a, s) => a + s.importo_netto, 0);
  const ritenuteTrattenute = ritenute.filter(r => r.stato === 'trattenuta');
  const pct = contratto && contratto.importo_contrattuale > 0
    ? Math.min(100, Math.round((totaleLordo / contratto.importo_contrattuale) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/azienda/subappaltatori')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{sub.ragione_sociale}</h1>
          <p className="text-sm text-muted-foreground">{sub.tipo_lavori ?? 'Subappaltatore'}</p>
        </div>
        <DurcBadge scadenza={sub.durc_scadenza} />
      </div>

      <Tabs defaultValue="anagrafica">
        <TabsList className="w-full grid grid-cols-4 h-auto">
          <TabsTrigger value="anagrafica" className="text-xs py-2">
            <span className="hidden sm:inline">Anagrafica</span>
            <span className="sm:hidden">Dati</span>
          </TabsTrigger>
          <TabsTrigger value="contratto" className="text-xs py-2">Contratto</TabsTrigger>
          <TabsTrigger value="sal" className="text-xs py-2">SAL</TabsTrigger>
          <TabsTrigger value="ritenute" className="text-xs py-2">
            <span className="hidden sm:inline">Ritenute</span>
            <span className="sm:hidden">Rit.</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Anagrafica ─────────────────────────────────────────────── */}
        <TabsContent value="anagrafica" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <HardHat className="h-4 w-4" /> Dati anagrafici
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Ragione sociale', value: sub.ragione_sociale },
                { label: 'Responsabile', value: sub.responsabile },
                { label: 'Telefono', value: sub.telefono },
                { label: 'Tipo lavori', value: sub.tipo_lavori },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex gap-3">
                  <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
                  <span className="text-sm font-medium">{value}</span>
                </div>
              ) : null)}
              <div className="flex gap-3">
                <span className="text-sm text-muted-foreground w-32 shrink-0">Scadenza DURC</span>
                <DurcBadge scadenza={sub.durc_scadenza} />
              </div>
            </CardContent>
          </Card>

          {/* Documenti */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documenti idoneità
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documenti.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun documento caricato.</p>
              ) : (
                <div className="space-y-2">
                  {documenti.map((doc) => {
                    const daysLeft = doc.data_scadenza
                      ? differenceInDays(parseISO(doc.data_scadenza), new Date())
                      : null;
                    return (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium">
                            {TIPO_DOC_LABELS[doc.tipo]}
                            {doc.nome_file && <span className="text-muted-foreground ml-1">— {doc.nome_file}</span>}
                          </p>
                          {doc.data_scadenza && (
                            <p className={`text-xs mt-0.5 ${daysLeft !== null && daysLeft <= 30 ? 'text-red-600' : 'text-muted-foreground'}`}>
                              Scade: {format(parseISO(doc.data_scadenza), 'dd/MM/yyyy')}
                              {daysLeft !== null && daysLeft <= 30 && ` (${daysLeft}gg)`}
                            </p>
                          )}
                        </div>
                        <Button asChild variant="ghost" size="sm">
                          <a href={doc.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Contratto ──────────────────────────────────────────────── */}
        <TabsContent value="contratto" className="space-y-4 mt-4">
          {!sub?.order_id && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                Questo subappaltatore non è collegato a nessun cantiere/ordine. Per creare un contratto, associalo prima a un ordine dall'elenco subappaltatori.
              </AlertDescription>
            </Alert>
          )}
          {!contratto ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-semibold">Nessun contratto</p>
                  <p className="text-sm text-muted-foreground mt-1">Crea il contratto di subappalto per iniziare a tracciare SAL e ritenute.</p>
                </div>
                <Button onClick={() => setContrattoDialog(true)} disabled={!sub?.order_id}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crea contratto
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {contratto.numero_contratto ?? 'Contratto di subappalto'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setContrattoForm({
                          descrizione_lavori: contratto.descrizione_lavori,
                          importo_contrattuale: contratto.importo_contrattuale.toString(),
                          ritenuta_garanzia_pct: contratto.ritenuta_garanzia_pct.toString(),
                          data_inizio: contratto.data_inizio ?? '',
                          data_fine_prevista: contratto.data_fine_prevista ?? '',
                          numero_contratto: contratto.numero_contratto ?? '',
                          note: contratto.note ?? '',
                        });
                        setContrattoDialog(true);
                      }}
                    >
                      Modifica
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{contratto.descrizione_lavori}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Importo contratto</p>
                      <p className="font-bold">€{contratto.importo_contrattuale.toLocaleString('it-IT')}</p>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Ritenuta garanzia</p>
                      <p className="font-bold">{contratto.ritenuta_garanzia_pct}%</p>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Residuo</p>
                      <p className="font-bold">€{(contratto.importo_contrattuale - totaleLordo).toLocaleString('it-IT')}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Eseguito</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>€{totaleLordo.toLocaleString('it-IT')} SAL emessi</span>
                      <span>€{contratto.importo_contrattuale.toLocaleString('it-IT')} totale</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── Tab 3: SAL Ricevuti ────────────────────────────────────────────── */}
        <TabsContent value="sal" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!contratto}
              onClick={() => {
                setSalForm(f => ({ ...f, ritenuta_pct: contratto?.ritenuta_garanzia_pct != null ? contratto.ritenuta_garanzia_pct.toString() : '5', numero_sal: (salList.length + 1).toString() }));
                setSalDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuovo SAL
            </Button>
          </div>

          {!contratto && (
            <Alert className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Vai prima nel tab <strong>Contratto</strong> per creare il contratto di subappalto.
              </AlertDescription>
            </Alert>
          )}

          {salList.length === 0 && contratto ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">Nessun SAL ricevuto ancora.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {salList.map((sal) => (
                <Card key={sal.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold">SAL #{sal.numero_sal}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(sal.data_emissione), 'dd MMM yyyy', { locale: it })}
                        </p>
                      </div>
                      <SALStatoBadge stato={sal.stato} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo</p>
                        <p className="text-sm font-medium">€{sal.importo_lordo.toLocaleString('it-IT')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ritenuta ({sal.ritenuta_pct}%)</p>
                        <p className="text-sm font-medium text-amber-600">-€{sal.ritenuta_importo.toLocaleString('it-IT')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Netto</p>
                        <p className="text-sm font-bold text-green-600">€{sal.importo_netto.toLocaleString('it-IT')}</p>
                      </div>
                    </div>
                    {sal.note && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{sal.note}</p>}
                    {sal.stato === "ricevuto" && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm" variant="outline"
                          className="text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => approvaSALMutation.mutate(sal.id)}
                          disabled={approvaSALMutation.isPending}
                        >
                          <Check className="h-3 w-3 mr-1" /> Approva
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => setContestaId(sal.id)}
                        >
                          Contesta
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Totali */}
              {salList.length > 0 && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-2">Totali</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Totale lordo</p>
                        <p className="font-bold">€{totaleLordo.toLocaleString('it-IT')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Totale ritenute</p>
                        <p className="font-bold text-amber-600">€{totaleRitenute.toLocaleString('it-IT')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Netto da pagare</p>
                        <p className="font-bold text-green-600">€{totaleNetto.toLocaleString('it-IT')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: Ritenute & Pagamenti ──────────────────────────────────── */}
        <TabsContent value="ritenute" className="space-y-4 mt-4">
          {/* Riepilogo */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">In garanzia</p>
                <p className="text-xl font-bold text-amber-600">
                  €{ritenuteTrattenute.reduce((a, r) => a + r.importo, 0).toLocaleString('it-IT')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{ritenuteTrattenute.length} ritenute</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Svincolate</p>
                <p className="text-xl font-bold text-green-600">
                  €{ritenute.filter(r => r.stato === 'svincolata').reduce((a, r) => a + r.importo, 0).toLocaleString('it-IT')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Alert scadenze */}
          {ritenuteTrattenute.filter(r => {
            if (!r.data_svincolo_prevista) return false;
            return differenceInDays(parseISO(r.data_svincolo_prevista), new Date()) <= 30;
          }).length > 0 && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Alcune ritenute hanno data di svincolo prevista entro 30 giorni.
              </AlertDescription>
            </Alert>
          )}

          {/* Lista ritenute */}
          {ritenute.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">Nessuna ritenuta registrata. Le ritenute vengono create automaticamente alla registrazione dei SAL.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {ritenute.map((rit) => {
                const daysToSvincolo = rit.data_svincolo_prevista
                  ? differenceInDays(parseISO(rit.data_svincolo_prevista), new Date())
                  : null;
                return (
                  <Card key={rit.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold">€{rit.importo.toLocaleString('it-IT')}</p>
                          {rit.data_svincolo_prevista && (
                            <p className={`text-xs mt-0.5 ${daysToSvincolo !== null && daysToSvincolo <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              Svincolo previsto: {format(parseISO(rit.data_svincolo_prevista), 'dd/MM/yyyy')}
                              {daysToSvincolo !== null && daysToSvincolo <= 30 && ` (${daysToSvincolo}gg)`}
                            </p>
                          )}
                          {rit.data_svincolo_effettiva && (
                            <p className="text-xs text-green-600 mt-0.5">
                              Svincolata il {format(parseISO(rit.data_svincolo_effettiva), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            rit.stato === 'svincolata' ? 'bg-green-600 text-white text-xs' :
                            rit.stato === 'persa' ? 'bg-red-600 text-white text-xs' :
                            'bg-amber-500 text-white text-xs'
                          }>
                            {rit.stato === 'trattenuta' ? 'Trattenuta' :
                             rit.stato === 'svincolata' ? 'Svincolata' : 'Persa'}
                          </Badge>
                          {rit.stato === 'trattenuta' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => svincolaMutation.mutate(rit.id)}
                              disabled={svincolaMutation.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Svincola
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog Contratto ──────────────────────────────────────────────── */}
      <Dialog open={contrattoDialog} onOpenChange={setContrattoDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contratto ? 'Modifica contratto' : 'Nuovo contratto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>N. Contratto</Label>
              <Input
                value={contrattoForm.numero_contratto}
                onChange={(e) => setContrattoForm(f => ({ ...f, numero_contratto: e.target.value }))}
                placeholder="Es. SUB-2026-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione lavori *</Label>
              <Textarea
                value={contrattoForm.descrizione_lavori}
                onChange={(e) => setContrattoForm(f => ({ ...f, descrizione_lavori: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importo contrattuale (€)</Label>
                <Input
                  type="number"
                  value={contrattoForm.importo_contrattuale}
                  onChange={(e) => setContrattoForm(f => ({ ...f, importo_contrattuale: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ritenuta garanzia %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={contrattoForm.ritenuta_garanzia_pct}
                  onChange={(e) => setContrattoForm(f => ({ ...f, ritenuta_garanzia_pct: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data inizio</Label>
                <Input type="date" value={contrattoForm.data_inizio} onChange={(e) => setContrattoForm(f => ({ ...f, data_inizio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fine prevista</Label>
                <Input type="date" value={contrattoForm.data_fine_prevista} onChange={(e) => setContrattoForm(f => ({ ...f, data_fine_prevista: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={contrattoForm.note} onChange={(e) => setContrattoForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContrattoDialog(false)} disabled={saveContrattoMutation.isPending}>Annulla</Button>
            <Button onClick={() => saveContrattoMutation.mutate()} disabled={saveContrattoMutation.isPending || !contrattoForm.descrizione_lavori.trim()}>
              {saveContrattoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva contratto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog contestazione SAL */}
      <Dialog open={!!contestaSALId} onOpenChange={() => { setContestaId(null); setContestaNote(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contesta SAL</DialogTitle>
            <DialogDescription>Inserisci le motivazioni della contestazione.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Note contestazione</Label>
            <Textarea
              value={contestaNote}
              onChange={e => setContestaNote(e.target.value)}
              placeholder="Es: Importo non corretto, mancano documenti..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContestaId(null)}>Annulla</Button>
            <Button
              variant="destructive"
              onClick={() => contestaSALMutation.mutate({ id: contestaSALId!, note: contestaNote })}
              disabled={!contestaNote || contestaSALMutation.isPending}
            >
              Conferma contestazione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Nuovo SAL ──────────────────────────────────────────────── */}
      <Dialog open={salDialog} onOpenChange={setSalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-green-600" />
              Nuovo SAL subappaltatore
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>N. SAL</Label>
                <Input
                  type="number"
                  value={salForm.numero_sal}
                  onChange={(e) => setSalForm(f => ({ ...f, numero_sal: e.target.value }))}
                  placeholder={`${salList.length + 1}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data emissione</Label>
                <Input type="date" value={salForm.data_emissione} onChange={(e) => setSalForm(f => ({ ...f, data_emissione: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importo lordo (€)</Label>
                <Input
                  type="number"
                  value={salForm.importo_lordo}
                  onChange={(e) => setSalForm(f => ({ ...f, importo_lordo: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ritenuta %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={salForm.ritenuta_pct}
                  onChange={(e) => setSalForm(f => ({ ...f, ritenuta_pct: e.target.value }))}
                />
              </div>
            </div>
            {salForm.importo_lordo && parseFloat(salForm.importo_lordo) > 0 && (
              <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                {(() => {
                  const lordo = parseFloat(salForm.importo_lordo) || 0;
                  const pct = parseFloat(salForm.ritenuta_pct) || 0;
                  const ritenuta = Math.round(lordo * pct / 100 * 100) / 100;
                  const netto = Math.round((lordo - ritenuta) * 100) / 100;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Ritenuta trattenuta:</span>
                        <span className="font-medium text-amber-600">€{ritenuta.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Netto da pagare:</span>
                        <span className="text-green-600">€{netto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Stato</Label>
              <Select value={salForm.stato} onValueChange={(v) => setSalForm(f => ({ ...f, stato: v as StatoSALSub }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ricevuto">Ricevuto</SelectItem>
                  <SelectItem value="verificato">Verificato</SelectItem>
                  <SelectItem value="pagato">Pagato</SelectItem>
                  <SelectItem value="contestato">Contestato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={salForm.note} onChange={(e) => setSalForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalDialog(false)} disabled={saveSalMutation.isPending}>Annulla</Button>
            <Button onClick={() => saveSalMutation.mutate()} disabled={saveSalMutation.isPending || !salForm.importo_lordo}>
              {saveSalMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registra SAL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
