/**
 * Il verbale di collaudo dal telefono del capocantiere: compila dal modello dell'azienda, mostra il PDF al cliente e lo
 * fa firmare sullo schermo. Se il cliente non c'è, resta la bozza e la chiude l'ufficio.
 * Lo vede solo il capocantiere interno della commessa, se il modello lo permette (verbale_capo_autorizzato).
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModelliCapo, type ModelloCapo } from "@/components/campo/BottoneCollaudo";
import { CampiModulo } from "@/components/campo/CampiModulo";
import { FirmaVerbaleDialog, type FirmaVerbale } from "@/components/orders/FirmaVerbaleDialog";
import { cn } from "@/lib/utils";
import {
  acceptanceDaModello, outcomes, results, validateAcceptance, type AcceptanceContent, type CheckResult,
} from "../../../supabase/functions/collaudo-commessa/model";
import { componiValori, leggiSchema, leggiValori, valoriInBozza } from "../../../supabase/functions/_shared/moduliCantiere";

interface Verbale {
  id: string; status: "draft" | "finalized"; version: number; pdf_path?: string | null; document_hash?: string | null;
  content: AcceptanceContent; created_at?: string; firma_cliente_nome?: string | null;
}
const ETICHETTE: Array<[CheckResult, string]> = [["ok", results.ok], ["reserve", results.reserve], ["na", results.na], ["pending", results.pending]];

async function chiama<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("collaudo-commessa", { body });
  if (error) {
    let messaggio = error.message;
    try { messaggio = (await error.context?.json())?.error ?? messaggio; } catch { /* resta il messaggio dell'invocazione */ }
    throw new Error(messaggio);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export default function CampoVerbale() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: modelli = [] } = useModelliCapo(orderId);
  const elenco = useQuery<Verbale[]>({
    queryKey: ["verbali-capo", orderId],
    enabled: !!orderId,
    queryFn: async () => (await chiama<{ reports: Verbale[] }>({ action: "list", order_id: orderId })).reports ?? [],
  });
  const [report, setReport] = useState<Verbale | null>(null);
  const [content, setContent] = useState<AcceptanceContent | null>(null);
  const [valoriCampi, setValoriCampi] = useState<Record<string, unknown>>({});
  const [modificato, setModificato] = useState(false);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [visto, setVisto] = useState(false);
  const [firma, setFirma] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [errori, setErrori] = useState<string[]>([]);
  const [firmato, setFirmato] = useState<string | null>(null);

  const oggi = new Date().toISOString().slice(0, 10);
  const verificatore = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const nuovo = (m: ModelloCapo) => {
    setReport(null); setFirmato(null); setErrori([]); setAnteprima(null); setVisto(false);
    setContent({ ...acceptanceDaModello(oggi, leggiSchema(m.schema)), inspector: verificatore });
    setValoriCampi({});
    setModificato(true);
  };
  const riprendi = (r: Verbale) => {
    setReport(r); setFirmato(null); setErrori([]); setAnteprima(null); setVisto(false);
    setContent(r.content);
    setValoriCampi(valoriInBozza(leggiValori(r.content.valori)));
    setModificato(false);
  };
  const cambia = (parte: Partial<AcceptanceContent>) => {
    setContent(c => c && { ...c, ...parte });
    setModificato(true); setAnteprima(null); setVisto(false); setErrori([]);
  };
  const conErrore = async (fn: () => Promise<void>) => {
    if (occupato) return;
    setOccupato(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita. Riprova."); } finally { setOccupato(false); }
  };
  const salvaBozza = async (): Promise<Verbale> => {
    const { report: r } = await chiama<{ report: Verbale }>({ action: "save", order_id: orderId, id: report?.id, version: report?.version, content });
    setReport(r); setModificato(false);
    void qc.invalidateQueries({ queryKey: ["verbali-capo", orderId] });
    return r;
  };
  const mostraPdf = () => {
    if (!content) return;
    const problemi = validateAcceptance(content, true);
    if (problemi.length) { setErrori(problemi); return; }
    void conErrore(async () => {
      const r = modificato || !report ? await salvaBozza() : report;
      const { report: aggiornato, url } = await chiama<{ report: Verbale; url: string }>({ action: "preview", order_id: orderId, id: r.id, version: r.version });
      setReport(aggiornato);
      setAnteprima(url);
      window.open(url, "_blank");
    });
  };
  const fattaFirma = (f: FirmaVerbale) => conErrore(async () => {
    if (!report) return;
    const { report: r } = await chiama<{ report: Verbale }>({
      action: "sign", order_id: orderId, id: report.id, version: report.version, document_hash: report.document_hash, reviewed: visto, firma: f,
    });
    setReport(r); setFirma(false); setFirmato(r.firma_cliente_nome ?? f.nome);
    toast.success("Verbale firmato. L’ufficio è stato avvisato.");
    void qc.invalidateQueries({ queryKey: ["verbali-capo", orderId] });
  });
  const apriChiuso = (r: Verbale) => void conErrore(async () => {
    const { url } = await chiama<{ url: string }>({ action: "open", order_id: orderId, id: r.id });
    window.open(url, "_blank");
  });
  const indietro = () => {
    if (content && !firmato) {
      if (modificato && !window.confirm("Uscire senza salvare la bozza?")) return;
      setContent(null); setReport(null);
    } else if (content) { setContent(null); setReport(null); setFirmato(null); } else navigate(`/campo/lavoro/${orderId}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 p-3 pb-24">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label="Indietro" onClick={indietro}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="min-w-0 truncate text-lg font-black">{content ? content.title : "Collaudo"}</h1>
        {occupato && <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-label="Operazione in corso" />}
      </div>

      {firmato && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Firmato da {firmato}</p>
      )}

      {!content && (
        <div className="space-y-2">
          {modelli.map(m => (
            <Button key={m.id} type="button" variant="outline" className="h-11 w-full justify-start" aria-label={`Nuovo: ${m.nome}`} onClick={() => nuovo(m)}>
              <Plus className="mr-2 h-4 w-4" />{m.nome}
            </Button>
          ))}
          {(elenco.data ?? []).map(r => (
            <button key={r.id} type="button" onClick={() => r.status === "finalized" ? apriChiuso(r) : riprendi(r)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-left text-sm">
              <span className="min-w-0 truncate font-medium">{r.content?.title ?? "Verbale"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.status !== "finalized" ? "Bozza" : r.firma_cliente_nome ? `Firmato da ${r.firma_cliente_nome}` : "Non firmato"}
              </span>
            </button>
          ))}
        </div>
      )}

      {content && !firmato && (
        <fieldset disabled={occupato} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <div className="grid gap-2 rounded-2xl border bg-background p-3">
            <div className="grid gap-1"><Label htmlFor="v-scope">Lavori verificati</Label>
              <Textarea id="v-scope" rows={2} value={content.scope} onChange={e => cambia({ scope: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1"><Label htmlFor="v-cliente">Cliente</Label>
                <Input id="v-cliente" value={content.customer} maxLength={200} onChange={e => cambia({ customer: e.target.value })} /></div>
              <div className="grid gap-1"><Label htmlFor="v-verificatore">Verificatore</Label>
                <Input id="v-verificatore" value={content.inspector} maxLength={200} onChange={e => cambia({ inspector: e.target.value })} /></div>
            </div>
          </div>

          <div className="divide-y rounded-2xl border bg-background">
            {content.checks.map((v, i) => (
              <div key={i} className="space-y-1.5 p-3">
                <p className="text-sm font-semibold">{v.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ETICHETTE.map(([valore, etichetta]) => (
                    <button key={valore} type="button" aria-pressed={v.result === valore} aria-label={`${etichetta}: ${v.label}`}
                      onClick={() => cambia({ checks: content.checks.map((x, k) => k === i ? { ...x, result: valore } : x) })}
                      className={cn("min-h-10 rounded-lg border px-2 text-xs font-medium", v.result === valore ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>
                      {etichetta}
                    </button>
                  ))}
                </div>
                {(v.result === "reserve" || v.result === "na") && (
                  <Input aria-label={`Motivo: ${v.label}`} placeholder="Motivo" value={v.note} maxLength={2000}
                    onChange={e => cambia({ checks: content.checks.map((x, k) => k === i ? { ...x, note: e.target.value } : x) })} />
                )}
              </div>
            ))}
          </div>

          {(content.campi?.length ?? 0) > 0 && (
            <div className="rounded-2xl border bg-background p-3">
              <CampiModulo campi={content.campi ?? []} valori={valoriCampi} mostraErrori={errori.length > 0}
                onChange={(k, v) => {
                  const prossimi = { ...valoriCampi, [k]: v };
                  setValoriCampi(prossimi);
                  cambia({ valori: componiValori(content.campi ?? [], prossimi) });
                }} />
            </div>
          )}

          <div className="grid gap-2 rounded-2xl border bg-background p-3">
            <div className="grid gap-1"><Label htmlFor="v-esito">Esito</Label>
              <select id="v-esito" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={content.outcome}
                onChange={e => cambia({ outcome: e.target.value as AcceptanceContent["outcome"] })}>
                {Object.entries(outcomes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            <div className="grid gap-1"><Label htmlFor="v-riserve">Riserve</Label>
              <Textarea id="v-riserve" rows={2} value={content.reservations} onChange={e => cambia({ reservations: e.target.value })} /></div>
            <div className="grid gap-1"><Label htmlFor="v-documenti">Documenti consegnati</Label>
              <Input id="v-documenti" value={content.documents} onChange={e => cambia({ documents: e.target.value })} /></div>
          </div>

          {errori.length > 0 && <ul role="alert" className="list-disc rounded-xl border border-destructive/30 p-3 pl-6 text-sm">{errori.map(e => <li key={e}>{e}</li>)}</ul>}

          {anteprima && (
            <div className="space-y-2 rounded-2xl border bg-background p-3">
              <a href={anteprima} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary"><FileText className="h-4 w-4" />Apri il PDF</a>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={visto} onChange={e => setVisto(e.target.checked)} />Il cliente ha visto il documento
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={!modificato} onClick={() => void conErrore(async () => { await salvaBozza(); toast.success("Bozza salvata"); })}>Salva bozza</Button>
            {anteprima
              ? <Button type="button" className="h-11" disabled={!visto} onClick={() => setFirma(true)}>Fai firmare al cliente</Button>
              : <Button type="button" className="h-11" onClick={mostraPdf}>Mostra il PDF</Button>}
          </div>
        </fieldset>
      )}

      {firma && content && (
        <FirmaVerbaleDialog aperto nomeIniziale={content.customer} occupato={occupato} onChiudi={() => setFirma(false)} onConferma={fattaFirma} />
      )}
    </div>
  );
}
