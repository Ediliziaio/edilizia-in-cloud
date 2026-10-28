import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { createWizardQuoteChatTransport } from '@/lib/preventivi/wizardQuoteTransport';
import { createQuoteCadReader } from '@/lib/preventivi/quoteCadTransport';
import { createLocalQuoteAudioTransport, createQuoteAudioTransport } from '@/lib/preventivi/localQuoteAudioTransport';
import { consentiSimulazionePreventivoAi } from '@/lib/preventivi/localSimulation';
import { quoteChatReleaseFlag } from '@/lib/preventivi/quoteRollout';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import type { QuoteProject } from '@/lib/preventivi/quoteProject';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
import { cloneWizardDraft, type NativeComputoModule, type WizardAiChange } from '@/lib/preventivi/wizardAiDraft';
import { createWizardAiMemory, type WizardAiMemoryScope, type WizardAiSavedDraft, type WizardAiSnapshot } from '@/lib/preventivi/wizardAiMemory';
import './QuoteWizardAiDialog.css';

const Workspace = lazy(() => import('./dev/QuoteAssistedWorkspace'));
export type WizardAiReview = { changes: WizardAiChange[]; pending: number; error?: string };
export type QuoteWizardAiDialogProps = {
  title: string; companyId: string; open: boolean; onOpenChange: (open: boolean) => void;
  document: ChatDocument; project: QuoteProject; fingerprint: string;
  preview: (document: ChatDocument, chapters: Record<string, string>) => ReactNode;
  review: (document: ChatDocument, chapters: Record<string, string>) => WizardAiReview;
  onApply: (document: ChatDocument, chapters: Record<string, string>) => void | Promise<void>;
  chapters?: boolean;
  /** Il listino aziendale del modulo come fonte di prezzi della chat (id riservato di quoteListinoSource). */
  listinoSourceId?: string;
  commercial?: { draft: QuoteDraft; defaultVat: number | null; module?: NativeComputoModule };
};

export function QuoteWizardAiIssue({ open, onOpenChange, message }: { open: boolean; onOpenChange: (open: boolean) => void; message: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogTitle>Bozza AI non disponibile</DialogTitle><DialogDescription>Il preventivo originale non è stato modificato.</DialogDescription><p role="alert" className="text-sm text-orange-800">{message}</p><Button onClick={() => onOpenChange(false)}>Torna al wizard</Button></DialogContent></Dialog>;
}

/** Restore only this account/company/quote revision, never a simulation's draft. */
export default function QuoteWizardAiDialog(props: QuoteWizardAiDialogProps) {
  const { user } = useAuth();
  const [initialSeed] = useState(() => cloneWizardDraft({ document: props.document, project: props.project, fingerprint: props.fingerprint, companyId: props.companyId }));
  const [memory] = useState(() => createWizardAiMemory());
  const [scope] = useState<WizardAiMemoryScope>(() => ({ ownerId: user?.id ?? '', companyId: props.companyId,
    path: JSON.stringify([window.location.pathname, props.title, initialSeed.fingerprint]) }));
  const [loaded, setLoaded] = useState<{ saved: WizardAiSavedDraft | null; issue?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void memory.load(scope).then(saved => {
      if (saved && saved.fingerprint !== initialSeed.fingerprint) throw new Error('Revisione della bozza non coerente.');
      if (active) setLoaded({ saved });
    }).catch(() => {
      if (active) setLoaded({ saved: null, issue: 'Non riesco a leggere la memoria di questo browser. Puoi continuare a lavorare, ma non salvare e chiudere finché non è disponibile.' });
    });
    return () => { active = false; };
  }, [memory, scope, initialSeed]);
  if (!loaded) return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent><DialogTitle>Silvio AI · {props.title}</DialogTitle><DialogDescription>Recupero la bozza di lavoro…</DialogDescription></DialogContent></Dialog>;
  return <WizardAiSession {...props} initialSeed={initialSeed} memory={memory} scope={scope} saved={loaded.saved} storageIssue={loaded.issue} />;
}

/** Native autosave remains outside: saving the conversation never applies quote rows. */
function WizardAiSession(props: QuoteWizardAiDialogProps & { initialSeed: { document: ChatDocument; project: QuoteProject; fingerprint: string; companyId: string }; memory: ReturnType<typeof createWizardAiMemory>; scope: WizardAiMemoryScope; saved: WizardAiSavedDraft | null; storageIssue?: string }) {
  const { effectiveCompany, user } = useAuth();
  const ownerId = props.scope.ownerId || null;
  const seed = props.initialSeed;
  const [document, setDocument] = useState(props.saved?.snapshot.document ?? seed.document);
  const [busy, setBusy] = useState(false);
  const [chapters, setChapters] = useState<Record<string, string>>(props.saved?.chapters ?? {});
  const [reviewing, setReviewing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [closeError, setCloseError] = useState('');
  const snapshotRef = useRef<WizardAiSnapshot | null>(props.saved);
  const revisionRef = useRef(props.saved?.revision ?? null);
  const savingRef = useRef(false);
  const receiveSnapshot = useCallback((state: WizardAiSnapshot) => { snapshotRef.current = state; }, []);
  const applyingRef = useRef(false);
  const receive = useCallback((next: ChatDocument, pending: boolean) => { setDocument(next); setBusy(pending); }, []);
  const endpoint = (import.meta.env.VITE_QUOTE_CHAT_LOCAL_ENDPOINT as string | undefined) ?? `${window.location.origin}/functions/v1/ai-preventivo-conversazione`;
  const getToken = useCallback(async () => {
    if (!ownerId) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user.id === ownerId ? session.access_token : null;
  }, [ownerId]);
  const transport = useMemo(() => createWizardQuoteChatTransport({ localEndpoint: endpoint,
    backendUrl: import.meta.env.VITE_SUPABASE_URL, companyId: props.companyId, dev: import.meta.env.DEV,
    hostname: window.location.hostname, productionEnabled: quoteChatReleaseFlag(), getToken,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }), [endpoint, getToken, props.companyId]);
  const transcribe = useMemo(() => consentiSimulazionePreventivoAi(import.meta.env.DEV, window.location.hostname, props.companyId)
    ? createLocalQuoteAudioTransport({ endpoint, companyId: props.companyId, getToken,
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }) : createQuoteAudioTransport({backendUrl:import.meta.env.VITE_SUPABASE_URL,companyId:props.companyId,getToken,publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}), [endpoint, getToken, props.companyId]);
  const cadReader = useMemo(() => createQuoteCadReader({ companyId: props.companyId, dev: import.meta.env.DEV, hostname: window.location.hostname,
    enabled: import.meta.env.VITE_QUOTE_CAD_ENABLED, endpoint: import.meta.env.VITE_QUOTE_CAD_ENDPOINT, getToken }), [props.companyId, getToken]);
  const identityChanged = effectiveCompany?.id !== seed.companyId || props.companyId !== seed.companyId || (user?.id ?? null) !== ownerId;
  const conflict = identityChanged || seed.fingerprint !== props.fingerprint;
  let review: WizardAiReview;
  try { review = props.review(document, chapters); }
  catch (e) {
    // A temporarily empty chapter must NOT unmount its own correction field.
    let fallback: WizardAiReview = { changes: [], pending: 0 };
    try { fallback = props.review(document, {}); } catch { /* Other validation errors stay visible below. */ }
    review = { ...fallback, error: e instanceof Error ? e.message : 'Bozza non applicabile.' };
  }
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const close = () => { if (!applyingRef.current && !savingRef.current) { setCloseError(''); setClosing(true); } };
  const finishClose = async (save: boolean) => {
    if (savingRef.current || applyingRef.current || save && (conflict || busy)) return;
    savingRef.current = true; setSaving(true); setCloseError('');
    try {
      if (save) {
        if (props.storageIssue && await props.memory.load(props.scope))
          throw new Error('La memoria è di nuovo disponibile e contiene una bozza. Non la sovrascrivo: chiudi e riapri Silvio AI per riprenderla.');
        if (!snapshotRef.current) throw new Error('La chat si sta preparando. Attendi un momento e riprova.');
        const saved = await props.memory.save(props.scope, revisionRef.current, seed.fingerprint, snapshotRef.current, chapters);
        revisionRef.current = saved.revision;
        if (conflictRef.current) throw new Error('Account o preventivo cambiato durante il salvataggio. La copia precedente resta separata.');
      }
      props.onOpenChange(false);
    } catch (e) { setCloseError(e instanceof Error ? e.message : 'Salvataggio non riuscito. La chat resta aperta: riprova.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const apply = async () => {
    if (applyingRef.current || conflict || busy || review.error || !review.changes.length) return;
    applyingRef.current = true; setApplying(true); setError('');
    try {
      await props.onApply(cloneWizardDraft(document), { ...chapters });
      // The applied draft is no longer a resumable AI proposal. Its fingerprint
      // is obsolete; cleanup failure must never repeat the native write.
      if (revisionRef.current) await props.memory.remove(props.scope, revisionRef.current).catch(() => {});
      props.onOpenChange(false);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Nessuna modifica applicata.'); }
    finally { applyingRef.current = false; setApplying(false); }
  };
  return <Dialog open={props.open} onOpenChange={open => { if (!open) close(); }}><DialogContent className="quote-wizard-ai-dialog top-[50%] p-0" onInteractOutside={e => e.preventDefault()}>
    <header className="quote-wizard-ai-title"><div><DialogTitle>Silvio AI <span>· {props.title}</span></DialogTitle><DialogDescription>Stesso preventivo, stesso modello. Le modifiche restano separate fino alla conferma.</DialogDescription></div><span className="quote-wizard-ai-badge">Bozza di lavoro</span></header>
    {conflict ? <div role="alert" className="quote-wizard-ai-alert">{identityChanged ? 'L’account o l’azienda attiva è cambiata.' : 'Il preventivo è cambiato mentre lavoravi qui.'} Chiudi e riapri Silvio AI per ripartire dai dati aggiornati. Nessuna modifica verrà applicata.</div> :
    <fieldset disabled={applying || saving} className="quote-wizard-ai-body min-w-0"><Suspense fallback={<p role="status" className="p-8">Preparo chat e modello del preventivo…</p>}><Workspace companyId={props.companyId} companyName={effectiveCompany?.name} simulated={false}
      transport={transport} transcribeAudio={transcribe} cadReader={cadReader} onBack={close}
      embedded={{ title: props.title, document: seed.document, project: seed.project, initial: props.saved ?? undefined, onSnapshot: receiveSnapshot, savedLocally: !!props.saved, commercial: props.commercial, fixedSourceId: props.listinoSourceId, onChange: receive, preview: document => props.preview(document, chapters) }} /></Suspense></fieldset>}
    {reviewing && !conflict && <section className="quote-wizard-ai-review" aria-label="Riepilogo modifiche prima di applicare"><h3>Controlla cosa cambia nel wizard</h3>
      {review.error && <p role="alert">{review.error}</p>}
      <ul>{review.changes.map(change => <li key={change.id}><span className={`quote-change-${change.kind}`}>{change.kind}</span><div className="min-w-0 flex-1"><strong>{change.title}</strong><p className="mt-1 text-xs text-slate-500">{change.before && <>Prima: {change.before.quantity} {change.before.unit} × {formatCurrency(change.before.price)}</>}{change.before && change.after && ' → '}{change.after && <>Dopo: {change.after.quantity} {change.after.unit} × {formatCurrency(change.after.price)}</>}</p></div>
        {props.chapters && change.kind !== 'esclusione' ? <label>Capitolo<input aria-label={`Capitolo di ${change.title}`} maxLength={200} value={chapters[change.id] ?? change.chapter} onChange={e => setChapters(value => ({ ...value, [change.id]: e.target.value }))} /></label> : <small>{change.chapter}</small>}</li>)}</ul>
      {!!review.pending && <p>{review.pending} nuove proposte incomplete o non confermate restano fuori dal computo.</p>}
    </section>}
    {error && <p role="alert" className="quote-wizard-ai-alert">{error}</p>}
    {!reviewing && review.error && <p role="alert" className="quote-wizard-ai-alert">{review.error}</p>}
    <footer className="quote-wizard-ai-footer"><p>{busy ? 'Silvio sta lavorando…' : `${review.changes.length} modifiche da rivedere${review.pending ? ` · ${review.pending} ${review.pending === 1 ? 'voce da completare o confermare' : 'voci da completare o confermare'}: nella scheda «Voci del preventivo» inserisci quantità e prezzo mancanti e spunta «Inclusa»` : ""}`}</p><Button variant="outline" disabled={applying || saving} onClick={close}>Chiudi</Button>{reviewing && <Button variant="ghost" disabled={applying || saving} onClick={() => setReviewing(false)}>Torna alla chat</Button>}<Button disabled={conflict || busy || applying || saving || !!review.error || !review.changes.length} onClick={() => reviewing ? void apply() : setReviewing(true)}>{applying ? 'Applico…' : reviewing ? 'Conferma e applica al preventivo' : 'Rivedi e applica'}</Button></footer>
    <AlertDialog open={closing} onOpenChange={open => { if (!savingRef.current) setClosing(open); }}>
      <AlertDialogContent className="z-[60] max-w-xl rounded-2xl">
        <AlertDialogTitle>Vuoi salvare il lavoro con Silvio AI?</AlertDialogTitle>
        <AlertDialogDescription>Salva chat, voci di lavoro, planimetria e dossier in questo browser per riprenderli sullo stesso preventivo. Chiudendo senza salvare perdi solo le modifiche successive all’ultimo salvataggio. Il preventivo nel gestionale resta invariato: per aggiornarlo usa «Rivedi e applica».</AlertDialogDescription>
        {busy && <p role="status" className="text-sm text-slate-600">Silvio sta ancora lavorando. Attendi per salvare, oppure chiudi senza salvare per interrompere la richiesta.</p>}
        {conflict && <p role="status" className="text-sm text-orange-800">Account, azienda o preventivo cambiato: salvataggio disabilitato per non mescolare i dati.</p>}
        {closeError && <p role="alert" className="text-sm text-red-700">{closeError}</p>}
        <div className="flex flex-wrap justify-end gap-2 [&>button]:rounded-xl">
          <AlertDialogCancel disabled={saving}>Continua a lavorare</AlertDialogCancel>
          <Button variant="ghost" className="text-red-700" disabled={saving} onClick={() => void finishClose(false)}>Chiudi senza salvare</Button>
          <Button disabled={saving || conflict || busy} onClick={() => void finishClose(true)}>{saving ? 'Chiusura…' : 'Salva e chiudi'}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </DialogContent></Dialog>;
}
