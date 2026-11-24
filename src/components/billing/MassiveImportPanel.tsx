import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Download, RefreshCw, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MassiveRequest } from "../../../supabase/functions/_shared/italaClient";
import type { MassiveDirection, MassiveDateType } from "../../../supabase/functions/_shared/billingMassive";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Request extends Omit<MassiveRequest, "id"> {
  id: number | string; filename?: string; archives?: { id: string; filename: string; count: number }[];
  errors?: string[]; polls?: number;
}
interface Listing { requests: Request[]; environment?: string; missing?: string[]; configured?: boolean }
const textError = (e: unknown) => e instanceof Error ? e.message : "Operazione non riuscita.";
function download(data: BlobPart, filename: string, type = "application/xml") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename.replace(/[^a-zA-Z0-9_.-]/g, "_"); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function base64File(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file);
  });
}
export function MassiveImportPanel({ companyId, italaConnected }: { companyId?: string; italaConnected: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("itala");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [direction, setDirection] = useState<MassiveDirection>("RICEVUTE");
  const [dateType, setDateType] = useState<MassiveDateType>("EMISSIONE");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ create: true } | { pay: Request } | null>(null);
  const [lastCreated, setLastCreated] = useState<Request | null>(null);
  const [progress, setProgress] = useState("");
  async function invoke<T>(action: string, values: Record<string, unknown> = {}): Promise<T> {
    const { data, error: err } = await supabase.functions.invoke("billing-massive", { body: { ...values, action, company_id: companyId, provider } });
    if (err) {
      const response = (err as { context?: Response }).context;
      const details = response instanceof Response ? await response.clone().json().catch((): null => null) : null;
      throw new Error(details?.error ?? t("Servizio di recupero non disponibile. Verifica che la funzione billing-massive sia pubblicata."));
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
  const listing = useQuery({
    queryKey: ["billing-massive", companyId, provider],
    queryFn: () => invoke<Listing>("list"),
    enabled: !!companyId && (provider === "ade_direct" || italaConnected), retry: false, staleTime: 60_000,
  });
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); await listing.refetch(); }
    catch (e) { setError(textError(e)); toast.error(textError(e)); }
    finally { setBusy(false); }
  }
  async function create() {
    const request = await invoke<Request>("create", { data_da: from, data_a: to, tipo_richiesta: direction, tipo_data: dateType, provider_enabled: enabled, confirm_create_credit: true });
    setLastCreated(request);
    if (request.file_richiesta) download(request.file_richiesta, request.filename ?? `richiesta_${request.id}.xml`);
    toast.success(t("Richiesta preparata: firma il file XML in formato CAdES (.p7m)."));
  }
  async function sign(request: Request, file?: File) {
    if (!file) return;
    if (!/\.p7m$/i.test(file.name) || file.size > 2 * 1024 * 1024) throw new Error(t("Carica il file firmato .p7m, massimo 2 MB."));
    await invoke("sign", { id: request.id, signed_base64: await base64File(file) });
    toast.success(t("Richiesta firmata inoltrata."));
  }
  async function importInvoices() {
    const result = await invoke<{ imported: number; duplicates: number; failed: number; errors: string[]; next_page: number | null }>("import_page");
    setProgress(`${t("{imported} importate, {duplicates} già presenti, {failed} non importate.", { imported: result.imported, duplicates: result.duplicates, failed: result.failed })} ${result.next_page ? t("Il recupero prosegue automaticamente ogni due minuti.") : t("Giro di importazione completato.")}`);
    if (result.failed) throw new Error(result.errors.slice(0, 3).join(" ") || t("Alcune fatture non sono state importate. Controlla il registro delle sincronizzazioni prima di proseguire."));
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["invoices"] }), queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] })]);
    toast.success(result.next_page ? t("Importazione avviata: prosegue automaticamente.") : t("Importazione completata."));
  }
  const rows = [...(listing.data?.requests ?? [])];
  if (lastCreated && !rows.some(r => String(r.id) === String(lastCreated.id))) rows.unshift(lastCreated);
  const disabled = busy || !companyId || (provider === "itala" && !italaConnected);
  return <Card>
    <CardHeader><CardTitle>{t("Recupera lo storico da AdE")}</CardTitle><CardDescription>
      {t("Richiedi le fatture emesse o ricevute per un periodo massimo di tre mesi. La richiesta va firmata dal titolare o dall'intermediario delegato.")}
    </CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="space-y-2"><Label htmlFor="massive-provider">{t("Collegamento")}</Label>
        <Select value={provider} disabled={busy} onValueChange={v => { setProvider(v); setEnabled(false); setLastCreated(null); setProgress(""); setError(""); }}>
          <SelectTrigger id="massive-provider"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="itala">{t("Fattura Elettronica API (ITALA)")}</SelectItem><SelectItem value="ade_direct" disabled>{t("Canale diretto AdE · in preparazione")}</SelectItem>
          </SelectContent></Select>
      </div>
      {provider === "itala" && !italaConnected && <Alert><AlertDescription>{t("Attiva prima «Recupero fatture con Edilizia in Cloud» in «Programma collegato». La partita IVA viene letta dall’anagrafica aziendale.")}</AlertDescription></Alert>}
      {provider === "itala" && <p className="text-sm text-muted-foreground">{t("In Fatture e Corrispettivi → Consultazione → Censimento canali per forniture massive, abilita «Itala Tecnologia Informatica S.r.l.» per Scarico Fatture. Il collegamento dalle impostazioni registra l'azienda nel servizio centrale.")}</p>}
      {listing.data?.missing?.length ? <Alert><AlertDescription>{t("Canale diretto da completare: {missing}. Puoi già preparare il file da firmare.", { missing: listing.data.missing.join("; ") })}</AlertDescription></Alert> : null}
      {listing.data?.environment && <Badge variant="outline">{listing.data.environment === "test" ? t("Ambiente di test") : t("Ambiente di produzione")}</Badge>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="massive-from">{t("Dal")}</Label><Input id="massive-from" type="date" value={from} disabled={busy} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="massive-to">{t("Al")}</Label><Input id="massive-to" type="date" value={to} disabled={busy} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="massive-direction">{t("Fatture")}</Label><Select value={direction} disabled={busy} onValueChange={v => { setDirection(v as MassiveDirection); if (v === "EMESSE" && dateType === "RICEZIONE") setDateType("EMISSIONE"); }}>
          <SelectTrigger id="massive-direction"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EMESSE">{t("Emesse")}</SelectItem><SelectItem value="RICEVUTE">{t("Ricevute")}</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="massive-date">{t("Criterio della data")}</Label><Select value={dateType} disabled={busy} onValueChange={v => setDateType(v as MassiveDateType)}>
          <SelectTrigger id="massive-date"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EMISSIONE">{t("Emissione")}</SelectItem>{direction === "RICEVUTE" && <SelectItem value="RICEZIONE">{t("Ricezione")}</SelectItem>}<SelectItem value="ACCOGLIENZA_SDI">{t("Accoglienza presso SdI")}</SelectItem></SelectContent></Select></div>
      </div>
      <div className="flex items-start gap-2"><Checkbox id="massive-enabled" checked={enabled} disabled={busy} onCheckedChange={v => setEnabled(v === true)} /><Label htmlFor="massive-enabled" className="font-normal">{t("Ho abilitato questo provider per la partita IVA dell'azienda selezionata in Fatture e Corrispettivi.")}</Label></div>
      <p className="text-sm text-muted-foreground">{provider === "itala" ? t("La creazione costa 1 credito. Il recupero costa poi 1 credito per documento, da confermare quando il conteggio è disponibile.") : t("L'inoltro richiede accreditamento, certificati e abilitazione del tuo canale. Non usare una firma tecnica del server al posto della firma qualificata del soggetto ammesso.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || !from || !to || !enabled} onClick={() => setConfirmation({ create: true })}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{t("Prepara richiesta")} {provider === "itala" ? `· ${t("1 credito")}` : ""}</Button>
        <Button variant="outline" disabled={disabled} onClick={() => void run(async () => { await listing.refetch(); })}><RefreshCw className="h-4 w-4 mr-2" />{t("Aggiorna elenco")}</Button>
        {provider === "itala" && <Button variant="outline" disabled={disabled} onClick={() => void run(importInvoices)}>{t("Importa fatture disponibili")}</Button>}
      </div>
      {progress && <p role="status" className="text-sm">{progress}</p>}
      {(error || listing.error) && <Alert variant="destructive"><AlertDescription>{error || textError(listing.error)}</AlertDescription></Alert>}
      {listing.isLoading && <Skeleton className="h-24 w-full" />}
      <div className="space-y-3">{rows.map(row => <div key={row.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{t("Richiesta {id}", { id: String(row.id ?? "") })}</span><Badge variant="secondary">{row.stato || "CREATO"}</Badge></div>
        <p className="text-sm">{row.tipo_richiesta} · {row.data_da} → {row.data_a}{row.num_documenti != null ? ` · ${t("{num_documenti} documenti", { num_documenti: String(row.num_documenti ?? "") })}` : ""}</p>
        {row.messaggio && <p className="text-sm">{row.messaggio}</p>}
        {row.errors?.length ? <p className="text-sm text-destructive">{t("Codici AdE: {errors}", { errors: row.errors.join(", ") })}</p> : null}
        {row.polls != null && <p className="text-xs text-muted-foreground">{t("Verifiche AdE utilizzate: {polls}/10. Gli esiti intermedi restano in cache per un'ora.", { polls: String(row.polls ?? "") })}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {(row.file_richiesta || (lastCreated?.id === row.id && lastCreated.file_richiesta)) && <Button variant="outline" size="sm" disabled={busy} onClick={() => download(row.file_richiesta ?? lastCreated!.file_richiesta!, row.filename ?? `richiesta_${row.id}.xml`)}><Download className="h-4 w-4 mr-2" />{t("XML da firmare")}</Button>}
          {row.stato === "CREATO" && <Label className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${busy ? "opacity-50" : "cursor-pointer"}`}><Upload className="h-4 w-4" />{t("Carica richiesta firmata")}<input className="sr-only" type="file" accept=".p7m" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void run(() => sign(row, file)); }} /></Label>}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await invoke("status", { id: row.id }); })}>{t("Controlla esito")}</Button>
          {provider === "itala" && row.stato === "PRONTO" && row.num_documenti != null && <Button size="sm" disabled={busy} onClick={() => setConfirmation({ pay: row })}>{t("Recupera · {num_documenti} crediti", { num_documenti: String(row.num_documenti ?? "") })}</Button>}
          {row.archives?.map(archive => <Button key={archive.id} variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
            const file = await invoke<{ base64: string; filename: string }>("download", { id: row.id, file_id: archive.id });
            const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)); download(bytes, file.filename, "application/zip");
          })}><Download className="h-4 w-4 mr-2" />{archive.filename}</Button>)}
        </div>
      </div>)}</div>
      {provider === "ade_direct" && <p className="text-sm">{t("Dopo aver scaricato gli archivi,")} <Link className="underline" to="/azienda/documenti/fatture-ricevute">{t("apri l'importazione XML/ZIP")}</Link>: {t("il gestionale riconosce emesse e ricevute e conserva i file originali.")}</p>}
      <p className="text-xs text-muted-foreground">{t("Lo scarico di fatture ricevute messe a disposizione nel cassetto fiscale può valere come presa visione. I tempi di elaborazione dipendono da AdE. Non ripetere una creazione se il suo esito è incerto: aggiorna prima l'elenco.")}</p>
      <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{confirmation && "pay" in confirmation ? t("Conferma recupero dei documenti") : t("Conferma richiesta")}</AlertDialogTitle><AlertDialogDescription>
          {confirmation && "pay" in confirmation ? t("Il provider addebiterà {num_documenti} crediti per recuperare {num_documenti} documenti. Procedere?", { num_documenti: String(confirmation.pay.num_documenti ?? "") }) : `${t("{direzione}, dal {from} al {to}.", { direzione: direction === "EMESSE" ? t("Emesse") : t("Ricevute"), from, to })} ${provider === "itala" ? t("La creazione addebita 1 credito sul tuo account.") : t("Verrà preparato il file XML da firmare; il canale deve essere attivato prima dell'inoltro.")}`}
        </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Annulla")}</AlertDialogCancel><AlertDialogAction onClick={() => {
          const choice = confirmation; setConfirmation(null); if (!choice) return;
          void run(() => "pay" in choice ? invoke("pay", { id: choice.pay.id, confirm_credits: choice.pay.num_documenti }).then(() => { toast.success(t("Recupero richiesto. Attendi lo stato ESEGUITO, poi importa le fatture disponibili.")); }) : create());
        }}>{t("Conferma")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
