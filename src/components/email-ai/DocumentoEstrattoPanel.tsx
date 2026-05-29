/**
 * DocumentoEstrattoPanel — MP-EMAIL-AI-06 · UI estrazione allegati → bozza
 *
 * Per ogni allegato PDF mostra "Estrai dati". Le bozze risultanti appaiono come
 * card di revisione: campi precompilati, incerti EVIDENZIATI, alert IBAN anti-frode,
 * avviso duplicato SDI. Azioni: Conferma / Scarta. Mai registrazione automatica.
 */
import { useMemo } from "react";
import { FileText, ScanText, AlertTriangle, CheckCircle2, XCircle, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useEstraiAllegato,
  useDocumentiEstrattiPerEmail,
  useAggiornaStatoDocumentoEstratto,
  type DocumentoEstratto,
} from "@/lib/email-ai/hooks";

type Attachment = { filename?: string; size?: number; mime?: string; storage_path?: string };

const CAMPO_LABEL: Record<string, string> = {
  fornitore_ragione_sociale: "Fornitore",
  piva: "P.IVA",
  codice_fiscale: "Cod. Fiscale",
  numero: "Numero",
  data: "Data",
  imponibile: "Imponibile",
  iva: "IVA",
  totale: "Totale",
  aliquota: "Aliquota",
  scadenza: "Scadenza",
  iban: "IBAN",
  causale_trasporto: "Causale trasp.",
  riferimento_ordine: "Rif. ordine",
};

function isPdf(a: Attachment): boolean {
  const f = (a.filename || "").toLowerCase();
  const m = (a.mime || "").toLowerCase();
  return f.endsWith(".pdf") || m.includes("pdf");
}

export function DocumentoEstrattoPanel({ emailId, attachments }: { emailId: string; attachments: Attachment[] }) {
  const estrai = useEstraiAllegato();
  const { data: drafts } = useDocumentiEstrattiPerEmail(emailId);
  const pdfAttachments = useMemo(() => attachments.map((a, i) => ({ a, i })).filter(({ a }) => isPdf(a)), [attachments]);

  if (pdfAttachments.length === 0) return null;

  const draftByPath = new Map<string, DocumentoEstratto>();
  for (const d of drafts ?? []) if (d.pdf_storage_path) draftByPath.set(d.pdf_storage_path, d);

  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {pdfAttachments.map(({ a, i }) => {
          const existing = a.storage_path ? draftByPath.get(a.storage_path) : undefined;
          const busy = estrai.isPending && estrai.variables?.attachment_index === i;
          return (
            <Button
              key={i}
              size="sm"
              variant={existing ? "secondary" : "outline"}
              className="h-8 gap-1.5 text-xs"
              disabled={busy}
              onClick={() => estrai.mutate({ email_id: emailId, attachment_index: i })}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
              {existing ? "Ri-estrai" : "Estrai dati"}
              <span className="max-w-[120px] truncate text-muted-foreground">{a.filename || `pdf-${i + 1}`}</span>
            </Button>
          );
        })}
      </div>

      {(drafts ?? []).filter((d) => d.stato !== "scartato").map((d) => (
        <DraftCard key={d.id} draft={d} emailId={emailId} />
      ))}
    </div>
  );
}

function DraftCard({ draft, emailId }: { draft: DocumentoEstratto; emailId: string }) {
  const aggiorna = useAggiornaStatoDocumentoEstratto();
  const incerti = new Set(draft.dati_incerti || []);
  const campi = draft.campi || {};
  const ordered = Object.keys(CAMPO_LABEL).filter((k) => campi[k]?.valore != null && campi[k]?.valore !== "");

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <span className="font-semibold capitalize text-blue-900">{(draft.tipo || "documento").replace("_", " ")}</span>
        {draft.confidenza_tipo != null && (
          <Badge variant="outline" className="bg-white text-[10px]">{Math.round(draft.confidenza_tipo * 100)}%</Badge>
        )}
        {draft.stato === "confermato" && <Badge className="bg-emerald-600 text-[10px]">Confermato</Badge>}
        {draft.stato === "duplicato" && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
            <Copy className="mr-1 h-3 w-3" /> Già presente (SDI)
          </Badge>
        )}
      </div>

      {draft.iban_alert && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>IBAN diverso dal solito.</b> Verifica con una telefonata prima di pagare (possibile frode del cambio IBAN).</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        {ordered.map((k) => {
          const v = campi[k]?.valore;
          const uncertain = incerti.has(k);
          return (
            <div key={k} className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{CAMPO_LABEL[k]}</div>
              <div className={cn("truncate font-medium", uncertain ? "rounded bg-yellow-200/70 px-1 text-yellow-900" : "text-slate-800")}
                   title={uncertain ? "Dato incerto — controlla sull'anteprima" : String(v)}>
                {String(v)}
              </div>
            </div>
          );
        })}
      </div>

      {draft.note && <p className="mt-2 text-[11px] italic text-muted-foreground">{draft.note}</p>}

      {draft.stato !== "confermato" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-8 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                  disabled={aggiorna.isPending}
                  onClick={() => aggiorna.mutate({ id: draft.id, stato: "confermato", email_id: emailId })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Conferma
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                  disabled={aggiorna.isPending}
                  onClick={() => aggiorna.mutate({ id: draft.id, stato: "scartato", email_id: emailId })}>
            <XCircle className="h-3.5 w-3.5" /> Scarta
          </Button>
        </div>
      )}
    </div>
  );
}
