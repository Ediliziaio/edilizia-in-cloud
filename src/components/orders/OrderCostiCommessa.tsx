/**
 * Fatture e costi → «Altri costi».
 *
 * I costi registrati direttamente sulla commessa (company_costs.order_id, senza
 * ordine d'acquisto né squadra esterna: quelli hanno la loro scheda) e senza una
 * fattura collegata, che sta in «Fornitori». Qui si
 * aggiungono anche i costi che una fattura non l'avranno mai — la tassa del
 * Comune, un bollo, un F24 — con la ricevuta allegata e, se serve, la fase.
 * Entrano nel margine come costo diretto (v_ordine_marginalita), con l'imponibile.
 * Il pagamento passa da registra_pagamenti_costi, come in Economia → Costi:
 * stato, cassa e scadenze in una transazione sola.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Paperclip, Plus, Loader2, Wallet, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES, calculateNetFromGross } from "@/lib/vatUtils";
import { userErrorMessage } from "@/lib/userErrorMessage";
import {
  TIPI_COSTO, controllaRicevuta, documentoDelCosto, formCostoVuoto, leggiImporto, percorsoRicevuta, rigaCostoCommessa, tipoDellaCategoria,
  type DocumentoCosto, type FormCostoCommessa, type TipoCosto,
} from "@/lib/costi/costoCommessa";
import { dataIt } from "./OrderDocumentiFornitore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiquadroCommessa, StatoPill, TabellaCommessa } from "./TabellaCommessa";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupplierSelect } from "./SupplierSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Colonne nuove (allegato, fase, senza_fattura) non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const BUCKET = "order-attachments";

/**
 * I costi di cantiere senza fattura più comuni, pronti con un clic (01/11/2026, G3 del piano costi):
 * compilano descrizione, IVA e «senza fattura». Le assicurazioni e le fideiussioni sono esenti IVA;
 * lo smaltimento ha la sua fattura.
 */
export const COSTI_PRONTI: { descrizione: string; aliquotaIva: string; senzaFattura: boolean }[] = [
  { descrizione: "Oneri e diritti comunali della pratica", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Occupazione suolo pubblico", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Marche da bollo", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Polizza CAR del cantiere", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Fideiussione", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Smaltimento rifiuti", aliquotaIva: "22", senzaFattura: false },
  { descrizione: "Trasferta e vitto della squadra", aliquotaIva: "0", senzaFattura: true },
];

export interface CostoCommessa {
  id: string;
  name: string;
  tipo: TipoCosto;
  amount: number;
  vat_rate: number | null;
  due_date: string;
  is_paid: boolean;
  paid_date: string | null;
  senza_fattura: boolean;
  allegato_path: string | null;
  allegato_nome: string | null;
  order_work_phase_id: string | null;
  notes: string | null;
  fase: string | null;
  fattura: string | null;
  documento: DocumentoCosto;
}

interface Fase { id: string; name: string }

const chiaveCosti = (companyId: string | undefined, orderId: string) => ["company-costs", "commessa", companyId, orderId] as const;

export function useCostiCommessa(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: chiaveCosti(companyId, orderId),
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ costi: CostoCommessa[]; fasi: Fase[] }> => {
      const [costi, fasi] = await Promise.all([
        allPaymentRows((da, a) => db.from("company_costs")
          .select("id, name, category, amount, vat_rate, due_date, is_paid, paid_date, senza_fattura, allegato_path, allegato_nome, order_work_phase_id, notes")
          .eq("company_id", companyId).eq("order_id", orderId)
          // Ordini d'acquisto e squadre esterne hanno la loro scheda e la loro regola nel margine.
          .is("purchase_order_id", null).is("order_external_team_id", null)
          .order("due_date", { ascending: false }).order("id").range(da, a)),
        allPaymentRows((da, a) => db.from("order_work_phases").select("id, name")
          .eq("order_id", orderId).order("position").order("id").range(da, a)),
      ]);
      const ids = (costi as { id: string }[]).map((c) => c.id);
      const fatture = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 50) {
        const { data, error } = await db.from("fatture_ricevute").select("company_cost_id, numero_fattura")
          .eq("company_id", companyId).in("company_cost_id", ids.slice(i, i + 50)).neq("stato", "rifiutata");
        if (error) throw error;
        (data ?? []).forEach((f: { company_cost_id: string; numero_fattura: string | null }) => fatture.set(f.company_cost_id, f.numero_fattura ?? "—"));
      }
      const perFase = new Map((fasi as Fase[]).map((f) => [f.id, f.name]));
      return {
        fasi: fasi as Fase[],
        costi: (costi as (Omit<CostoCommessa, "fase" | "fattura" | "documento" | "tipo"> & { category: string | null })[]).map((c) => ({
          ...c,
          tipo: tipoDellaCategoria(c.category),
          amount: Number(c.amount ?? 0),
          fase: c.order_work_phase_id ? perFase.get(c.order_work_phase_id) ?? null : null,
          fattura: fatture.get(c.id) ?? null,
          documento: documentoDelCosto(c, fatture.has(c.id)),
        })),
      };
    },
  });
}

const DOCUMENTO: Record<DocumentoCosto, { testo: (c: CostoCommessa) => string; classe: string }> = {
  fattura: { testo: (c) => `Fattura n. ${c.fattura}`, classe: "bg-blue-50 text-blue-800" },
  senza_fattura: { testo: () => "Senza fattura", classe: "bg-slate-100 text-slate-700" },
  in_attesa: { testo: () => "Fattura da arrivare", classe: "bg-amber-100 text-amber-800" },
};

async function apriRicevuta(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) { toast.error("Non riesco ad aprire la ricevuta."); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function caricaRicevuta(orderId: string, file: File): Promise<string> {
  const path = percorsoRicevuta(orderId, file.name, crypto.randomUUID());
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Ricevuta non caricata: ${error.message}`);
  return path;
}

export function OrderCostiCommessaCard({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useCostiCommessa(orderId);
  const [aperto, setAperto] = useState(false);
  const [pagamentiDi, setPagamentiDi] = useState<string | null>(null);
  const [allegaA, setAllegaA] = useState<string | null>(null);
  const inputAllega = useRef<HTMLInputElement>(null);
  // Quelli con una fattura stanno in «Fornitori».
  const costi = (data?.costi ?? []).filter((c) => c.documento !== "fattura");
  const totale = costi.reduce((s, c) => s + c.amount, 0);

  const aggiorna = () => {
    refreshFinancialQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["margin"] });
  };

  const allega = useMutation({
    mutationFn: async ({ costId, file }: { costId: string; file: File }) => {
      const errore = controllaRicevuta(file);
      if (errore) throw new Error(errore);
      const path = await caricaRicevuta(orderId, file);
      const { error } = await db.from("company_costs").update({ allegato_path: path, allegato_nome: file.name }).eq("id", costId);
      if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
    },
    onSuccess: () => { toast.success("Ricevuta allegata"); aggiorna(); },
    onError: (e) => toast.error(userErrorMessage(e, "Ricevuta non allegata.")),
  });

  const elimina = useMutation({
    mutationFn: async (c: CostoCommessa) => {
      const { error } = await db.from("company_costs").delete().eq("id", c.id);
      if (error) throw error;
      if (c.allegato_path) await supabase.storage.from(BUCKET).remove([c.allegato_path]);
    },
    onSuccess: () => { toast.success("Costo eliminato"); aggiorna(); },
    onError: (e) => toast.error(userErrorMessage(e, "Costo non eliminato.")),
  });

  return (
    <>
    {pagamentiDi && <ExpensePaymentDialog key={pagamentiDi} costId={pagamentiDi} onClose={() => { setPagamentiDi(null); aggiorna(); }} />}
    <RiquadroCommessa id="costi-commessa"
      icona={<Wallet className="h-5 w-5 text-primary" aria-hidden="true" />}
      titolo="Altri costi" conteggio={costi.length}
      riassunto={costi.length > 0 ? `${formatCurrency(totale)} nel margine` : undefined}
      azioni={puoModificare ? <Button size="sm" onClick={() => setAperto(true)}><Plus className="mr-1.5 h-4 w-4" />Aggiungi costo</Button> : undefined}
    >
        <input
          ref={inputAllega}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          aria-label="Ricevuta da allegare"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && allegaA) allega.mutate({ costId: allegaA, file });
            e.target.value = "";
            setAllegaA(null);
          }}
        />
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere i costi. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : costi.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun costo senza fattura su questa commessa: Comune, bolli, F24, polizze si aggiungono da qui.</p>
        ) : (
          <TabellaCommessa etichetta="Altri costi" righe={costi} chiave={(c) => c.id} colonne={[
            { titolo: "Costo", principale: true, cella: (c) => <span className="font-medium">{c.name}</span> },
            { titolo: "Tipo", cella: (c) => TIPI_COSTO.find((t) => t.value === c.tipo)?.label },
            { titolo: "Data", cella: (c) => <span className="whitespace-nowrap">{dataIt(c.due_date)}</span> },
            { titolo: "Fase", cella: (c) => c.fase ?? "—" },
            { titolo: "Documento", cella: (c) => (
              <div className="space-y-0.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENTO[c.documento].classe}`}>{DOCUMENTO[c.documento].testo(c)}</span>
                {c.allegato_path ? (
                  <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2" onClick={() => void apriRicevuta(c.allegato_path!)}>
                    <Paperclip className="h-3 w-3" aria-hidden="true" />{c.allegato_nome ?? "Ricevuta"}
                  </button>
                ) : puoModificare && c.documento !== "fattura" ? (
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2" disabled={allega.isPending}
                    onClick={() => { setAllegaA(c.id); inputAllega.current?.click(); }}>
                    <Paperclip className="h-3 w-3" aria-hidden="true" />Allega ricevuta
                  </button>
                ) : null}
              </div>
            ) },
            { titolo: "Pagamento", cella: (c) => (
              <div className="space-y-0.5">
                <button type="button" title="Pagamenti e residuo" aria-label={`Pagamenti di ${c.name}`} onClick={() => setPagamentiDi(c.id)}>
                  <StatoPill tono={c.is_paid ? "verde" : "ambra"}>{c.is_paid ? "Pagato" : "Da pagare"}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
                </button>
                {c.is_paid && c.paid_date && <p className="whitespace-nowrap text-xs text-muted-foreground">il {dataIt(c.paid_date)}</p>}
              </div>
            ) },
            { titolo: "IVA", destra: true, cella: (c) => (c.vat_rate ? `${c.vat_rate}%` : "—") },
            { titolo: "Importo", destra: true, cella: (c) => <span className="font-medium">{formatCurrency(c.amount)}</span> },
            { titolo: "Azioni", destra: true, cella: (c) => puoModificare && !c.is_paid && c.documento !== "fattura" ? (
              /* Un costo pagato ha già scritto in cassa: si toglie da Economia → Costi, che storna il pagamento. */
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Elimina ${c.name}`} disabled={elimina.isPending}
                onClick={() => { if (window.confirm(`Eliminare «${c.name}»?`)) elimina.mutate(c); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null },
          ]} />
        )}
      {aperto && companyId && (
        <NuovoCostoDialog
          orderId={orderId}
          companyId={companyId}
          fasi={data?.fasi ?? []}
          onClose={() => setAperto(false)}
          onSalvato={aggiorna}
        />
      )}
    </RiquadroCommessa>
    </>
  );
}

export function NuovoCostoDialog({ orderId, companyId, fasi, iniziale, onClose, onSalvato, onCreato }: {
  orderId: string; companyId: string; fasi: Fase[];
  /** Il modulo già compilato, per chi aggiunge un costo da un'altra vista. */
  iniziale?: Partial<FormCostoCommessa>;
  onClose: () => void; onSalvato: () => void;
  onCreato?: (costo: { id: string; imponibile: number }) => void;
}) {
  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const [form, setForm] = useState<FormCostoCommessa>(() => ({ ...formCostoVuoto(oggi), ...iniziale }));
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof FormCostoCommessa>(k: K, v: FormCostoCommessa[K]) => setForm((f) => ({ ...f, [k]: v }));

  const lordo = leggiImporto(form.importo);
  const iva = Number(form.aliquotaIva) || 0;
  const imponibile = Number.isFinite(lordo) && lordo > 0 ? calculateNetFromGross(lordo, iva).netAmount : null;

  const salva = useMutation({
    mutationFn: async () => {
      const riga = rigaCostoCommessa(form, { companyId, orderId });
      if (file) { const errore = controllaRicevuta(file); if (errore) throw new Error(errore); }
      const path = file ? await caricaRicevuta(orderId, file) : null;
      const { data: creato, error } = await db.from("company_costs")
        .insert({ ...riga, allegato_path: path, allegato_nome: file?.name ?? null })
        .select("id").single();
      if (error || !creato) {
        if (path) await supabase.storage.from(BUCKET).remove([path]);
        throw error ?? new Error("Costo non salvato.");
      }
      onCreato?.({ id: creato.id, imponibile: riga.amount });
      if (!form.pagato) return { pagamento: null as string | null };
      // Stessa strada di Economia → Costi: stato, cassa e scadenze insieme.
      const { error: payErr } = await db.rpc("registra_pagamenti_costi", { p_ids: [creato.id], p_data: form.data });
      return { pagamento: payErr ? payErr.message : null };
    },
    onSuccess: ({ pagamento }) => {
      if (pagamento) toast.warning("Costo salvato, ma il pagamento non è registrato", { description: pagamento });
      else toast.success("Costo aggiunto alla commessa");
      onSalvato();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : userErrorMessage(e, "Costo non salvato.")),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi costo alla commessa</DialogTitle>
          <DialogDescription>Per le spese senza fattura (tassa comunale, bolli, F24) o quelle che aspettano ancora la fattura.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); salva.mutate(); }}
        >
          <div>
            <Label htmlFor="costo-descrizione">Che costo è *</Label>
            <Input id="costo-descrizione" value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} placeholder="es. Tassa comunale occupazione suolo" maxLength={200} autoFocus />
            <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Costi pronti">
              {COSTI_PRONTI.map((c) => (
                <button
                  key={c.descrizione}
                  type="button"
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                  onClick={() => setForm((f) => ({ ...f, descrizione: c.descrizione, aliquotaIva: c.aliquotaIva, senzaFattura: c.senzaFattura }))}
                >
                  {c.descrizione}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="costo-tipo">Di che tipo è</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as TipoCosto)}>
                <SelectTrigger id="costo-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_COSTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornitore</Label>
              <SupplierSelect value={form.fornitoreId ?? ""} onValueChange={(v) => set("fornitoreId", v || null)} placeholder="Nessuno" searchable allowCreate={false} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="costo-importo">Importo (€) *</Label>
              <Input id="costo-importo" inputMode="decimal" value={form.importo} onChange={(e) => set("importo", e.target.value)} placeholder="350,00" />
            </div>
            <div>
              <Label htmlFor="costo-iva">IVA</Label>
              <Select value={form.aliquotaIva} onValueChange={(v) => set("aliquotaIva", v)}>
                <SelectTrigger id="costo-iva"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Nessuna (0%)</SelectItem>
                  {VAT_RATES.filter((r) => r.value !== 0).map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {imponibile != null && iva > 0 && (
            <p className="text-xs text-muted-foreground">Nel margine entra l’imponibile: {formatCurrency(imponibile)}.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="costo-data">Data *</Label>
              <Input id="costo-data" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="costo-fase">Fase</Label>
              <Select value={form.faseId || "nessuna"} onValueChange={(v) => set("faseId", v === "nessuna" ? "" : v)} disabled={fasi.length === 0}>
                <SelectTrigger id="costo-fase"><SelectValue placeholder="Nessuna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">Tutta la commessa</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="costo-ricevuta">Ricevuta o F24</Label>
            <Input id="costo-ricevuta" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <Label htmlFor="costo-senza-fattura" className="text-sm font-normal">Senza fattura<span className="block text-xs text-muted-foreground">Nessuno manderà una fattura per questo costo.</span></Label>
            <Switch id="costo-senza-fattura" checked={form.senzaFattura} onCheckedChange={(v) => set("senzaFattura", v)} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <Label htmlFor="costo-pagato" className="text-sm font-normal">Già pagato<span className="block text-xs text-muted-foreground">Registra l’uscita alla data del costo.</span></Label>
            <Switch id="costo-pagato" checked={form.pagato} onCheckedChange={(v) => set("pagato", v)} />
          </div>
          <div>
            <Label htmlFor="costo-note">Note</Label>
            <Textarea id="costo-note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={salva.isPending}>Annulla</Button>
            <Button type="submit" disabled={salva.isPending || !form.descrizione.trim() || !form.importo}>
              {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Aggiungi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
