/**
 * DocumentoEstrattoPanel — MP-EMAIL-AI-06/07/09 · UI ponte allegati → gestionale
 *
 * Per ogni allegato PDF: "Estrai dati". Le bozze (card di revisione) mostrano
 * campi precompilati, incerti EVIDENZIATI, alert IBAN anti-frode, duplicato SDI.
 * Sui DDT: "Crea carico" (MP-07, confronto ODA). Sulle fatture con scadenza:
 * "Rileva scadenza" (MP-09 → Cashflow previsionale). Mai registrazione automatica.
 */
import { useMemo } from "react";
import { FileText, ScanText, AlertTriangle, CheckCircle2, XCircle, Loader2, Copy, PackageCheck, Truck, CalendarClock, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useEstraiAllegato,
  useDocumentiEstrattiPerEmail,
  useAggiornaStatoDocumentoEstratto,
  useCreaCaricoDdt,
  useCarichiDdtPerEmail,
  useAggiornaStatoCaricoDdt,
  useRilevaScadenza,
  useScadenzeBozzePerEmail,
  useConfermaScadenza,
  useScartaScadenza,
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

      <CarichiSection emailId={emailId} />
      <ScadenzeSection emailId={emailId} />
    </div>
  );
}

function CarichiSection({ emailId }: { emailId: string }) {
  const { data: carichi } = useCarichiDdtPerEmail(emailId);
  const aggiorna = useAggiornaStatoCaricoDdt();
  const visibili = (carichi ?? []).filter((c) => c.stato !== "scartato");
  if (visibili.length === 0) return null;
  return (
    <>
      {visibili.map((c) => (
        <div key={c.id} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs">
          <div className="mb-2 flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-indigo-600" />
            <span className="font-semibold text-indigo-900">Carico da DDT {c.ddt_numero ? `n. ${c.ddt_numero}` : ""}</span>
            {c.purchase_order_numero ? (
              <Badge variant="outline" className="bg-white text-[10px]">ODA {c.purchase_order_numero}</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">Nessun ordine collegato</Badge>
            )}
            {c.stato === "confermato" && <Badge className="bg-emerald-600 text-[10px]">Confermato</Badge>}
            {c.scostamenti_totali > 0 && (
              <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 text-[10px]">{c.scostamenti_totali} scostamenti</Badge>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Articolo</th>
                  <th className="px-1 text-right font-medium">In bolla</th>
                  <th className="px-1 text-right font-medium">Ordinato</th>
                  <th className="px-1 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {c.righe.map((r, i) => {
                  const diff = r.scostamento;
                  const bad = diff == null || diff !== 0;
                  return (
                    <tr key={i} className={cn("border-t border-indigo-100", bad && "bg-rose-50/60")}>
                      <td className="py-1 pr-2">
                        <span className="font-medium text-slate-800">{r.descrizione || r.codice || "—"}</span>
                        {r.note && <span className="ml-1 text-[10px] text-rose-600">({r.note})</span>}
                      </td>
                      <td className="px-1 text-right tabular-nums">{r.qta_bolla}</td>
                      <td className="px-1 text-right tabular-nums">{r.qta_ordine ?? "—"}</td>
                      <td className={cn("px-1 text-right tabular-nums font-semibold", bad ? "text-rose-700" : "text-emerald-700")}>
                        {diff == null ? "n/d" : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {c.stato !== "confermato" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="h-8 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                      disabled={aggiorna.isPending}
                      onClick={() => aggiorna.mutate({ id: c.id, stato: "confermato", email_id: emailId })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Conferma carico
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                      disabled={aggiorna.isPending}
                      onClick={() => aggiorna.mutate({ id: c.id, stato: "scartato", email_id: emailId })}>
                <XCircle className="h-3.5 w-3.5" /> Scarta
              </Button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function ScadenzeSection({ emailId }: { emailId: string }) {
  const { data: scadenze } = useScadenzeBozzePerEmail(emailId);
  const conferma = useConfermaScadenza();
  const scarta = useScartaScadenza();
  const visibili = (scadenze ?? []).filter((s) => s.stato !== "scartata");
  if (visibili.length === 0) return null;
  return (
    <>
      {visibili.map((s) => {
        const entrata = s.direzione === "entrata";
        return (
          <div key={s.id} className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-700" />
              <span className="font-semibold text-teal-900">Scadenza rilevata</span>
              <Badge variant="outline" className={cn("gap-1 text-[10px]", entrata ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-700")}>
                {entrata ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                {entrata ? "Incasso" : "Pagamento"}
              </Badge>
              {s.stato === "aggiunta" && <Badge className="bg-emerald-600 text-[10px]">In scadenzario</Badge>}
              {s.dedup_scadenza_id && s.stato !== "aggiunta" && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">Già presente</Badge>
              )}
            </div>
            <p className="text-[12px] text-slate-800">
              <b>{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(s.amount)}</b>
              {" · "}entro il {new Date(s.due_date).toLocaleDateString("it-IT")}
              {s.descrizione ? ` · ${s.descrizione}` : ""}
            </p>
            {s.stato !== "aggiunta" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="h-8 gap-1 bg-teal-600 text-xs hover:bg-teal-700"
                        disabled={conferma.isPending}
                        onClick={() => conferma.mutate({ id: s.id, email_id: emailId })}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Aggiungi a scadenzario
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                        disabled={scarta.isPending}
                        onClick={() => scarta.mutate({ id: s.id, email_id: emailId })}>
                  <XCircle className="h-3.5 w-3.5" /> Scarta
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function DraftCard({ draft, emailId }: { draft: DocumentoEstratto; emailId: string }) {
  const aggiorna = useAggiornaStatoDocumentoEstratto();
  const creaCarico = useCreaCaricoDdt();
  const rilevaScadenza = useRilevaScadenza();
  const incerti = new Set(draft.dati_incerti || []);
  const campi = draft.campi || {};
  const righe = (campi as Record<string, unknown>).righe;
  const isDdt = (draft.tipo || "").toLowerCase() === "ddt" || (Array.isArray(righe) && righe.length > 0);
  const hasScadenza = !!campi.scadenza?.valore && !!campi.totale?.valore;
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

      <div className="mt-3 flex flex-wrap gap-2">
        {isDdt && (
          <Button size="sm" variant="secondary" className="h-8 gap-1 text-xs"
                  disabled={creaCarico.isPending}
                  onClick={() => creaCarico.mutate({ documento_estratto_id: draft.id, email_id: emailId })}>
            {creaCarico.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
            Crea carico magazzino
          </Button>
        )}
        {hasScadenza && (
          <Button size="sm" variant="secondary" className="h-8 gap-1 text-xs"
                  disabled={rilevaScadenza.isPending}
                  onClick={() => rilevaScadenza.mutate({ documento_estratto_id: draft.id, email_id: emailId })}>
            {rilevaScadenza.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            Rileva scadenza
          </Button>
        )}
      </div>

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
