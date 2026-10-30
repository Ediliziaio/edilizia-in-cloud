import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";
import { residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { cn } from "@/lib/utils";
import type { DocumentoFiscale } from "@/types/fatturazione";

/**
 * Chi fattura con un altro programma (Fatture in Cloud, Zucchetti, XML…) usa lo stesso
 * hub delle fatture di chi fattura con Edilizia in Cloud: qui stanno i pezzi che servono
 * solo a lui — Sincronizza, Collega gestionale, l'import in corso e il «segna pagata»
 * delle fatture importate (che vivono in `invoices`, non in `documenti_fiscali`).
 */

export const PROVIDER_LABELS: Record<string, string> = {
  fattureincloud: "Fatture in Cloud",
  fattura24: "Fattura24",
  aruba: "Aruba",
  invoicetronic: "Invoicetronic",
  acube: "A-Cube",
  zucchetti: "Zucchetti",
  xml_import: "import XML",
  itala: "ITALA · Edilizia in Cloud",
};

export interface IntegrazioneFatture {
  id: string;
  last_sync_at: string | null;
  provider: string;
  last_sync_status: string | null;
  import_stato: {
    in_corso?: boolean;
    provider?: string;
    elaborati?: number;
    tipo?: "completo" | "aggiornamento";
    flussi?: Record<string, { elaborati?: number; totale?: number | null; fatto?: boolean }>;
  } | null;
}

/** Documenti elaborati / dichiarati dal gestionale nel giro di import in corso. */
export function avanzamentoImport(st: IntegrazioneFatture["import_stato"]): { elaborati: number; totale: number | null } | null {
  if (!st?.in_corso) return null;
  if (st.provider === "itala") return { elaborati: st.elaborati ?? 0, totale: null };
  if (!st.flussi) return null;
  let elaborati = 0;
  let totale = 0;
  let noto = true;
  for (const f of Object.values(st.flussi)) {
    elaborati += f.elaborati ?? 0;
    if (f.totale == null && !f.fatto) noto = false;
    totale += f.totale ?? f.elaborati ?? 0;
  }
  return { elaborati, totale: noto ? totale : null };
}

/** «12 min fa», «3 h fa», «2 gg fa»; `stale` se il dato ha più di 24 ore. */
export function syncFreshness(iso?: string | null): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return null;
  const min = Math.floor(diffMs / 60_000);
  let label: string;
  if (min < 1) label = "adesso";
  else if (min < 60) label = `${min} min fa`;
  else if (min < 1440) label = `${Math.floor(min / 60)} h fa`;
  else label = `${Math.floor(min / 1440)} gg fa`;
  return { label, stale: diffMs > 24 * 3_600_000 };
}

/** Dopo un import o un incasso: l'elenco, le linguette, la striscia dei mesi, le statistiche. */
export function invalidaFattureImportate(qc: QueryClient, companyId: string | null | undefined) {
  void qc.invalidateQueries({ queryKey: ["invoices"], refetchType: "all" });
  void qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all, refetchType: "all" });
  void qc.invalidateQueries({ queryKey: ["billing-doc-counts"] });
  void qc.invalidateQueries({ queryKey: ["billing-monthly-timeline"] });
  void qc.invalidateQueries({ queryKey: ["incassi-importate"] });
  void qc.invalidateQueries({ queryKey: ["clienti-fiscali-importati"] });
  invalidaStatisticheFatturazione(qc, companyId);
}

export function useIntegrazioneFatture(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["billing_integration", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_integrations")
        .select("id, last_sync_at, provider, last_sync_status, import_stato")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      // L'errore non va ingoiato: si direbbe «collega il gestionale» a chi ce l'ha già.
      if (error) throw error;
      return data as unknown as IntegrazioneFatture | null;
    },
    // Import a blocchi: mentre è in corso l'avanzamento si aggiorna da solo.
    refetchInterval: (q) => ((q.state.data as IntegrazioneFatture | null | undefined)?.import_stato?.in_corso ? 60_000 : false),
    enabled: !!companyId,
    refetchOnMount: "always",
  });
}

/** Sincronizza (con l'ultimo giro accanto) o, senza gestionale collegato, «Collega gestionale». */
export function GestionaleEsternoAzioni({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { data: integration, isLoading } = useIntegrazioneFatture(companyId);
  const [syncing, setSyncing] = useState(false);

  // Mentre l'import avanza anche l'elenco si aggiorna: le fatture compaiono man mano.
  const elaborati = avanzamentoImport(integration?.import_stato ?? null)?.elaborati ?? null;
  useEffect(() => {
    if (elaborati !== null) invalidaFattureImportate(queryClient, companyId);
  }, [elaborati, queryClient, companyId]);

  const sincronizza = async () => {
    if (!integration) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-import", {
        body: { provider: integration.provider, company_id: companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const rec = data?.received;
      const recTxt = rec && (rec.imported || rec.updated) ? ` · ${(rec.imported || 0) + (rec.updated || 0)} ricevute` : "";
      if (data?.gia_in_corso) {
        toast.info("Import già in corso", { description: data?.messaggio ?? "Prosegue da solo." });
      } else if (data?.in_corso) {
        const av = data?.avanzamento as { elaborati: number; totale: number | null } | undefined;
        toast.success("Import in corso", {
          description: av
            ? `${av.elaborati.toLocaleString("it-IT")}${av.totale ? ` di ${av.totale.toLocaleString("it-IT")}` : ""} documenti. Prosegue da solo, puoi chiudere la pagina.`
            : "Prosegue da solo, puoi chiudere la pagina.",
        });
      } else {
        toast.success("Sincronizzazione completata", {
          description: `${data?.imported || 0} importate, ${data?.updated || 0} aggiornate${data?.failed ? `, ${data.failed} fallite` : ""}${recTxt}`,
        });
      }
      invalidaFattureImportate(queryClient, companyId);
      await queryClient.invalidateQueries({ queryKey: ["billing_integration"], refetchType: "all" });
    } catch (e) {
      toast.error("Errore sincronizzazione", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) return null;

  // Stesso posto e stesso aspetto di «Nuovo documento» nell'hub nativo.
  const primario = "gap-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-8 max-sm:gap-1 max-sm:px-3 max-sm:text-xs";

  if (!integration) {
    return (
      <Button asChild className={primario} title="Fatture in Cloud, Fattura24, Aruba, Zucchetti o Invoicetronic: le fatture arrivano da sole">
        <Link to="/azienda/impostazioni/fatturazione"><Link2 className="h-4 w-4" /><span className="max-sm:hidden">Collega gestionale</span><span className="sm:hidden">Collega</span></Link>
      </Button>
    );
  }

  const fresco = syncFreshness(integration.last_sync_at);
  const ultima = integration.last_sync_at ? oraSincronizzazione(integration.last_sync_at) : null;
  return (
    <>
      <span
        className={cn("inline-flex items-center gap-1 text-xs max-sm:hidden", fresco?.stale ? "font-medium text-amber-600" : "text-muted-foreground")}
        title={`Ultima sincronizzazione con ${PROVIDER_LABELS[integration.provider] ?? integration.provider}${fresco ? ` (${fresco.label})` : ""}`}
      >
        {fresco?.stale && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {ultima ? `Sincronizzato ${ultima}` : "Mai sincronizzato"}
      </span>
      <Button onClick={() => void sincronizza()} disabled={syncing} className={primario} title={ultima ? `Ultima sincronizzazione ${ultima}` : undefined}>
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizza
      </Button>
    </>
  );
}

/** «alle 14:32» se è di oggi, «ieri alle 9:05», altrimenti «il 28/10 alle 18:00». */
export function oraSincronizzazione(iso: string, adesso = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ora = format(d, "H:mm", { locale: it });
  const giorno = (x: Date) => format(x, "yyyy-MM-dd");
  const ieri = new Date(adesso.getTime() - 86_400_000);
  if (giorno(d) === giorno(adesso)) return `alle ${ora}`;
  if (giorno(d) === giorno(ieri)) return `ieri alle ${ora}`;
  return `il ${format(d, "dd/MM", { locale: it })} alle ${ora}`;
}

/** Primo import (o aggiornamento lungo): senza, l'elenco sembra vuoto o incompleto. */
export function ImportInCorsoBanner({ companyId }: { companyId: string }) {
  const { data: integration } = useIntegrazioneFatture(companyId);
  const av = avanzamentoImport(integration?.import_stato ?? null);
  if (!av || !integration) return null;
  const perc = av.totale ? Math.min(100, Math.round((av.elaborati / av.totale) * 100)) : null;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm max-sm:px-3 max-sm:py-2 max-sm:text-xs" role="status" aria-live="polite">
      <div className="flex items-center gap-2 font-medium text-sky-900">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {integration.import_stato?.tipo === "aggiornamento" ? "Aggiornamento" : "Import"} da {PROVIDER_LABELS[integration.provider] ?? integration.provider} in corso
      </div>
      <p className="mt-1 text-sky-800 max-sm:hidden">
        {av.elaborati.toLocaleString("it-IT")}
        {av.totale ? ` di ${av.totale.toLocaleString("it-IT")}` : ""} documenti tra fatture, note di credito e ricevute.
        Prosegue da solo ogni due minuti: le fatture compaiono qui man mano.
      </p>
      {perc !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${perc}%` }} />
        </div>
      )}
    </div>
  );
}

const METODI = [
  { value: "bank_transfer", label: "Bonifico" },
  { value: "cash", label: "Contanti" },
  { value: "card", label: "Carta" },
  { value: "check", label: "Assegno" },
  { value: "riba", label: "RiBa" },
  { value: "other", label: "Altro" },
];

/**
 * Gli acconti su Fatture in Cloud. `billing-payment-push` con `{ azione: "incassa", importo }`
 * ridistribuisce il pagato sulle rate (ramo fattura-pagamenti-banca, 7faa1beb6). Finché quella
 * versione non è pubblicata, quella online salda TUTTE le rate: un acconto resta solo qui.
 * Si accende quando la funzione nuova è in produzione.
 */
export const ACCONTI_SU_FATTURE_IN_CLOUD = false;

/** Quanto resta da incassare di una fattura importata (note di credito collegate già tolte). */
export function residuoImportata(doc: Pick<DocumentoFiscale, "totale_da_pagare" | "importo_pagato">): number {
  return Math.max(0, residuoDaIncassare(doc));
}

export function importataPagabile(doc: DocumentoFiscale): boolean {
  return doc.origine === "importata"
    && doc.tipo !== "nota_credito" && doc.tipo !== "proforma"
    && !["pagata", "stornata", "annullata", "bozza"].includes(doc.stato)
    && !doc.deleted_at
    && residuoImportata(doc) > 0;
}

/**
 * Un incasso su una fattura importata: il saldo o un acconto. Scrive in
 * `invoice_payments`; `paid_amount` e lo stato li ricalcolano i trigger. Se la fattura
 * arriva da Fatture in Cloud, il pagamento si registra anche lì (best effort).
 */
export function SegnaPagataImportataDialog({ fattura, companyId, onClose }: { fattura: DocumentoFiscale | null; companyId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const residuo = fattura ? residuoImportata(fattura) : 0;
  const [importo, setImporto] = useState("");
  const [data, setData] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [metodo, setMetodo] = useState("bank_transfer");

  useEffect(() => {
    if (fattura) {
      setImporto(residuoImportata(fattura).toFixed(2).replace(".", ","));
      setData(new Date().toLocaleDateString("en-CA"));
      setMetodo("bank_transfer");
    }
  }, [fattura]);

  const valore = Math.round(Number(importo.replace(/\./g, "").replace(",", ".")) * 100) / 100;
  const valido = Number.isFinite(valore) && valore > 0 && valore <= residuo + 0.005 && /^\d{4}-\d{2}-\d{2}$/.test(data);

  const registra = useMutation({
    mutationFn: async () => {
      if (!fattura) throw new Error("Nessuna fattura");
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: fattura.id,
        company_id: companyId,
        amount: valore,
        payment_date: data,
        payment_method: metodo,
      });
      if (error) throw error;
      let writeback: "ok" | "problema" | "error" | "skipped" | "solo_qui" = "skipped";
      let messaggio = "";
      const saldo = valore >= residuo - 0.005;
      if (fattura.external_provider === "fattureincloud" && !saldo && !ACCONTI_SU_FATTURE_IN_CLOUD) {
        writeback = "solo_qui";
      } else if (fattura.external_provider === "fattureincloud") {
        try {
          const body = saldo
            ? { invoice_id: fattura.id, paid_date: data }
            : { invoice_id: fattura.id, paid_date: data, azione: "incassa", importo: valore };
          const { data: pr, error: pErr } = await supabase.functions.invoke("billing-payment-push", { body });
          if (pErr) writeback = "error";
          else if (pr?.ok) writeback = "ok";
          else if (pr?.messaggio) { writeback = "problema"; messaggio = String(pr.messaggio); }
        } catch { writeback = "error"; }
      }
      return { writeback, messaggio, saldo };
    },
    onSuccess: (res) => {
      const cosa = res.saldo ? "Fattura segnata come pagata" : "Acconto registrato";
      if (res.writeback === "ok") toast.success(`${cosa} — aggiornata anche su Fatture in Cloud`);
      else if (res.writeback === "problema") toast.warning(`${cosa} in Edilizia in Cloud, non su Fatture in Cloud`, { description: res.messaggio });
      else if (res.writeback === "solo_qui") toast.success(cosa, { description: "Su Fatture in Cloud l'acconto va registrato a mano per ora." });
      else if (res.writeback === "error") toast.warning(`${cosa} in Edilizia in Cloud`, { description: "Aggiornamento su Fatture in Cloud non riuscito, riprova più tardi." });
      else toast.success(cosa);
      invalidaFattureImportate(queryClient, companyId);
      onClose();
    },
    onError: (e) => toast.error("Incasso non registrato", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={!!fattura} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registra incasso</DialogTitle>
          <DialogDescription>
            Fattura {fattura?.numero} · resta da incassare <strong>{formatCurrency(residuo)}</strong>. Per un acconto scrivi solo la parte incassata.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="incasso-importo">Importo incassato</Label>
            <Input id="incasso-importo" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
            {importo && !valido && valore > residuo + 0.005 && <p className="text-xs text-destructive">Supera quanto resta da incassare.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="incasso-data">Data</Label>
              <Input id="incasso-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="incasso-metodo">Metodo</Label>
              <select id="incasso-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                {METODI.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!valido || registra.isPending} onClick={() => registra.mutate()}>
            {registra.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {valore >= residuo - 0.005 ? "Segna pagata" : "Registra acconto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
