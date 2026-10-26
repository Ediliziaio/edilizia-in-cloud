import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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

/** Only mounted while open: closing aborts requests and discards its isolated draft.
 * Native autosave is deliberately outside this component, invoked only by onApply. */
export default function QuoteWizardAiDialog(props: QuoteWizardAiDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const [ownerId] = useState(user?.id ?? null);
  const [seed] = useState(() => cloneWizardDraft({ document: props.document, project: props.project, fingerprint: props.fingerprint, companyId: props.companyId }));
  const [document, setDocument] = useState(seed.document);
  const [busy, setBusy] = useState(false);
  const [chapters, setChapters] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
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
  const close = () => { if (!applyingRef.current) setClosing(true); };
  const apply = async () => {
    if (applyingRef.current || conflict || busy || review.error || !review.changes.length) return;
    applyingRef.current = true; setApplying(true); setError('');
    try { await props.onApply(cloneWizardDraft(document), { ...chapters }); props.onOpenChange(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nessuna modifica applicata.'); }
    finally { applyingRef.current = false; setApplying(false); }
  };
  return <Dialog open={props.open} onOpenChange={open => { if (!open) close(); }}><DialogContent className="quote-wizard-ai-dialog top-[50%] p-0" onInteractOutside={e => e.preventDefault()}>
    <header className="quote-wizard-ai-title"><div><DialogTitle>Silvio AI <span>· {props.title}</span></DialogTitle><DialogDescription>Stesso preventivo, stesso modello. Le modifiche restano separate fino alla conferma.</DialogDescription></div><span className="quote-wizard-ai-badge">Bozza di lavoro</span></header>
    {conflict ? <div role="alert" className="quote-wizard-ai-alert">{identityChanged ? 'L’account o l’azienda attiva è cambiata.' : 'Il preventivo è cambiato mentre lavoravi qui.'} Chiudi e riapri Silvio AI per ripartire dai dati aggiornati. Nessuna modifica verrà applicata.</div> :
    <fieldset disabled={applying} className="quote-wizard-ai-body min-w-0"><Suspense fallback={<p role="status" className="p-8">Preparo chat e modello del preventivo…</p>}><Workspace companyId={props.companyId} companyName={effectiveCompany?.name} simulated={false}
      transport={transport} transcribeAudio={transcribe} cadReader={cadReader} onBack={close}
      embedded={{ title: props.title, document: seed.document, project: seed.project, commercial: props.commercial, fixedSourceId: props.listinoSourceId, onChange: receive, preview: document => props.preview(document, chapters) }} /></Suspense></fieldset>}
    {reviewing && !conflict && <section className="quote-wizard-ai-review" aria-label="Riepilogo modifiche prima di applicare"><h3>Controlla cosa cambia nel wizard</h3>
      {review.error && <p role="alert">{review.error}</p>}
      <ul>{review.changes.map(change => <li key={change.id}><span className={`quote-change-${change.kind}`}>{change.kind}</span><div className="min-w-0 flex-1"><strong>{change.title}</strong><p className="mt-1 text-xs text-slate-500">{change.before && <>Prima: {change.before.quantity} {change.before.unit} × {formatCurrency(change.before.price)}</>}{change.before && change.after && ' → '}{change.after && <>Dopo: {change.after.quantity} {change.after.unit} × {formatCurrency(change.after.price)}</>}</p></div>
        {props.chapters && change.kind !== 'esclusione' ? <label>Capitolo<input aria-label={`Capitolo di ${change.title}`} maxLength={200} value={chapters[change.id] ?? change.chapter} onChange={e => setChapters(value => ({ ...value, [change.id]: e.target.value }))} /></label> : <small>{change.chapter}</small>}</li>)}</ul>
      {!!review.pending && <p>{review.pending} nuove proposte incomplete o non confermate restano fuori dal computo.</p>}
    </section>}
    {error && <p role="alert" className="quote-wizard-ai-alert">{error}</p>}
    {!reviewing && review.error && <p role="alert" className="quote-wizard-ai-alert">{review.error}</p>}
    <footer className="quote-wizard-ai-footer">{closing ? <><p>Chiudere senza applicare? Il preventivo originale resta invariato.</p><Button variant="outline" onClick={() => setClosing(false)}>Continua a lavorare</Button><Button variant="destructive" onClick={() => props.onOpenChange(false)}>Scarta e chiudi</Button></> : <><p>{busy ? 'Silvio sta lavorando…' : `${review.changes.length} modifiche da rivedere${review.pending ? ` · ${review.pending} ${review.pending === 1 ? 'voce da completare o confermare' : 'voci da completare o confermare'}: nella scheda «Voci del preventivo» inserisci quantità e prezzo mancanti e spunta «Inclusa»` : ""}`}</p><Button variant="outline" disabled={applying} onClick={close}>Chiudi</Button>{reviewing && <Button variant="ghost" disabled={applying} onClick={() => setReviewing(false)}>Torna alla chat</Button>}<Button disabled={conflict || busy || applying || !!review.error || !review.changes.length} onClick={() => reviewing ? void apply() : setReviewing(true)}>{applying ? 'Applico…' : reviewing ? 'Conferma e applica al preventivo' : 'Rivedi e applica'}</Button></>}</footer>
  </DialogContent></Dialog>;
}
