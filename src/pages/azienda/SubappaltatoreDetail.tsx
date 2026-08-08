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
  ArrowLeft, HardHat, FileText, Euro, Loader2, Plus, AlertTriangle, CheckCircle2, ExternalLink,
  Check, Upload, Trash2, BriefcaseBusiness, CreditCard, Mail, MapPin, Link2, Link2Off, FileArchive,
} from 'lucide-react';
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? '';
  const queryClient = useQueryClient();
  const confirm = useConfirm();

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
      const { data, error } = await (supabase as any)
        .from('contratti_subappalto')
        .select('*')
        .eq('subappaltatore_id', id!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
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
  const { data: lavoroCollegato } = useQuery({
    queryKey: ['subappaltatore-lavoro', sub?.order_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, description, client_name, client_company, total_amount, status, work_start_date, work_end_date, created_at')
        .eq('id', sub!.order_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!sub?.order_id,
  });

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
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Imposta/aggiorna SOLO la scadenza DURC sulla scheda (badge in alto si aggiorna).
  const setDurcMutation = useMutation({
    mutationFn: async (date: string) => {
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
        if (error) throw new Error(error.message || error.details || error.hint || "Errore");
      } else {
        const { error } = await (supabase as any)
          .from('contratti_subappalto')
          .insert(payload);
        if (error) throw new Error(error.message || error.details || error.hint || "Errore");
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

  // DURC bloccante: senza documento valido niente nuovi SAL e niente
  // pagamenti. Gli alert c'erano già ma erano solo grafica — e il sito
  // promette il "blocco automatico con DURC non valido".
  const durcBloccante = (): string | null => {
    const scad = sub?.durc_scadenza ?? null;
    if (!scad) return 'DURC mancante: carica il DURC con la data di scadenza prima di procedere.';
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    if (new Date(scad) < oggi) {
      return `DURC scaduto il ${new Date(scad).toLocaleDateString('it-IT')}: rinnovalo prima di procedere.`;
    }
    return null;
  };

  const saveSalMutation = useMutation({
    mutationFn: async () => {
      if (!contratto?.id) throw new Error('Contratto non trovato');
      const bloccoDurc = durcBloccante();
      if (bloccoDurc) throw new Error(bloccoDurc);
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
      if (error) throw new Error(error.message || error.details || error.hint || "Errore");
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
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore durante l'approvazione"),
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
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore durante la contestazione"),
  });

  // ── Registra pagamento SAL ───────────────────────────────────────────────
  const [paymentSAL, setPaymentSAL] = useState<SALSubappaltatore | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'bonifico',
    payment_reference: '',
  });

  const registraPagamentoMutation = useMutation({
    mutationFn: async () => {
      if (!paymentSAL) throw new Error('SAL non selezionato');
      const bloccoDurc = durcBloccante();
      if (bloccoDurc) throw new Error(bloccoDurc);
      const { error } = await (supabase as any)
        .from('sal_subappaltatori')
        .update({
          stato: 'pagato',
          data_pagamento: paymentForm.data_pagamento || format(new Date(), 'yyyy-MM-dd'),
          payment_method: paymentForm.payment_method || null,
          payment_reference: paymentForm.payment_reference.trim() || null,
        })
        .eq('id', paymentSAL.id);
      if (error) throw new Error(error.message || error.details || error.hint || 'Errore');
    },
    onSuccess: () => {
      toast.success('Pagamento registrato');
      queryClient.invalidateQueries({ queryKey: ['sal-sub', contratto?.id] });
      queryClient.invalidateQueries({ queryKey: ['subappaltatori-page', companyId] });
      setPaymentSAL(null);
      setPaymentForm({ data_pagamento: format(new Date(), 'yyyy-MM-dd'), payment_method: 'bonifico', payment_reference: '' });
    },
    onError: (err: Error) => toast.error(err.message),
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
  const totalePagato = salList.filter((s) => s.stato === 'pagato').reduce((a, s) => a + (Number(s.importo_netto) || 0), 0);
  const totaleDaPagare = salList.filter((s) => s.stato !== 'pagato' && s.stato !== 'contestato').reduce((a, s) => a + (Number(s.importo_netto) || 0), 0);
  const ritenuteTrattenute = ritenute.filter(r => r.stato === 'trattenuta');
  const pct = contratto && contratto.importo_contrattuale > 0
    ? Math.min(100, Math.round((totaleLordo / contratto.importo_contrattuale) * 100))
    : 0;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/azienda/subappaltatori')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{sub.ragione_sociale}</h1>
              <p className="text-sm text-muted-foreground">{sub.tipo_lavori ?? 'Subappaltatore'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                {sub.piva && <span>P.IVA {sub.piva}</span>}
                {sub.indirizzo && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{sub.indirizzo}</span>}
                {sub.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sub.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasAppCantiere ? (
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                <Link2 className="mr-1 h-3 w-3" />
                {appCantiere?.user_id ? 'Account app cantiere attivo' : 'Anagrafica app cantiere collegata'}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <Link2Off className="mr-1 h-3 w-3" />
                App cantiere non collegata
              </Badge>
            )}
            <DurcBadge scadenza={effectiveDurc} hasDoc={hasDurcDoc} />
            {!hasAppCantiere && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => collegaCampoMutation.mutate()}
                disabled={collegaCampoMutation.isPending}
              >
                {collegaCampoMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-1.5 h-4 w-4" />
                )}
                Collega app cantiere
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={openAnagraficaDialog}>
              Modifica
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="anagrafica">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="anagrafica" className="text-xs py-2">
            <span className="hidden sm:inline">Anagrafica</span>
            <span className="sm:hidden">Dati</span>
          </TabsTrigger>
          <TabsTrigger value="lavori" className="text-xs py-2">Lavori</TabsTrigger>
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
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Account app cantiere</p>
                    <p className="text-xs text-muted-foreground">
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
                      onClick={() => collegaCampoMutation.mutate()}
                      disabled={collegaCampoMutation.isPending}
                    >
                      <Link2 className="mr-1.5 h-4 w-4" />
                      Collega app cantiere
                    </Button>
                  )}
                </div>
              </div>
              {[
                { label: 'Ragione sociale', value: sub.ragione_sociale },
                { label: 'P.IVA', value: sub.piva },
                { label: 'Codice Fiscale', value: sub.codice_fiscale },
                { label: 'Indirizzo', value: sub.indirizzo },
                { label: 'Responsabile', value: sub.responsabile },
                { label: 'Telefono', value: sub.telefono },
                { label: 'Email', value: sub.email },
                { label: 'PEC', value: sub.pec },
                { label: 'Tipo lavori', value: sub.tipo_lavori },
                { label: 'Note', value: sub.note },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex gap-3">
                  <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
                  <span className="text-sm font-medium">{value}</span>
                </div>
              ) : null)}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground w-32 shrink-0">Scadenza DURC</span>
                <DurcBadge scadenza={effectiveDurc} hasDoc={hasDurcDoc} />
                {!effectiveDurc && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
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

          {/* Documenti */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documenti idoneità
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setBulkDocDialog(true)}>
                    <FileArchive className="h-4 w-4 mr-1.5" />
                    Importa ZIP
                  </Button>
                  <Button size="sm" onClick={() => setDocDialog(true)}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    Carica documento
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
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
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium">
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
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documenti caricati
                  <Badge variant="secondary" className="ml-1">{documentiCompliance.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Documenti importati dall'anagrafica o dall'import massivo (modulo Sicurezza), in sola lettura.
                </p>
                <div className="space-y-2">
                  {documentiCompliance.map((doc) => {
                    const daysLeft = doc.scadenza
                      ? differenceInDays(parseISO(doc.scadenza), new Date())
                      : null;
                    return (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
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
        <TabsContent value="lavori" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">SAL eseguiti</p>
                <p className="text-xl font-bold">€{totaleLordo.toLocaleString('it-IT')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pagato</p>
                <p className="text-xl font-bold text-green-600">€{totalePagato.toLocaleString('it-IT')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Da pagare</p>
                <p className="text-xl font-bold text-amber-600">€{totaleDaPagare.toLocaleString('it-IT')}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BriefcaseBusiness className="h-4 w-4" />
                Commessa collegata
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!lavoroCollegato ? (
                <p className="text-sm text-muted-foreground">Nessuna commessa collegata. Associa il subappaltatore a una commessa per tracciare lavori e costi.</p>
              ) : (
                <div className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {lavoroCollegato.order_code ? `${lavoroCollegato.order_code} · ` : ''}
                        {lavoroCollegato.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lavoroCollegato.client_company || lavoroCollegato.client_name || 'Cliente non indicato'}
                      </p>
                      {(lavoroCollegato.work_start_date || lavoroCollegato.work_end_date) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {lavoroCollegato.work_start_date ? `Inizio ${format(parseISO(lavoroCollegato.work_start_date), 'dd/MM/yyyy')}` : 'Inizio non impostato'}
                          {' · '}
                          {lavoroCollegato.work_end_date ? `Fine ${format(parseISO(lavoroCollegato.work_end_date), 'dd/MM/yyyy')}` : 'Fine non impostata'}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <Badge variant="outline">{lavoroCollegato.status || 'stato non indicato'}</Badge>
                      <p className="mt-2 text-sm font-semibold">€{Number(lavoroCollegato.total_amount ?? 0).toLocaleString('it-IT')}</p>
                    </div>
                  </div>
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
                    {sal.stato === 'pagato' && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                        <p className="font-medium flex items-center gap-1">
                          <CreditCard className="h-3.5 w-3.5" />
                          Pagato {sal.data_pagamento ? `il ${format(parseISO(sal.data_pagamento), 'dd/MM/yyyy')}` : ''}
                        </p>
                        {(sal.payment_method || sal.payment_reference) && (
                          <p className="mt-1">
                            {sal.payment_method ? `Metodo: ${sal.payment_method}` : ''}
                            {sal.payment_reference ? ` · Rif: ${sal.payment_reference}` : ''}
                          </p>
                        )}
                      </div>
                    )}
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
                    {(sal.stato === 'ricevuto' || sal.stato === 'verificato') && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setPaymentSAL(sal);
                            setPaymentForm({
                              data_pagamento: format(new Date(), 'yyyy-MM-dd'),
                              payment_method: sal.payment_method || 'bonifico',
                              payment_reference: sal.payment_reference || '',
                            });
                          }}
                        >
                          <CreditCard className="h-3 w-3 mr-1" />
                          Registra pagamento
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
                            <p className={`text-xs mt-0.5 ${daysToSvincolo === null ? 'text-muted-foreground' : daysToSvincolo < 0 ? 'text-red-600' : daysToSvincolo <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              Svincolo previsto: {format(parseISO(rit.data_svincolo_prevista), 'dd/MM/yyyy')}
                              {daysToSvincolo !== null && (daysToSvincolo < 0 ? ' (in ritardo)' : daysToSvincolo <= 30 ? ` (${daysToSvincolo}gg)` : '')}
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

      {/* ── Dialog Anagrafica ─────────────────────────────────────────────── */}
      <Dialog open={anagraficaDialog} onOpenChange={setAnagraficaDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica anagrafica subappaltatore</DialogTitle>
            <DialogDescription>Completa i dati fiscali, operativi e di contatto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
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
                <Input type="date" value={anagraficaForm.durc_scadenza} onChange={(e) => setAnagraficaForm(f => ({ ...f, durc_scadenza: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Indirizzo sede</Label>
                <Input value={anagraficaForm.indirizzo} onChange={(e) => setAnagraficaForm(f => ({ ...f, indirizzo: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Note</Label>
                <Textarea value={anagraficaForm.note} onChange={(e) => setAnagraficaForm(f => ({ ...f, note: e.target.value }))} rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnagraficaDialog(false)} disabled={saveAnagraficaMutation.isPending}>Annulla</Button>
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
            <DialogDescription>DURC, visura, DVR, polizze, attestazioni o altri documenti del subappaltatore.</DialogDescription>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data rilascio</Label>
                <Input type="date" value={docForm.data_rilascio} onChange={(e) => setDocForm(f => ({ ...f, data_rilascio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Scadenza</Label>
                <Input type="date" value={docForm.data_scadenza} onChange={(e) => setDocForm(f => ({ ...f, data_scadenza: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={docForm.note} onChange={(e) => setDocForm(f => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocDialog(false)} disabled={uploadDocumentMutation.isPending}>Annulla</Button>
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

      {/* ── Dialog Pagamento SAL ──────────────────────────────────────────── */}
      <Dialog open={!!paymentSAL} onOpenChange={() => setPaymentSAL(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registra pagamento SAL</DialogTitle>
            <DialogDescription>
              {paymentSAL ? `Netto da pagare: €${paymentSAL.importo_netto.toLocaleString('it-IT')}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Data pagamento</Label>
              <Input type="date" value={paymentForm.data_pagamento} onChange={(e) => setPaymentForm(f => ({ ...f, data_pagamento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Modalità pagamento</Label>
              <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonifico">Bonifico</SelectItem>
                  <SelectItem value="assegno">Assegno</SelectItem>
                  <SelectItem value="contanti">Contanti</SelectItem>
                  <SelectItem value="rimessa_diretta">Rimessa diretta</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Riferimento pagamento</Label>
              <Input value={paymentForm.payment_reference} onChange={(e) => setPaymentForm(f => ({ ...f, payment_reference: e.target.value }))} placeholder="CRO, distinta, note pagamento..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentSAL(null)} disabled={registraPagamentoMutation.isPending}>Annulla</Button>
            <Button onClick={() => registraPagamentoMutation.mutate()} disabled={registraPagamentoMutation.isPending}>
              {registraPagamentoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Segna pagato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
