import { SalPaymentDialog } from "@/components/subappaltatori/SalPaymentDialog";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { SALContabilita, RitenuteContabilita } from "@/components/subappaltatori/ContabilitaSubappalto";
import { euroSub } from "@/lib/subappaltatori/lavoriMisure";
import { SchedaCommessaDialog } from "@/components/sicurezza/SchedaCommessaDialog";
import { PercorsiSubappaltatore } from "@/components/subappaltatori/PercorsiSubappaltatore";
import { LavoriMisureSubDialog } from "@/components/subappaltatori/LavoriMisureSubDialog";
import { FiscalReleaseDialog } from "@/components/fatturazione/FiscalReleaseDialog";
import { VerbaleSalSubDialog } from "@/components/subappaltatori/VerbaleSalSubDialog";
import { ContestoSchedaCommessa } from "@/components/sicurezza/ContestoSchedaCommessa";
import { ImportaArchivioFascicolo } from "@/components/sicurezza/ImportaArchivioFascicolo";
import { DocumentiMensiliSub } from "@/components/subappaltatori/DocumentiMensiliSub";
import { SubcontractorSupplierLink } from "@/components/suppliers/SubcontractorSupplierLink";
import { usePermissions } from "@/hooks/usePermissions";
import { useContext, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampoIndirizzo } from '@/components/shared/CampoIndirizzo';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
  ArrowLeft, HardHat, FileText, Euro, Loader2, Plus, AlertTriangle, ExternalLink,
  Upload, Trash2, Mail, MapPin, Link2, Link2Off, FileArchive, Phone,
} from 'lucide-react';
import { DATA_MASSIMA, dataPlausibile } from '@/lib/dataPlausibile';
import type {
  ContrattoSubappalto, SALSubappaltatore, RitenutaGaranzia,
  DocumentoSubappaltatore, StatoSALSub, TipoDocumentoSub,
} from '@/types/subappaltatori';
import {
  TIPO_DOC_LABELS,
  SUBAPPALTATORI_DOCUMENTI_BUCKET as DOCUMENT_BUCKET,
} from '@/lib/sicurezza/bulkDocumenti';
import { extractDurcExpiryFromPdf } from '@/lib/sicurezza/durcExpiry';
import BulkDocumentiUploadDialog from './subappaltatore/BulkDocumentiUploadDialog';
import { ContrattiSubappalto, LavoriSubappaltatore, chiaviContratti, useContrattiSubappaltatore, type ContrattoCompleto } from '@/components/subappaltatori/ContrattiSubappalto';
import { parseDecimalIT } from '@/lib/parseDecimalIT';
import { OperaiSubappaltatore } from '@/components/subappaltatori/OperaiSubappaltatore';
import { IncarichiCantiere } from '@/components/sicurezza/IncarichiCantiere';
import { FascicoloDocumenti } from '@/components/sicurezza/FascicoloDocumenti';

/** Con più contratti (una commessa ciascuno), su quale si guardano SAL e ritenute. */
function SceltaContratto({ contratti, valore, onCambia }: { contratti: ContrattoCompleto[]; valore: string; onCambia: (id: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
      <span className="text-muted-foreground">Contratto:</span>
      <select className="h-10 w-full min-w-0 max-w-xl truncate rounded-md border bg-background px-2 text-sm" value={valore} onChange={(e) => onCambia(e.target.value)} aria-label="Contratto">
        {contratti.map((c) => (
          <option key={c.id} value={c.id}>{[c.commessa?.order_code, c.numero_contratto, c.commessa?.description].filter(Boolean).join(' · ') || 'Contratto'}</option>
        ))}
      </select>
    </div>
  );
}

// ── Badge helpers ────────────────────────────────────────────────────────────

function DurcBadge({ scadenza, hasDoc }: { scadenza: string | null; hasDoc?: boolean }) {
  if (!scadenza) {
    // Distinzione: DURC caricato ma SENZA data di scadenza (da inserire) vs DURC
    // del tutto assente. Prima mostrava sempre "DURC mancante" → confondeva quando
    // il file DURC c'era (es. import massivo) ma la scadenza non era stata salvata.
    return hasDoc
      ? <Badge className="bg-amber-500 text-white">DURC · scadenza mancante</Badge>
      : <Badge variant="outline">DURC assente</Badge>;
  }
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="bg-green-600 text-white">DURC OK</Badge>;
}

// TIPO_DOC_LABELS e DOCUMENT_BUCKET sono definiti in
// '@/lib/sicurezza/bulkDocumenti' e importati sopra (condivisi col
// caricamento massivo BulkDocumentiUploadDialog).

function isMissingCampoLinkColumn(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return message.includes('campo_subappaltatore_id') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function SubappaltatoreDetail() {
  const schedaCommessa = useContext(ContestoSchedaCommessa);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const permessi = usePermissions();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // ── Fetch subappaltatore ─────────────────────────────────────────────────
  const { data: sub, isLoading: loadingSub, error: erroreSub, refetch: ricaricaSub } = useQuery({
    queryKey: ['subappaltatore', id, companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .select('*')
        .eq('id', id!)
        .eq('company_id', companyId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id && !!companyId,
  });

  // ── Contratti: uno per ogni commessa; Contratto, SAL e Ritenute lavorano su
  // quello scelto (prima si vedeva solo il più recente) ──────────────────────
  const { data: contratti = [], isLoading: caricoContratti, error: erroreContratti, refetch: ricaricaContratti } = useContrattiSubappaltatore(id);
  // Dalla commessa (Ditte e contratti, 31/10/2026) si arriva col contratto da aprire: ?tab=contratto&contratto=…
  const [parametri] = useSearchParams();
  const [contrattoSelId, setContrattoSelId] = useState<string | null>(() => parametri.get('contratto'));
  const [contrattoDaAprire, setContrattoDaAprire] = useState<string | null>(() => parametri.get('contratto'));
  const [tabAttiva, setTabAttiva] = useState(() => parametri.get('tab') === 'contratto' ? 'contratto' : 'anagrafica');
  const [commessaPopup, setCommessaPopup] = useState<string | null>(null);
  const [vistaContabilita, setVistaContabilita] = useState('sal');
  const contratto = (contratti.find((c) => c.id === contrattoSelId) ?? contratti[0] ?? null) as unknown as ContrattoSubappalto | null;

  // ── Fetch SAL ────────────────────────────────────────────────────────────
  const { data: salList = [], isLoading: salCaricamento, isError: salErrore, refetch: ricaricaSal } = useQuery({
    queryKey: ['sal-sub', contratto?.id, companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sal_subappaltatori')
        .select('*')
        .eq('contratto_id', contratto!.id)
        .eq('company_id', companyId)
        .order('numero_sal');
      if (error) throw error;
      return (data ?? []) as SALSubappaltatore[];
    },
    enabled: !!contratto?.id,
  });

  // ── Fetch ritenute ───────────────────────────────────────────────────────
  const { data: ritenute = [], isLoading: ritenuteLoading, isError: ritenuteError, refetch: ricaricaRitenute } = useQuery({
    queryKey: ['ritenute-sub', contratto?.id, companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ritenute_garanzia')
        .select('*')
        .eq('company_id', companyId)
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

  // ── Fetch documenti "fascicolo" (tabella subappaltatori_documenti) ─────────
  // Archivio DIVERSO da documenti_subappaltatore (sopra): qui finiscono i doc
  // caricati in massa / dal modulo Sicurezza, legati all'ANAGRAFICA
  // (campo_subappaltatore_id). Li mostriamo in sola lettura sulla scheda così
  // sono accessibili da qui. Stesso bucket (subappaltatori-documenti).
  const COMPLIANCE_TIPO_LABELS: Record<string, string> = {
    durc: 'DURC', visura: 'Visura camerale', dvr: 'DVR', pos: 'POS',
    soa: 'Attestazione SOA', polizza_rc: 'Polizza RC', cassa_edile: 'Cassa Edile',
    antimafia: 'Antimafia', iscrizione_albo: 'Iscrizione Albo',
    formazione_operai: 'Formazione operai', altro: 'Altro',
  };
  const { data: documentiCompliance = [] } = useQuery({
    queryKey: ['sub-doc-compliance', sub?.campo_subappaltatore_id],
    enabled: !!sub?.campo_subappaltatore_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori_documenti')
        .select('id, tipo, status, storage_path, scadenza, created_at')
        .eq('subappaltatore_id', sub!.campo_subappaltatore_id)
        .neq('status', 'superseded')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; tipo: string; status: string;
        storage_path: string | null; scadenza: string | null; created_at: string;
      }>;
    },
  });

  const openComplianceDoc = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error('Impossibile aprire il documento');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const { data: campoAccess } = useQuery({
    queryKey: ['subappaltatore-campo-access', sub?.campo_subappaltatore_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subappaltatori')
        .select('id, user_id, user_email, is_active')
        .eq('id', sub!.campo_subappaltatore_id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; user_id: string | null; user_email: string | null; is_active: boolean | null } | null;
    },
    enabled: !!sub?.campo_subappaltatore_id,
  });

  const { data: inferredCampoAccess } = useQuery({
    queryKey: ['subappaltatore-campo-access-inferred', companyId, sub?.piva, sub?.email, sub?.pec, sub?.ragione_sociale],
    queryFn: async () => {
      let query = (supabase as any)
        .from('subappaltatori')
        .select('id, user_id, user_email, is_active')
        .eq('company_id', companyId)
        .limit(1);
      if (sub?.piva) {
        query = query.eq('piva', sub.piva);
      } else if (sub?.email || sub?.pec) {
        const email = sub.email || sub.pec;
        query = query.or(`email.eq.${email},user_email.eq.${email}`);
      } else {
        query = query.ilike('ragione_sociale', sub!.ragione_sociale);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as { id: string; user_id: string | null; user_email: string | null; is_active: boolean | null } | null;
    },
    enabled: !!companyId && !!sub && !sub.campo_subappaltatore_id,
  });

  // ── Fetch lavoro/commessa collegata ──────────────────────────────────────

  // ═══════════════════════════ MUTATIONS ═══════════════════════════════════

  // ── Anagrafica subappaltatore ────────────────────────────────────────────
  const [anagraficaDialog, setAnagraficaDialog] = useState(false);
  const [anagraficaForm, setAnagraficaForm] = useState({
    ragione_sociale: '',
    piva: '',
    indirizzo: '',
    email: '',
    pec: '',
    codice_fiscale: '',
    responsabile: '',
    telefono: '',
    tipo_lavori: '',
    durc_scadenza: '',
    note: '',
  });

  const openAnagraficaDialog = () => {
    setAnagraficaForm({
      ragione_sociale: sub?.ragione_sociale ?? '',
      piva: sub?.piva ?? '',
      indirizzo: sub?.indirizzo ?? '',
      email: sub?.email ?? '',
      pec: sub?.pec ?? '',
      codice_fiscale: sub?.codice_fiscale ?? '',
      responsabile: sub?.responsabile ?? '',
      telefono: sub?.telefono ?? '',
      tipo_lavori: sub?.tipo_lavori ?? '',
      durc_scadenza: sub?.durc_scadenza ?? '',
      note: sub?.note ?? '',
    });
    setAnagraficaDialog(true);
  };

  const findOrCreateCampoSubappaltatore = async (source: typeof anagraficaForm) => {
    const ragioneSociale = source.ragione_sociale.trim();
    const piva = source.piva.trim();
    const email = source.email.trim() || source.pec.trim();

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
        responsabile: source.responsabile.trim() || null,
        telefono: source.telefono.trim() || null,
        email: source.email.trim() || null,
        piva: piva || null,
        indirizzo: source.indirizzo.trim() || null,
        user_email: email || null,
        notes: source.note.trim() || null,
        is_active: true,
      })
      .select('id')
      .single();
    if (createError) throw createError;
    return created.id as string;
  };

  const upsertCampoSubappaltatore = async (campoId: string, source: typeof anagraficaForm) => {
    const { error } = await (supabase as any)
      .from('subappaltatori')
      .update({
        ragione_sociale: source.ragione_sociale.trim(),
        responsabile: source.responsabile.trim() || null,
        telefono: source.telefono.trim() || null,
        email: source.email.trim() || null,
        piva: source.piva.trim() || null,
        indirizzo: source.indirizzo.trim() || null,
        user_email: source.email.trim() || source.pec.trim() || null,
        notes: source.note.trim() || null,
      })
      .eq('id', campoId);
    if (error) throw error;
  };

  const saveAnagraficaMutation = useMutation({
    mutationFn: async () => {
      if (!anagraficaForm.ragione_sociale.trim()) throw new Error('Ragione sociale obbligatoria');
      if (!dataPlausibile(anagraficaForm.durc_scadenza)) throw new Error('Scadenza DURC non valida: controlla l\'anno');
      const campoId = sub?.campo_subappaltatore_id
        ? sub.campo_subappaltatore_id
        : await findOrCreateCampoSubappaltatore(anagraficaForm);
      await upsertCampoSubappaltatore(campoId, anagraficaForm);
      const payload: Record<string, unknown> = {
        ragione_sociale: anagraficaForm.ragione_sociale.trim(),
        campo_subappaltatore_id: campoId,
        piva: anagraficaForm.piva.trim() || null,
        indirizzo: anagraficaForm.indirizzo.trim() || null,
        email: anagraficaForm.email.trim() || null,
        pec: anagraficaForm.pec.trim() || null,
        codice_fiscale: anagraficaForm.codice_fiscale.trim() || null,
        responsabile: anagraficaForm.responsabile.trim() || null,
        telefono: anagraficaForm.telefono.trim() || null,
        tipo_lavori: anagraficaForm.tipo_lavori.trim() || null,
        durc_scadenza: anagraficaForm.durc_scadenza || null,
        note: anagraficaForm.note.trim() || null,
      };
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .update(payload)
        .eq('id', id!);
      if (error && isMissingCampoLinkColumn(error)) {
        delete payload.campo_subappaltatore_id;
        const { error: retryError } = await (supabase as any)
          .from('subappaltatori_sicurezza')
          .update(payload)
          .eq('id', id!);
        if (retryError) throw new Error(retryError.message || retryError.details || retryError.hint || 'Errore');
        return;
      }
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
    },
    onSuccess: () => {
      toast.success('Anagrafica aggiornata');
      queryClient.invalidateQueries({ queryKey: ['subappaltatore', id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatore-campo-access'] });
      queryClient.invalidateQueries({ queryKey: ['sub-campo-list', companyId] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      setAnagraficaDialog(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const collegaCampoMutation = useMutation({
    mutationFn: async () => {
      if (!sub) throw new Error('Subappaltatore non trovato');
      const source = {
        ragione_sociale: sub.ragione_sociale ?? '',
        piva: sub.piva ?? '',
        codice_fiscale: sub.codice_fiscale ?? '',
        indirizzo: sub.indirizzo ?? '',
        email: sub.email ?? '',
        pec: sub.pec ?? '',
        responsabile: sub.responsabile ?? '',
        telefono: sub.telefono ?? '',
        tipo_lavori: sub.tipo_lavori ?? '',
        durc_scadenza: sub.durc_scadenza ?? '',
        note: sub.note ?? '',
      };
      const campoId = await findOrCreateCampoSubappaltatore(source);
      await upsertCampoSubappaltatore(campoId, source);
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .update({ campo_subappaltatore_id: campoId })
        .eq('id', id!);
      if (error && isMissingCampoLinkColumn(error)) return;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Anagrafica app cantiere collegata');
      queryClient.invalidateQueries({ queryKey: ['subappaltatore', id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatore-campo-access'] });
      queryClient.invalidateQueries({ queryKey: ['sub-campo-list', companyId] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Documenti ────────────────────────────────────────────────────────────
  const [docDialog, setDocDialog] = useState(false);
  const [bulkDocDialog, setBulkDocDialog] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docForm, setDocForm] = useState({
    tipo: 'durc' as TipoDocumentoSub,
    data_rilascio: '',
    data_scadenza: '',
    note: '',
  });
  // Setter inline rapido per la scadenza DURC (quando il DURC è caricato ma la
  // data non è stata registrata — es. import massivo).
  const [durcDateInput, setDurcDateInput] = useState('');

  const uploadDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error('Seleziona un file');
      if (!dataPlausibile(docForm.data_scadenza)) throw new Error('Scadenza non valida: controlla l\'anno');
      const safeName = docFile.name.replace(/[^\w.-]+/g, '_');
      const filePath = `${companyId}/${id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(filePath, docFile, { contentType: docFile.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await (supabase as any).from('documenti_subappaltatore').insert({
        company_id: companyId,
        subappaltatore_id: id!,
        tipo: docForm.tipo,
        nome_file: docFile.name,
        url: filePath,
        data_rilascio: docForm.data_rilascio || null,
        data_scadenza: docForm.data_scadenza || null,
        note: docForm.note.trim() || null,
      });
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
      // Se carico un DURC con scadenza, allineo durc_scadenza della scheda così il
      // badge smette di dire "DURC mancante" (prima i due dati restavano scollegati).
      if (docForm.tipo === 'durc' && docForm.data_scadenza) {
        await (supabase as any)
          .from('subappaltatori_sicurezza')
          .update({ durc_scadenza: docForm.data_scadenza })
          .eq('id', id!);
      }
    },
    onSuccess: () => {
      toast.success('Documento caricato');
      queryClient.invalidateQueries({ queryKey: ['documenti-sub', id] });
      queryClient.invalidateQueries({ queryKey: ['sicurezza-documenti', companyId] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatore', id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      setDocDialog(false);
      setDocFile(null);
      setDocForm({ tipo: 'durc', data_rilascio: '', data_scadenza: '', note: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openDocument = async (doc: DocumentoSubappaltatore) => {
    if (doc.url.startsWith('http')) {
      window.open(doc.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.url, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error('Impossibile aprire il documento');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const deleteDocumentMutation = useMutation({
    mutationFn: async (doc: DocumentoSubappaltatore) => {
      const { error } = await (supabase as any)
        .from('documenti_subappaltatore')
        .delete()
        .eq('id', doc.id);
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
      if (doc.url && !doc.url.startsWith('http')) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.url]);
      }
    },
    onSuccess: () => {
      toast.success('Documento eliminato');
      queryClient.invalidateQueries({ queryKey: ['documenti-sub', id] });
      queryClient.invalidateQueries({ queryKey: ['sicurezza-documenti', companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Imposta/aggiorna SOLO la scadenza DURC sulla scheda (badge in alto si aggiorna).
  const setDurcMutation = useMutation({
    mutationFn: async (date: string) => {
      if (!dataPlausibile(date)) throw new Error('Scadenza DURC non valida: controlla l\'anno');
      const { error } = await (supabase as any)
        .from('subappaltatori_sicurezza')
        .update({ durc_scadenza: date || null })
        .eq('id', id!);
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
    },
    onSuccess: () => {
      toast.success('Scadenza DURC aggiornata');
      setDurcDateInput('');
      queryClient.invalidateQueries({ queryKey: ['subappaltatore', id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Nuovo SAL ────────────────────────────────────────────────────────────
  const [salDialog, setSalDialog] = useState(false);
  const [salLavori, setSalLavori] = useState<ContrattoCompleto | null>(null);
  const [salControlloBase, setSalControlloBase] = useState(false);
  const [salVerbale, setSalVerbale] = useState<SALSubappaltatore | null>(null);
  const [salForm, setSalForm] = useState({
    numero_sal: '',
    data_emissione: format(new Date(), 'yyyy-MM-dd'),
    importo_lordo: '',
    ritenuta_pct: contratto?.ritenuta_garanzia_pct != null ? contratto.ritenuta_garanzia_pct.toString() : '5',
    note: '',
    stato: 'ricevuto' as StatoSALSub,
  });

  // DURC bloccante: senza documento valido niente nuovi SAL e niente
  // pagamenti. Gli alert c'erano già ma erano solo grafica — e il sito
  // promette il "blocco automatico con DURC non valido".
  const durcBloccante = (): string | null => {
    const daDocumenti = [
      ...documenti.filter((d) => d.tipo === 'durc' && d.data_scadenza).map((d) => d.data_scadenza as string),
      ...documentiCompliance.filter((d) => d.tipo === 'durc' && d.scadenza).map((d) => d.scadenza as string),
    ].sort();
    // Lo stesso DURC «effettivo» del badge: prima il badge diceva OK e il blocco no.
    const scad = sub?.durc_scadenza ?? (daDocumenti.length ? daDocumenti[daDocumenti.length - 1] : null);
    if (!scad) return 'DURC mancante: carica il DURC con la data di scadenza prima di procedere.';
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    if (new Date(scad) < oggi) {
      return `DURC scaduto il ${new Date(scad).toLocaleDateString('it-IT')}: rinnovalo prima di procedere.`;
    }
    return null;
  };

  const [salRichiestaId, setSalRichiestaId] = useState(() => crypto.randomUUID());
  const saveSalMutation = useMutation({
    mutationFn: async () => {
      if (!contratto?.id) throw new Error('Contratto non trovato');
      const bloccoDurc = durcBloccante();
      if (bloccoDurc) throw new Error(bloccoDurc);
      const importoLordo = parseDecimalIT(salForm.importo_lordo);
      if (!(importoLordo > 0)) throw new Error('Scrivi l\'importo del SAL');
      // Lo 0% è una ritenuta valida: prima `|| 5` la trasformava in 5%.
      const ritenutaPct = salForm.ritenuta_pct.trim() ? parseDecimalIT(salForm.ritenuta_pct) : Number(contratto.ritenuta_garanzia_pct ?? 0);
      const numero = Number(salForm.numero_sal);
      if (!Number.isInteger(numero) || numero < 1) throw new Error('Indica un numero SAL intero e positivo');
      if (!Number.isFinite(ritenutaPct) || ritenutaPct < 0 || ritenutaPct > 100) throw new Error('Ritenuta non valida');
      const { data, error } = await supabase.rpc('sal_sub_registra_con_garanzia' as never, {
        p_company: companyId, p_contratto: contratto.id, p_id: salRichiestaId,
        p_numero: numero, p_data: salForm.data_emissione, p_lordo: importoLordo,
        p_ritenuta: ritenutaPct, p_stato: salForm.stato, p_note: salForm.note.trim() || null,
      } as never);
      if (error) throw new Error(error.message);
      const esito = data as unknown;
      if (!esito || typeof esito !== 'object' || !('id' in esito) || esito.id !== salRichiestaId) throw new Error('Registrazione SAL non confermata: rileggi i dati prima di riprovare');

    },
    onSuccess: () => {
      toast.success('SAL e relativa garanzia registrati');
      setSalRichiestaId(crypto.randomUUID());
      if (contratto?.order_id) void queryClient.invalidateQueries({ queryKey: ['order-subcontract-statistics', contratto.order_id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: chiaviContratti.salTutti(id) });
      queryClient.invalidateQueries({ queryKey: ['ritenute-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: ['ritenute-sub-tutte', id] });
      setSalDialog(false);
      setSalForm({ numero_sal: '', data_emissione: format(new Date(), 'yyyy-MM-dd'), importo_lordo: '', ritenuta_pct: contratto?.ritenuta_garanzia_pct?.toString() ?? '5', note: '', stato: 'ricevuto' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Lo svincolo usa anteprima/versione/riferimento del flusso fiscale condiviso.
  const [ritenutaDaSvincolare, setRitenutaDaSvincolare] = useState<string | null>(null);


  // ── Approva / Contesta SAL ───────────────────────────────────────────────
  const [contestaNote, setContestaNote] = useState("");
  const [contestaSALId, setContestaId] = useState<string | null>(null);

  const approvaSALMutation = useMutation({
    mutationFn: async (salId: string) => {
      const { data, error } = await supabase
        .from("sal_subappaltatori")
        .update({ stato: "verificato" })
        .eq("id", salId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("SAL non approvato: non hai il permesso, o è già cambiato. Ricarica la pagina.");
    },
    onSuccess: () => {
      toast.success("SAL approvato");
      if (contratto?.order_id) void queryClient.invalidateQueries({ queryKey: ['order-subcontract-statistics', contratto.order_id, companyId] });
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: chiaviContratti.salTutti(id) });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore durante l'approvazione"),
  });

  const contestaSALMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data, error } = await supabase
        .from("sal_subappaltatori")
        .update({ stato: "contestato", note_contestazione: note } as never)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("SAL non contestato: non hai il permesso, o è già cambiato. Ricarica la pagina.");
    },
    onSuccess: () => {
      toast.success("SAL contestato");
      if (contratto?.order_id) void queryClient.invalidateQueries({ queryKey: ['order-subcontract-statistics', contratto.order_id, companyId] });
      setContestaId(null);
      setContestaNote("");
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: chiaviContratti.salTutti(id) });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore durante la contestazione"),
  });

  // ── Registra pagamento SAL ───────────────────────────────────────────────
  const [paymentSAL, setPaymentSAL] = useState<SALSubappaltatore | null>(null);
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
        <p className="text-muted-foreground">{erroreSub ? "Scheda non disponibile nell’azienda corrente. Verifica gli accessi o riprova." : "Subappaltatore non trovato"}</p>
        {erroreSub && <Button variant="outline" onClick={()=>void ricaricaSub()}>Riprova</Button>}
        <Button variant="link" onClick={() => navigate('/azienda/manodopera?tab=subappaltatori')}>{schedaCommessa ? "Torna alla commessa" : "Torna alla lista"}</Button>
      </div>
    );
  }

  // I SAL contestati non contano: né nell'eseguito né nelle ritenute.

  const salGaranziaDaRiconciliare = salList.filter(s => Math.abs(
    Math.round((s.stato === 'contestato' ? 0 : Number(s.ritenuta_importo)) * 100) -
    ritenute.filter(r => r.sal_id === s.id && r.stato !== 'annullata').reduce((n,r) => n + Math.round(Number(r.importo) * 100), 0)
  ) > 1);
  const appCantiere = campoAccess ?? inferredCampoAccess ?? null;
  const hasAppCantiere = Boolean(sub.campo_subappaltatore_id || appCantiere?.id);

  // DURC "effettivo": il campo durc_scadenza della scheda OPPURE, se vuoto, la
  // scadenza del DURC caricato più recente (tra documenti idoneità e fascicolo).
  // Così il badge non dice "mancante" quando un DURC con scadenza c'è davvero.
  const durcDocScadenze = [
    ...documenti.filter((d) => d.tipo === 'durc' && d.data_scadenza).map((d) => d.data_scadenza as string),
    ...documentiCompliance.filter((d) => d.tipo === 'durc' && d.scadenza).map((d) => d.scadenza as string),
  ].sort();
  const effectiveDurc = sub.durc_scadenza ?? (durcDocScadenze.length ? durcDocScadenze[durcDocScadenze.length - 1] : null);
  // Esiste un documento DURC caricato (anche senza scadenza)? Distingue
  // "DURC presente · scadenza mancante" da "DURC assente".
  const hasDurcDoc =
    documenti.some((d) => d.tipo === 'durc') ||
    documentiCompliance.some((d) => d.tipo === 'durc');

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header. Mobile: senza riquadro e senza la seconda freccia (c'è quella
          della barra in alto); dati fiscali e app cantiere stanno in «Dati». */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between max-sm:gap-2">
          <div className="flex min-w-0 items-start gap-3">
        {!schedaCommessa && <Button variant="ghost" size="icon" className="max-sm:hidden" onClick={() => navigate('/azienda/manodopera?tab=subappaltatori')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>}
        <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate max-sm:text-lg max-sm:leading-tight">{sub.ragione_sociale}</h1>
              <p className="text-sm text-muted-foreground max-sm:text-xs">{sub.tipo_lavori ?? 'Subappaltatore'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 max-sm:hidden">
                {sub.piva && <span>P.IVA {sub.piva}</span>}
                {sub.indirizzo && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{sub.indirizzo}</span>}
                {sub.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sub.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubcontractorSupplierLink subcontractorId={id!} />
            {hasAppCantiere ? (
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 max-sm:hidden">
                <Link2 className="mr-1 h-3 w-3" />
                {appCantiere?.user_id ? 'Account app cantiere attivo' : 'Anagrafica app cantiere collegata'}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 max-sm:hidden">
                <Link2Off className="mr-1 h-3 w-3" />
                App cantiere non collegata
              </Badge>
            )}
            <DurcBadge scadenza={effectiveDurc} hasDoc={hasDurcDoc} />
            {/* «Collega app cantiere» qui non c'è più: era lo stesso bottone del
                riquadro «Account app cantiere» in Anagrafica, dove si spiega cosa fa. */}
            {sub.telefono && (
              <Button asChild variant="outline" size="sm" className="tap-compact h-7 px-2.5 text-xs sm:hidden">
                <a href={`tel:${sub.telefono}`}><Phone className="mr-1 h-3.5 w-3.5" />Chiama</a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="tap-compact max-sm:h-7 max-sm:px-2.5 max-sm:text-xs" onClick={openAnagraficaDialog}>
              Modifica
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tabAttiva} onValueChange={setTabAttiva}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="anagrafica" className="shrink-0 py-2">Panoramica</TabsTrigger>
          <TabsTrigger value="operai" className="shrink-0 py-2">Operai e squadre</TabsTrigger>
          <TabsTrigger value="documenti" className="shrink-0 py-2">Documenti e sicurezza</TabsTrigger>
          <TabsTrigger value="lavori" className="shrink-0 py-2">Commesse</TabsTrigger>
          <TabsTrigger value="contratto" className="shrink-0 py-2">Contratti</TabsTrigger>
          <TabsTrigger value="contabilita" className="shrink-0 py-2">Contabilità</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Anagrafica ─────────────────────────────────────────────── */}
        <TabsContent value="anagrafica" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-3">
          <PercorsiSubappaltatore amministrazione={permessi.canViewSubappaltatoriAmministrazione && permessi.canViewCosts} onApri={setTabAttiva} />
          <div className="grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader className="pb-3 max-sm:hidden">
              <CardTitle className="text-base flex items-center gap-2">
                <HardHat className="h-4 w-4" /> Dati anagrafici
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-sm:space-y-2 max-sm:p-3">
              <div className="rounded-lg border bg-slate-50 p-3 max-sm:px-2.5 max-sm:py-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between max-sm:flex-row max-sm:items-center max-sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium max-sm:text-[13px]">{hasAppCantiere ? 'Account app cantiere' : <><span className="sm:hidden">App cantiere non collegata</span><span className="max-sm:hidden">Account app cantiere</span></>}</p>
                    <p className={`text-xs text-muted-foreground ${hasAppCantiere ? 'max-sm:truncate max-sm:text-[11px]' : 'max-sm:hidden'}`}>
                      {hasAppCantiere
                        ? appCantiere?.user_id
                          ? `Account attivo: ${appCantiere.user_email ?? 'email non indicata'}`
                          : appCantiere?.user_email
                            ? `Email pronta per invito: ${appCantiere.user_email}`
                            : 'Scheda collegata, account non ancora invitato'
                        : 'Collega questa anagrafica agli account app cantiere per evitare doppioni.'}
                    </p>
                  </div>
                  {!hasAppCantiere && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="tap-compact max-sm:h-7 max-sm:shrink-0 max-sm:px-2.5 max-sm:text-xs"
                      onClick={() => collegaCampoMutation.mutate()}
                      disabled={collegaCampoMutation.isPending}
                    >
                      <Link2 className="mr-1.5 h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
                      <span className="max-sm:hidden">Collega app cantiere</span>
                      <span className="sm:hidden">Collega</span>
                    </Button>
                  )}
                </div>
              </div>
              {[
                // Mobile: ragione sociale, tipo lavori e DURC sono già nella testata.
                { label: 'Ragione sociale', value: sub.ragione_sociale, giaInTestata: true },
                { label: 'P.IVA', value: sub.piva },
                { label: 'Codice Fiscale', value: sub.codice_fiscale },
                { label: 'Indirizzo', value: sub.indirizzo },
                { label: 'Responsabile', value: sub.responsabile },
                { label: 'Telefono', value: sub.telefono },
                { label: 'Email', value: sub.email },
                { label: 'PEC', value: sub.pec },
                { label: 'Tipo lavori', value: sub.tipo_lavori, giaInTestata: true },
                { label: 'Note', value: sub.note },
              ].map(({ label, value, giaInTestata }) => value ? (
                <div key={label} className={`flex gap-3 ${giaInTestata ? 'max-sm:hidden' : ''}`}>
                  <span className="text-sm text-muted-foreground w-32 shrink-0 max-sm:w-24 max-sm:text-xs">{label}</span>
                  <span className="text-sm font-medium max-sm:min-w-0 max-sm:break-words max-sm:text-[13px]">{value}</span>
                </div>
              ) : null)}
              <div className={`flex flex-wrap items-center gap-3 ${effectiveDurc ? 'max-sm:hidden' : ''}`}>
                <span className="text-sm text-muted-foreground w-32 shrink-0 max-sm:w-24 max-sm:text-xs">Scadenza DURC</span>
                <DurcBadge scadenza={effectiveDurc} hasDoc={hasDurcDoc} />
                {!effectiveDurc && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      max={DATA_MASSIMA}
                      value={durcDateInput}
                      onChange={(e) => setDurcDateInput(e.target.value)}
                      className="h-8 w-auto text-xs"
                      aria-label="Data scadenza DURC"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={!durcDateInput || setDurcMutation.isPending}
                      onClick={() => setDurcMutation.mutate(durcDateInput)}
                    >
                      {setDurcMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salva scadenza'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <IncarichiCantiere key={`${companyId}:${id}`} companyId={companyId} subId={id!} />
          </div>
        </TabsContent>
        <TabsContent value="operai" className="mt-4">
          <OperaiSubappaltatore key={`${companyId}:${id}`} companyId={companyId} subId={id!} />
        </TabsContent>
        <TabsContent value="documenti" className="mt-4 space-y-4">
          <FascicoloDocumenti key={`${companyId}:${id}`} companyId={companyId} subId={id!} />
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">Archivio precedente: i documenti già caricati restano disponibili qui sotto. Il nuovo fascicolo distingue impresa, operaio e commessa e registra le verifiche.</div>
          {/* Documenti */}
          {/* Mobile: niente import ZIP né spiegazione; «Carica» per fotografare
              o scegliere il documento. */}
          <Card>
            <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2 max-sm:text-sm">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 max-sm:hidden" /> <span className="max-sm:hidden">Documenti idoneità</span><span className="sm:hidden">Documenti</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" className="max-sm:hidden" onClick={() => setBulkDocDialog(true)}>
                    <FileArchive className="h-4 w-4 mr-1.5" />
                    Importa ZIP
                  </Button>
                  <Button size="sm" className="tap-compact max-sm:h-7 max-sm:px-2.5 max-sm:text-xs" onClick={() => setDocDialog(true)}>
                    <Upload className="h-4 w-4 mr-1.5 max-sm:h-3.5 max-sm:w-3.5" />
                    <span className="max-sm:hidden">Carica documento</span>
                    <span className="sm:hidden">Carica</span>
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-sm:p-3 max-sm:pt-0">
              <p className="text-xs text-muted-foreground mb-3 max-sm:hidden">
                Carica qui <strong>DURC</strong>, visura camerale, POS, polizze e altri documenti di idoneità.
                Per il DURC indica la <strong>data di scadenza</strong>: aggiorna in automatico il badge in alto.
              </p>
              {documenti.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun documento caricato.</p>
              ) : (
                <div className="space-y-2">
                  {documenti.map((doc) => {
                    const daysLeft = doc.data_scadenza
                      ? differenceInDays(parseISO(doc.data_scadenza), new Date())
                      : null;
                    return (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3 max-sm:px-2.5 max-sm:py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium max-sm:truncate max-sm:text-[13px]">
                            {TIPO_DOC_LABELS[doc.tipo]}
                            {doc.nome_file && <span className="text-muted-foreground ml-1">— {doc.nome_file}</span>}
                          </p>
                          {doc.data_scadenza && (
                            <p className={`text-xs mt-0.5 ${daysLeft === null ? 'text-muted-foreground' : daysLeft < 0 ? 'text-red-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              Scade: {format(parseISO(doc.data_scadenza), 'dd/MM/yyyy')}
                              {daysLeft !== null && (daysLeft < 0 ? ' (scaduto)' : daysLeft <= 30 ? ` (${daysLeft}gg)` : '')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                        <ImportaArchivioFascicolo fonte={doc} companyId={companyId} subId={id!} />
                        <Button variant="ghost" size="sm" onClick={() => openDocument(doc)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Elimina documento ${TIPO_DOC_LABELS[doc.tipo]}`}
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: 'Eliminare il documento?',
                                  description: `Il documento "${TIPO_DOC_LABELS[doc.tipo]}${doc.nome_file ? ` — ${doc.nome_file}` : ''}" verrà rimosso definitivamente dal subappaltatore.`,
                                  confirmLabel: 'Elimina',
                                  variant: 'destructive',
                                })
                              ) {
                                deleteDocumentMutation.mutate(doc);
                              }
                            }}
                            disabled={deleteDocumentMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documenti fascicolo (sola lettura) — da subappaltatori_documenti,
              legati all'anagrafica. Visure/DURC/accordi caricati in massa o dal
              modulo Sicurezza, resi accessibili anche da qui. */}
          {sub.campo_subappaltatore_id && documentiCompliance.length > 0 && (
            <Card>
              <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
                <CardTitle className="text-base flex items-center gap-2 max-sm:text-sm">
                  <FileText className="h-4 w-4 max-sm:hidden" /> Documenti caricati
                  <Badge variant="secondary" className="ml-1">{documentiCompliance.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="max-sm:p-3 max-sm:pt-0">
                <p className="text-xs text-muted-foreground mb-3 max-sm:hidden">
                  Documenti importati dall'anagrafica o dall'import massivo (modulo Sicurezza), in sola lettura.
                </p>
                <div className="space-y-2">
                  {documentiCompliance.map((doc) => {
                    const daysLeft = doc.scadenza
                      ? differenceInDays(parseISO(doc.scadenza), new Date())
                      : null;
                    return (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3 max-sm:px-2.5 max-sm:py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium max-sm:text-[13px]">
                            {COMPLIANCE_TIPO_LABELS[doc.tipo] ?? doc.tipo}
                          </p>
                          {doc.scadenza && (
                            <p className={`text-xs mt-0.5 ${daysLeft === null ? 'text-muted-foreground' : daysLeft < 0 ? 'text-red-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              Scade: {format(parseISO(doc.scadenza), 'dd/MM/yyyy')}
                              {daysLeft !== null && (daysLeft < 0 ? ' (scaduto)' : daysLeft <= 30 ? ` (${daysLeft}gg)` : '')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openComplianceDoc(doc.storage_path)}
                          aria-label="Apri documento"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 2: Lavori svolti ──────────────────────────────────────────── */}
        <TabsContent value="lavori" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-3">
          <LavoriSubappaltatore subId={id!}
            onApriCommessa={(oid) => {if (schedaCommessa) navigate(`/azienda/ordini/${oid}`); else setCommessaPopup(oid);}}
            onApriContratto={(cid) => { setContrattoSelId(cid); setContrattoDaAprire(cid); setTabAttiva('contratto'); }} />
        </TabsContent>

        {/* ─── Tab 2: Contratto ──────────────────────────────────────────────── */}
        <TabsContent value="contratto" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-3">
          <ContrattiSubappalto companyId={companyId} sub={sub} selezionatoId={contratto?.id ?? null} richiestaApertura={contrattoDaAprire} onAperturaGestita={() => setContrattoDaAprire(null)}
            onSeleziona={(cid) => setContrattoSelId(cid)}
            onApriContabilita={(cid) => {setContrattoDaAprire(null);setContrattoSelId(cid);setVistaContabilita('sal');setTabAttiva('contabilita');}} />
        </TabsContent>

        {/* ─── Tab 3: SAL Ricevuti ────────────────────────────────────────────── */}
        <TabsContent value="contabilita" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-3">
          <div className="rounded-xl border bg-background p-4 sm:p-5"><div className="mb-4"><h2 className="text-lg font-semibold">Contabilità dell’impresa</h2><p className="mt-1 text-sm text-muted-foreground">SAL, verbali e garanzie del contratto selezionato. Apri una scheda per consultare i dettagli.</p></div>
            {contratti.length > 0 && <SceltaContratto contratti={contratti} valore={contratto?.id ?? ''} onCambia={setContrattoSelId} />}
          </div>
          <Tabs value={vistaContabilita} onValueChange={setVistaContabilita}>
            <TabsList className="h-auto flex-wrap"><TabsTrigger value="sal">SAL e verbali</TabsTrigger><TabsTrigger value="ritenute">Ritenute</TabsTrigger>{permessi.canViewSubappaltatoriAmministrazione && <TabsTrigger value="mensili">Documenti mensili</TabsTrigger>}</TabsList>
            {permessi.canViewSubappaltatoriAmministrazione && <TabsContent value="mensili" className="mt-4">{caricoContratti ? <p className="text-sm text-muted-foreground">Caricamento contratti…</p> : erroreContratti ? <p role="alert" className="text-sm text-destructive">Contratti non disponibili. <Button variant="link" onClick={()=>void ricaricaContratti()}>Riprova</Button></p> : <DocumentiMensiliSub key={`${companyId}:${id}`} companyId={companyId} subId={id!} contratti={contratti}/>}</TabsContent>}
            <TabsContent value="sal" className="space-y-4 mt-4">
          <div className={`flex items-center justify-between gap-3 ${!contratto ? 'max-sm:hidden' : ''}`}><h3 className="text-sm font-semibold">SAL del contratto</h3>
            <Button
              size="sm"
              disabled={!contratto || !(permessi.canEditOrders && permessi.canViewSubappaltatoriAmministrazione && permessi.canViewCosts && !permessi.solaLettura) || salCaricamento || salErrore || salControlloBase}
              onClick={async () => {
                if (!contratto || salControlloBase) return;
                setSalControlloBase(true);
                try {
                  const {data, error} = await supabase.from('subappalto_quadri_lavori' as never).select('id').eq('company_id',companyId).eq('contratto_id',contratto.id).limit(1);
                  if (error) throw error;
                  if (data?.length) {
                    const completo = contratti.find(c => c.id === contratto.id);
                    if (!completo) throw Error('Contratto non disponibile');
                    setSalLavori(completo); return;
                  }
                } catch {
                  toast.error('Non è stato possibile verificare la base lavori. Riprova prima di registrare il SAL.');
                  return;
                } finally { setSalControlloBase(false); }

                setSalRichiestaId(crypto.randomUUID());
                setSalForm(f => ({ ...f, ritenuta_pct: contratto?.ritenuta_garanzia_pct != null ? contratto.ritenuta_garanzia_pct.toString() : '5', numero_sal: (Math.max(0, ...salList.map(s => s.numero_sal)) + 1).toString() }));
                setSalDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              {salControlloBase ? 'Apertura…' : 'Nuovo SAL'}
            </Button>
          </div>

          {!contratto && (
            <Alert className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200 max-sm:text-xs">
                Vai prima nel tab <strong>Contratti</strong> per creare il contratto di subappalto.
              </AlertDescription>
            </Alert>
          )}

          {salCaricamento ? <p role="status">Caricamento SAL…</p> : salErrore ? <p role="alert">SAL non disponibili. <Button variant="link" onClick={() => void ricaricaSal()}>Riprova</Button></p> : salList.length === 0 && contratto ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">Nessun SAL ricevuto ancora.</p>
              </CardContent>
            </Card>
          ) : (
            <SALContabilita key={`${companyId}:${contratto?.id}`} sal={salList} contratto={contratto?.numero_contratto || 'Contratto'}
              canWrite={permessi.canEditOrders && permessi.canViewSubappaltatoriAmministrazione && permessi.canViewCosts && !permessi.solaLettura}
              approvazioneInCorso={approvaSALMutation.isPending}
              onVerbale={setSalVerbale} onApprova={sid => approvaSALMutation.mutate(sid)} onContesta={setContestaId}
              onPagamento={setPaymentSAL} />
          )}
        </TabsContent>

        {/* ─── Tab 4: Ritenute & Pagamenti ──────────────────────────────────── */}
        <TabsContent value="ritenute" className="space-y-4 mt-4 max-sm:mt-3 max-sm:space-y-3">
          <p className="text-xs text-muted-foreground">Le ritenute seguono il contratto. Lo svincolo richiede un riferimento documentale e non registra un pagamento al subappaltatore.</p>
          {ritenuteLoading ? <p role="status" className="text-sm text-muted-foreground">Caricamento garanzie…</p> : ritenuteError ? <Alert variant="destructive"><AlertDescription>Registro garanzie non disponibile. <Button variant="outline" size="sm" onClick={() => void ricaricaRitenute()}>Riprova</Button></AlertDescription></Alert> : <>
          {salGaranziaDaRiconciliare.length > 0 && <Alert className="border-amber-400 bg-amber-50"><AlertTriangle className="h-4 w-4"/><AlertDescription>Registro da riconciliare per {salGaranziaDaRiconciliare.length} SAL: gli importi delle ritenute nei SAL non coincidono con le registrazioni di garanzia. I totali sotto descrivono soltanto il registro disponibile, non attestano il residuo effettivo. Verifica gli originali prima di registrare uno svincolo.</AlertDescription></Alert>}
          {ritenute.length === 0 ? <Card><CardContent className="py-8 text-center"><p className="text-sm font-medium">Nessuna ritenuta nel registro</p><p className="mt-2 text-sm text-muted-foreground">I nuovi SAL registrano la relativa garanzia. Per gli importi storici mancanti occorre verificare e riconciliare il registro.</p></CardContent></Card> :
            <RitenuteContabilita key={`${companyId}:${contratto?.id}`} ritenute={ritenute} sal={salList} contratto={contratto?.numero_contratto || 'Contratto'}
              canRelease={permessi.isAdmin && !permessi.solaLettura} onSvincola={setRitenutaDaSvincolare} onVerbale={setSalVerbale}/>}

          </>}
        </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* ── Dialog Anagrafica ─────────────────────────────────────────────── */}
      <Dialog open={anagraficaDialog} onOpenChange={setAnagraficaDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle><span className="max-sm:hidden">Modifica anagrafica subappaltatore</span><span className="sm:hidden">Modifica dati</span></DialogTitle>
            <DialogDescription className="max-sm:sr-only">Completa i dati fiscali, operativi e di contatto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 max-sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2 max-sm:col-span-2">
                <Label>Ragione sociale *</Label>
                <Input value={anagraficaForm.ragione_sociale} onChange={(e) => setAnagraficaForm(f => ({ ...f, ragione_sociale: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>P.IVA / C.F.</Label>
                <Input value={anagraficaForm.piva} onChange={(e) => setAnagraficaForm(f => ({ ...f, piva: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo lavori</Label>
                <Input value={anagraficaForm.tipo_lavori} onChange={(e) => setAnagraficaForm(f => ({ ...f, tipo_lavori: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Responsabile</Label>
                <Input value={anagraficaForm.responsabile} onChange={(e) => setAnagraficaForm(f => ({ ...f, responsabile: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefono</Label>
                <Input value={anagraficaForm.telefono} onChange={(e) => setAnagraficaForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={anagraficaForm.email} onChange={(e) => setAnagraficaForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>PEC</Label>
                <Input type="email" value={anagraficaForm.pec} onChange={(e) => setAnagraficaForm(f => ({ ...f, pec: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Codice Fiscale</Label>
                <Input value={anagraficaForm.codice_fiscale} onChange={(e) => setAnagraficaForm(f => ({ ...f, codice_fiscale: e.target.value }))} placeholder="Es. RSSMRA80A01H501U" />
              </div>
              <div className="space-y-1.5">
                <Label>Scadenza DURC</Label>
                <Input type="date" max={DATA_MASSIMA} value={anagraficaForm.durc_scadenza} onChange={(e) => setAnagraficaForm(f => ({ ...f, durc_scadenza: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 max-sm:col-span-2">
                <Label htmlFor="subappaltatore-dettaglio-indirizzo">Indirizzo sede</Label>
                <CampoIndirizzo id="subappaltatore-dettaglio-indirizzo" value={anagraficaForm.indirizzo} onChange={(v) => setAnagraficaForm(f => ({ ...f, indirizzo: v }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 max-sm:col-span-2">
                <Label>Note</Label>
                <Textarea value={anagraficaForm.note} onChange={(e) => setAnagraficaForm(f => ({ ...f, note: e.target.value }))} rows={3} className="max-sm:min-h-[60px]" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setAnagraficaDialog(false)} disabled={saveAnagraficaMutation.isPending}>Annulla</Button>
            <Button onClick={() => saveAnagraficaMutation.mutate()} disabled={saveAnagraficaMutation.isPending || !anagraficaForm.ragione_sociale.trim()}>
              {saveAnagraficaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva anagrafica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Documento ──────────────────────────────────────────────── */}
      <Dialog open={docDialog} onOpenChange={setDocDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Carica documento</DialogTitle>
            <DialogDescription className="max-sm:sr-only">DURC, visura, DVR, polizze, attestazioni o altri documenti del subappaltatore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo documento</Label>
              <Select value={docForm.tipo} onValueChange={(v) => setDocForm(f => ({ ...f, tipo: v as TipoDocumentoSub }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_DOC_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File *</Label>
              <Input type="file" onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                setDocFile(f);
                // DURC PDF: prova a leggere la "Scadenza validità" dal contenuto e
                // precompila la data (il parser matcha solo testo DURC → nessun
                // falso positivo su altri PDF).
                if (f && /pdf/i.test(f.type)) {
                  const iso = await extractDurcExpiryFromPdf(f);
                  if (iso) {
                    setDocForm((prev) => ({ ...prev, data_scadenza: prev.data_scadenza || iso }));
                    toast.success(`Scadenza DURC rilevata dal PDF: ${iso.split('-').reverse().join('/')}`);
                  }
                }
              }} />
              {docFile && <p className="text-xs text-muted-foreground">{docFile.name}</p>}
            </div>
            {/* Mobile: basta la scadenza (è quella che accende gli avvisi). */}
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div className="space-y-1.5 max-sm:hidden">
                <Label>Data rilascio</Label>
                <Input type="date" value={docForm.data_rilascio} onChange={(e) => setDocForm(f => ({ ...f, data_rilascio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Scadenza</Label>
                <Input type="date" max={DATA_MASSIMA} value={docForm.data_scadenza} onChange={(e) => setDocForm(f => ({ ...f, data_scadenza: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5 max-sm:hidden">
              <Label>Note</Label>
              <Textarea value={docForm.note} onChange={(e) => setDocForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="max-sm:hidden" onClick={() => setDocDialog(false)} disabled={uploadDocumentMutation.isPending}>Annulla</Button>
            <Button onClick={() => uploadDocumentMutation.mutate()} disabled={uploadDocumentMutation.isPending || !docFile}>
              {uploadDocumentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Carica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Importa documenti da ZIP ──────────────────────────────── */}
      <BulkDocumentiUploadDialog
        open={bulkDocDialog}
        onOpenChange={setBulkDocDialog}
        companyId={companyId}
        subappaltatoreId={id ?? ''}
      />

      {ritenutaDaSvincolare && <FiscalReleaseDialog key={ritenutaDaSvincolare} companyId={companyId} id={ritenutaDaSvincolare} onClose={() => setRitenutaDaSvincolare(null)} onReleased={async () => {
        await Promise.all([
          queryClient.invalidateQueries({queryKey:['ritenute-sub',contratto?.id]}),
          queryClient.invalidateQueries({queryKey:['ritenute-sub-tutte',id]}),
          queryClient.invalidateQueries({queryKey:['order-subcontract-statistics',contratto?.order_id,companyId]}),
        ]);
      }} />}
      {salLavori && <LavoriMisureSubDialog key={salLavori.id} companyId={companyId} contratto={salLavori} sezioneIniziale="sal" onApriStorico={() => setSalLavori(null)} onClose={() => setSalLavori(null)} onApriVerbale={async (salId) => {
        const {data,error} = await supabase.from('sal_subappaltatori').select('*').eq('company_id',companyId).eq('contratto_id',salLavori.id).eq('id',salId).single();
        if (error || !data) throw Error('SAL salvato, ma lettura del verbale non riuscita. Riprova.');
        setSalLavori(null); setSalVerbale(data as SALSubappaltatore);
      }} />}
      {commessaPopup && <SchedaCommessaDialog contestoOrigine="impresa" key={commessaPopup} companyId={companyId} orderId={commessaPopup} destinazione={{to:`/azienda/ordini/${commessaPopup}`}} onClose={() => setCommessaPopup(null)} />}
      {salVerbale && <VerbaleSalSubDialog key={`${companyId}:${salVerbale.id}`} companyId={companyId} sal={salVerbale} onClose={() => setSalVerbale(null)} />}
      {/* ── Dialog Pagamento SAL ──────────────────────────────────────────── */}
      {paymentSAL && <SalPaymentDialog key={paymentSAL.id} sal={paymentSAL} onClose={()=>setPaymentSAL(null)} onSaved={()=>{refreshFinancialQueries(queryClient);void queryClient.invalidateQueries({queryKey:chiaviContratti.salTutti(id)});setPaymentSAL(null);}} />}

      {/* Dialog contestazione SAL */}
      <Dialog open={!!contestaSALId} onOpenChange={() => { setContestaId(null); setContestaNote(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contesta SAL</DialogTitle>
            <DialogDescription className="max-sm:sr-only">Inserisci le motivazioni della contestazione.</DialogDescription>
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
            <Button variant="outline" className="max-sm:hidden" onClick={() => setContestaId(null)}>Annulla</Button>
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
            <Button variant="outline" className="max-sm:hidden" onClick={() => setSalDialog(false)} disabled={saveSalMutation.isPending}>Annulla</Button>
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
