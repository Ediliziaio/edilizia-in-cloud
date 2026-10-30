/**
 * L'elenco unico «Documenti da confermare»: le bozze che l'AI ha letto dagli allegati
 * delle email e che aspettano una persona (30/10/2026).
 *
 * Prima la bozza si vedeva solo aprendo la singola email: 158 ferme, nessuna confermata.
 * Qui sono tutte insieme, la più recente per prima. Una riga dice fornitore, tipo, numero,
 * data e importo; toccandola si apre la stessa scheda del pannello dell'email (DraftCard con
 * Apri PDF, Conferma, Scarta, carico di magazzino, scadenza), senza duplicarla.
 *
 * I documenti di tipo «altro» (listini, brochure, moduli) stanno in fondo, chiusi, e si
 * scartano in blocco: non entrano nel numero che compare in home.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, Loader2, Mail } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useDocumentiDaConfermare, useScartaDocumentiEstratti, type DocumentoDaConfermare } from "@/lib/email-ai/hooks";
import {
  dividiPerTipo,
  etaBozza,
  mittenteEmail,
  riepilogoBozza,
  sottotitoloBozza,
} from "@/lib/email-ai/documentiDaConfermare";
import { CarichiSection, DraftCard, ScadenzeSection } from "./DocumentoEstrattoPanel";

function Dettaglio({ doc }: { doc: DocumentoDaConfermare }) {
  const mittente = mittenteEmail(doc.email);
  const thread = doc.email?.thread_id;
  return (
    <div className="space-y-2 pt-2">
      <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <Mail className="h-3 w-3 shrink-0" aria-hidden />
        {doc.email ? (
          <>
            <span className="min-w-0 max-w-full truncate">{doc.email.subject?.trim() || "(senza oggetto)"}</span>
            {mittente && <span className="truncate">· {mittente}</span>}
          </>
        ) : (
          <span>Documento arrivato senza email</span>
        )}
        {thread && (
          <Link to={`/azienda/email?thread_id=${encodeURIComponent(thread)}`} className="tap-compact py-0.5 font-medium text-primary underline underline-offset-2">
            Apri email
          </Link>
        )}
      </p>
      <DraftCard draft={doc} emailId={doc.email_id} />
      {/* Carico di magazzino e scadenza nascono da questa bozza e si confermano qui sotto. */}
      <CarichiSection documentoId={doc.id} emailId={doc.email_id} />
      <ScadenzeSection documentoId={doc.id} emailId={doc.email_id} />
    </div>
  );
}

function Riga({ doc, aperta, onToggle }: { doc: DocumentoDaConfermare; aperta: boolean; onToggle: () => void }) {
  const r = riepilogoBozza(doc);
  const mittente = mittenteEmail(doc.email);
  return (
    <li className="px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aperta}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-slate-900">{r.fornitore ?? "Fornitore non letto"}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{sottotitoloBozza(doc)}</span>
          {/* Da telefono basta la riga di sopra: mittente ed età stanno nel dettaglio. */}
          <span className="block truncate text-[11px] text-muted-foreground max-sm:hidden">
            {[mittente ? `da ${mittente}` : null, etaBozza(doc.created_at)].filter(Boolean).join(" · ")}
          </span>
        </span>
        {/* Solo ciò che c'è: una bolla non ha un importo, e un trattino non dice niente. */}
        {(r.totale !== null || r.incerti > 0) && (
          <span className="shrink-0 text-right">
            {r.totale !== null && (
              <span className="block text-[13px] font-semibold tabular-nums text-slate-900">{formatCurrency(r.totale)}</span>
            )}
            {r.incerti > 0 && <span className="block text-[11px] text-amber-700">{r.incerti} da controllare</span>}
          </span>
        )}
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform", aperta && "rotate-180")} aria-hidden />
      </button>
      {aperta && <Dettaglio doc={doc} />}
    </li>
  );
}

function AltriDocumenti({
  righe,
  aperto,
  onApri,
}: {
  righe: DocumentoDaConfermare[];
  aperto: string | null;
  onApri: (id: string | null) => void;
}) {
  const [mostra, setMostra] = useState(false);
  const [conferma, setConferma] = useState(false);
  const scarta = useScartaDocumentiEstratti();
  return (
    <section aria-label="Altri documenti" className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setMostra((v) => !v)}
          aria-expanded={mostra}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] font-medium text-slate-700"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", mostra && "rotate-180")} aria-hidden />
          <span className="truncate">Altri documenti ({righe.length})</span>
        </button>
        <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={scarta.isPending} onClick={() => setConferma(true)}>
          {scarta.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Scarta tutti"}
        </Button>
      </div>
      {mostra && (
        <ul className="divide-y border-t">
          {righe.map((d) => (
            <Riga key={d.id} doc={d} aperta={aperto === d.id} onToggle={() => onApri(aperto === d.id ? null : d.id)} />
          ))}
        </ul>
      )}
      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scartare {righe.length} {righe.length === 1 ? "documento" : "documenti"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sono listini, moduli e altri allegati che non sembrano fatture né bolle. Restano nell’email, ma qui non si vedono più.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => scarta.mutate(righe.map((d) => d.id))}>Scarta tutti</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function DocumentiDaConfermareLista() {
  const { effectiveCompany } = useAuth();
  const documenti = useDocumentiDaConfermare(effectiveCompany?.id);
  // Una bozza aperta alla volta: la lista resta corta e si legge.
  const [aperto, setAperto] = useState<string | null>(null);

  if (documenti.isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carico i documenti…
      </p>
    );
  }
  if (documenti.isError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Non riesco a leggere i documenti da confermare.{" "}
        <button type="button" className="font-medium underline underline-offset-2" onClick={() => void documenti.refetch()}>
          Riprova
        </button>
      </div>
    );
  }

  const { principali, altro } = dividiPerTipo(documenti.data ?? []);
  if (principali.length === 0 && altro.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-6 text-sm text-slate-600">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Niente da confermare.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {principali.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card">
          {principali.map((d) => (
            <Riga key={d.id} doc={d} aperta={aperto === d.id} onToggle={() => setAperto(aperto === d.id ? null : d.id)} />
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-4 text-sm text-slate-600">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nessuna fattura o bolla da confermare.
        </p>
      )}
      {altro.length > 0 && <AltriDocumenti righe={altro} aperto={aperto} onApri={setAperto} />}
    </div>
  );
}
