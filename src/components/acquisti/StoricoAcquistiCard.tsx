import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { History, Mail, Pencil, Loader2 } from "lucide-react";
import { modificheEvento, record, valoreStorico } from "@/lib/acquisti/storico";
import { DocumentoAnteprimaDialog } from "./DocumentoAnteprimaDialog";
type FileStorico = { path: string; bucket: string; name: string };
const stati: Record<string, string> = {
  queued: "In coda",
  sending: "Invio in corso",
  sent: "Inviata",
  failed: "Invio fallito",
  error: "Invio fallito",
  scheduled: "Programmata",
  cancelled: "Annullata",
};
export function StoricoAcquistiCard({
  tipo,
  id,
  revisionKey,
  rigaSeVuoto = false,
}: {
  tipo: "oda" | "rdo";
  id: string;
  revisionKey?: string;
  /**
   * Senza eventi, una riga sola invece della scheda con titolo, spiegazione
   * e «Nessun evento registrato» (richiesta d'offerta, 11/11/2026).
   */
  rigaSeVuoto?: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const [limite, setLimite] = useState(20);
  const [file, setFile] = useState<FileStorico | null>(null);
  const q = useQuery({
    queryKey: [
      "procurement-history",
      effectiveCompany?.id,
      tipo,
      id,
      limite,
      revisionKey,
    ],
    enabled: !!effectiveCompany?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_document_events")
        .select("*")
        .eq("company_id", effectiveCompany!.id)
        .eq(tipo === "oda" ? "purchase_order_id" : "rfq_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limite + 1);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (rigaSeVuoto && !q.isError && (q.isLoading || !q.data?.length))
    return (
      <section
        aria-label="Storico invii e revisioni"
        className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500"
      >
        <History className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-slate-700">
            Storico invii e revisioni
          </span>
          {q.isLoading ? " · caricamento…" : " · ancora nessun invio o modifica"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          Aggiorna
        </Button>
      </section>
    );
  return (
    <section
      aria-label="Storico invii e revisioni"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <History className="h-4 w-4 text-orange-500" />
          Storico invii e revisioni
        </h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          Aggiorna
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Le modifiche e gli invii registrati da ora conservano i dati del
        momento. Le bozze email non sono invii.
      </p>
      {q.isLoading ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento storico…
        </p>
      ) : q.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Storico non disponibile.{" "}
          <Button variant="link" onClick={() => void q.refetch()}>
            Riprova
          </Button>
        </p>
      ) : !q.data?.length ? (
        <p className="mt-4 text-sm text-slate-500">
          Nessun evento registrato. I prossimi salvataggi e invii compariranno
          qui.
        </p>
      ) : (
        <ol className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {q.data.slice(0, limite).map((e) => {
            const p = record(e.payload);
            const changes = modificheEvento(e.payload);
            const documento = record(record(p.context).documento);
            const righe = Array.isArray(documento.righe) ? documento.righe : [];
            const attachments = Array.isArray(p.attachments)
              ? p.attachments
              : [];
            return (
              <li key={e.id} className="rounded-xl border border-slate-100 p-3">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                        {e.kind === "email" ? (
                          <Mail className="h-4 w-4 shrink-0 text-blue-600" />
                        ) : (
                          <Pencil className="h-4 w-4 shrink-0 text-slate-500" />
                        )}
                        <span>
                          {e.kind === "email"
                            ? `Email · ${stati[e.operation] ?? e.operation}`
                            : `${e.entity} · ${e.operation === "INSERT" ? "Aggiunto" : e.operation === "DELETE" ? "Rimosso" : "Modificato"}`}
                        </span>
                      </div>
                      <time className="text-[11px] text-slate-500">
                        {new Date(
                          typeof p.sent_at === "string"
                            ? p.sent_at
                            : e.created_at,
                        ).toLocaleString("it-IT")}
                      </time>
                    </div>
                    <p className="mt-1 break-words text-xs text-slate-600">
                      {e.actor_label || "Sistema"}
                      {e.kind === "email" && Array.isArray(p.to)
                        ? ` → ${p.to.join(", ")}`
                        : ""}
                    </p>
                    {e.kind === "email" && typeof p.subject === "string" && (
                      <p className="mt-1 break-words text-xs font-medium">
                        {p.subject}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-blue-600">
                      Apri dettagli
                    </p>
                  </summary>
                  <div className="mt-3 border-t pt-3">
                    {e.kind === "email" ? (
                      <>
                        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                          {typeof p.body === "string"
                            ? p.body
                            : "Messaggio senza testo semplice."}
                        </p>
                        {righe.length > 0 && (
                          <details className="mt-3 rounded-lg bg-slate-50 p-3">
                            <summary className="cursor-pointer text-xs font-semibold">
                              Versione documento preparata ·{" "}
                              {String(documento.numero ?? "")}
                            </summary>
                            <p className="mt-2 text-xs">
                              Fornitore:{" "}
                              {String(
                                record(documento.destinatario).nome ?? "—",
                              )}{" "}
                              · Pagamento:{" "}
                              {String(documento.pagamento ?? "Da indicare")}
                            </p>
                            <ul className="mt-2 space-y-1">
                              {righe.map((r, i) => {
                                const voce = record(r);
                                return (
                                  <li key={i} className="break-words text-xs">
                                    {String(voce.quantita ?? "")}{" "}
                                    {String(voce.unita ?? "")} ·{" "}
                                    {String(voce.descrizione ?? "")}
                                    {typeof voce.prezzo === "number"
                                      ? ` · ${voce.prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`
                                      : ""}
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Questi sono i dati salvati all’apertura del
                              compositore. Il testo sopra e gli allegati
                              riportano il contenuto finale dell’email.
                            </p>
                          </details>
                        )}
                        {typeof p.error === "string" && p.error && (
                          <p role="alert" className="mt-2 text-xs text-red-700">
                            {p.error}
                          </p>
                        )}
                        {attachments.map((a, i) => {
                          const f = record(a);
                          return typeof f.storage_path === "string" &&
                            typeof f.filename === "string" ? (
                            <div key={i} className="mt-2 break-all text-xs">
                              {f.filename}
                              {(f.mime === "application/pdf" ||
                                f.filename.toLowerCase().endsWith(".pdf")) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-2"
                                  onClick={() =>
                                    setFile({
                                      path: String(f.storage_path),
                                      bucket:
                                        typeof f.bucket === "string"
                                          ? f.bucket
                                          : "email-attachments",
                                      name: String(f.filename),
                                    })
                                  }
                                >
                                  Apri PDF originale
                                </Button>
                              )}
                            </div>
                          ) : null;
                        })}
                        <p className="mt-2 text-[11px] text-slate-500">
                          Il PDF originale rispetta i permessi di accesso agli
                          allegati della casella mittente.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-slate-600">
                          {String(
                            record(p.after).description ??
                              record(p.after).descrizione ??
                              record(p.before).description ??
                              record(p.before).descrizione ??
                              "",
                          )}
                        </p>
                        {changes.length ? (
                          <dl className="space-y-2">
                            {changes.map((c) => (
                              <div
                                key={c.campo}
                                className="grid gap-1 text-xs sm:grid-cols-[10rem_1fr]"
                              >
                                <dt className="font-medium">{c.campo}</dt>
                                <dd className="break-words">
                                  <span className="text-slate-500">
                                    {valoreStorico(c.prima)}
                                  </span>{" "}
                                  → {valoreStorico(c.dopo)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Dati del documento aggiornati.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
      {(q.data?.length ?? 0) > limite && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setLimite((n) => n + 20)}
        >
          Mostra eventi precedenti
        </Button>
      )}
      {file && (
        <DocumentoAnteprimaDialog file={file} onClose={() => setFile(null)} />
      )}
    </section>
  );
}
