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
import { ChevronDown, Paperclip, Pencil, Plus, Loader2, Sparkles, Upload, Wallet, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES, calculateNetFromGross } from "@/lib/vatUtils";
import { userErrorMessage } from "@/lib/userErrorMessage";
import {
  TIPI_COSTO, campiModificaCosto, lordoCosto, totaliAltriCosti, controllaRicevuta, documentoDelCosto, formCostoVuoto, formDaCosto, leggiImporto, percorsoRicevuta, rigaCostoCommessa, tipoDellaCategoria,
  type DocumentoCosto, type FormCostoCommessa, type TipoCosto,
} from "@/lib/costi/costoCommessa";
import { formDaRicevuta, importoIt, lordoDaNetto, pivaPulita, type RicevutaLetta } from "@/lib/costi/letturaRicevuta";
import { dataIt } from "./OrderDocumentiFornitore";
import { Button } from "@/components/ui/button";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { RiquadroCommessa, StatoPill, TabellaCommessa } from "./TabellaCommessa";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { DialogBody as CorpoDialogOperativo, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { SupplierSelect } from "./SupplierSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { OfficeSelect } from "./OfficeSelect";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// Colonne nuove (allegato, fase, senza_fattura) non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const BUCKET = "order-attachments";

/**
 * I costi di cantiere più comuni, pronti con un clic (01/11/2026, G3 del piano costi): compilano
 * descrizione, tipo, IVA e «senza fattura». Le assicurazioni e le fideiussioni sono esenti IVA;
 * smaltimento, noleggio e tecnico hanno la loro fattura.
 */
export const COSTI_PRONTI: { descrizione: string; breve: string; aliquotaIva: string; senzaFattura: boolean; tipo?: TipoCosto }[] = [
  { descrizione: "Oneri e diritti comunali della pratica", breve: "Oneri comunali", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Occupazione suolo pubblico", breve: "Suolo pubblico", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Marche da bollo", breve: "Marche da bollo", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Polizza CAR del cantiere", breve: "Polizza CAR", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Fideiussione", breve: "Fideiussione", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Smaltimento rifiuti", breve: "Smaltimento", aliquotaIva: "22", senzaFattura: false },
  { descrizione: "Trasferta e vitto della squadra", breve: "Trasferta e vitto", aliquotaIva: "0", senzaFattura: true },
  { descrizione: "Noleggio", breve: "Noleggio", aliquotaIva: "22", senzaFattura: false, tipo: "noleggio" },
  { descrizione: "Tecnico o professionista", breve: "Professionista", aliquotaIva: "22", senzaFattura: false, tipo: "professionista" },
];

const dalPronto = (c: typeof COSTI_PRONTI[number]): Partial<FormCostoCommessa> => ({
  descrizione: c.descrizione, aliquotaIva: c.aliquotaIva, senzaFattura: c.senzaFattura, tipo: c.tipo ?? "altro",
  pagato: c.senzaFattura,
});

export interface CostoCommessa {
  id: string;
  name: string;
  category: string | null;
  supplier_id: string | null;
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

interface FatturaArrivata { costo_id: string; fattura_id: string; numero_fattura: string | null; data_fattura: string | null; fornitore: string | null; totale: number | null }

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
          .select("id, name, category, supplier_id, amount, vat_rate, due_date, is_paid, paid_date, senza_fattura, allegato_path, allegato_nome, order_work_phase_id, notes")
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

async function apriRicevuta(path: string, messaggioErrore = "Non riesco ad aprire la ricevuta.") {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) { toast.error(messaggioErrore); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function caricaRicevuta(orderId: string, file: File): Promise<string> {
  const path = percorsoRicevuta(orderId, file.name, crypto.randomUUID());
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Ricevuta non caricata: ${error.message}`);
  return path;
}

export function OrderCostiCommessaCard({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useCostiCommessa(orderId);
  // Il modulo: nuovo (con o senza un costo pronto) o su un costo da modificare.
  const [modulo, setModulo] = useState<{ iniziale?: Partial<FormCostoCommessa>; costo?: CostoCommessa } | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [pagamentiDi, setPagamentiDi] = useState<string | null>(null);
  const [allegaA, setAllegaA] = useState<string | null>(null);
  const inputAllega = useRef<HTMLInputElement>(null);
  // Quelli con una fattura stanno in «Fornitori».
  const costi = (data?.costi ?? []).filter((c) => c.documento !== "fattura");
  const totale = costi.reduce((s, c) => s + c.amount, 0);
  const groups: Record<string, (c: CostoCommessa) => boolean> = {
    pagare: (c) => !c.is_paid,
    pagati: (c) => c.is_paid,
    ricevuta: (c) => !c.allegato_path,
    attesa: (c) => c.documento === "in_attesa",
  };
  const conta = (chiave: string) => costi.filter(groups[chiave]).length;
  const visibili = filtro ? costi.filter(groups[filtro]) : costi;
  const totali = totaliAltriCosti(costi);

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
    onSuccess: () => { toast.success(tr("Ricevuta allegata")); aggiorna(); },
    onError: (e) => toast.error(userErrorMessage(e, tr("Ricevuta non allegata."))),
  });

  const scegliFase = useMutation({
    mutationFn: async ({ id, faseId }: { id: string; faseId: string | null }) => {
      const { error, data: righe } = await db.from("company_costs").update({ order_work_phase_id: faseId }).eq("id", id).select("id");
      if (error) throw error;
      if (!righe?.length) throw new Error(tr("Non puoi modificare questo costo."));
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["company-costs"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : tr("Fase non salvata")),
  });
  const elimina = useMutation({
    mutationFn: async (c: CostoCommessa) => {
      const { error } = await db.from("company_costs").delete().eq("id", c.id);
      if (error) throw error;
      if (c.allegato_path) await supabase.storage.from(BUCKET).remove([c.allegato_path]);
    },
    onSuccess: () => { toast.success(tr("Costo eliminato")); aggiorna(); },
    onError: (e) => toast.error(userErrorMessage(e, tr("Costo non eliminato."))),
  });

  // Costi «in attesa di fattura» e la fattura che intanto è arrivata dallo SDI (stesso fornitore, importo entro il 3%).
  const inAttesa = costi.some((c) => c.documento === "in_attesa");
  const arrivate = useQuery({
    queryKey: ["costi-fatture-arrivate", companyId, orderId],
    enabled: !!companyId && inAttesa,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: righe, error } = await db.rpc("costi_commessa_fatture_arrivate", { p_order: orderId });
      if (error) throw error;
      const perCosto = new Map<string, FatturaArrivata>();
      for (const r of (righe ?? []) as FatturaArrivata[]) if (!perCosto.has(r.costo_id)) perCosto.set(r.costo_id, r);
      return perCosto;
    },
  });
  const sostituisci = useMutation({
    mutationFn: async (f: FatturaArrivata) => {
      const { error } = await db.rpc("costo_sostituisci_con_fattura", { p_costo: f.costo_id, p_fattura: f.fattura_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Fattura agganciata"), { description: tr("Il costo a mano è sostituito dalla fattura: ora la trovi in «Fornitori».") });
      aggiorna();
      void queryClient.invalidateQueries({ queryKey: ["costi-fatture-arrivate"] });
      void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
    },
    onError: (e) => toast.error(userErrorMessage(e, tr("Fattura non agganciata."))),
  });

  return (
    <>
    {pagamentiDi && <ExpensePaymentDialog key={pagamentiDi} costId={pagamentiDi} onClose={() => { setPagamentiDi(null); aggiorna(); }} />}
    <RiquadroCommessa id="costi-commessa"
      icona={<Wallet className="h-5 w-5 text-primary" aria-hidden="true" />}
      descrizione={tr("Spese dirette, ricevute e costi in attesa di fattura della commessa.")}
      titolo={tr("Altri costi")} conteggio={costi.length}
      riassunto={costi.length > 0 ? tr("{importo} nel margine", { importo: formatCurrency(totale) }) : undefined}
      numeri={!isLoading && !isError ? <>
        <dl className="commessa-totali grid grid-cols-3 gap-3 rounded-md border bg-muted/20 p-3 sm:max-w-xl" aria-label={tr("Totali degli altri costi, IVA compresa")}>
          {([[tr("Totale"), totali.totale, false], [tr("Saldati"), totali.saldati, false], [tr("Da saldare"), totali.daSaldare, totali.daSaldare > 0]] as const).map(([titolo, valore, evidenza]) => (
            <div key={titolo}>
              <dt className="text-xs text-muted-foreground">{titolo}</dt>
              <dd className={`mt-1 text-sm font-semibold tabular-nums ${evidenza ? "text-amber-700" : ""}`}>{formatCurrency(valore)}</dd>
            </div>
          ))}
        </dl>
        <ContatoriFiltro etichetta={tr("Altri costi per stato")} attivo={filtro} onScegli={setFiltro} voci={[
          { chiave: "pagare", etichetta: tr("Da pagare"), valore: conta("pagare"), avviso: true },
          { chiave: "pagati", etichetta: tr("Pagati"), valore: conta("pagati") },
          { chiave: "ricevuta", etichetta: tr("Senza ricevuta"), valore: conta("ricevuta"), avviso: true },
          { chiave: "attesa", etichetta: tr("Fattura da arrivare"), valore: conta("attesa") },
        ]} />
      </> : undefined}
      azioni={puoModificare ? <Button size="sm" onClick={() => setModulo({})}><Plus className="mr-1.5 h-4 w-4" />{tr("Aggiungi costo")}</Button> : undefined}
    >
        <input
          ref={inputAllega}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          aria-label={tr("Ricevuta da allegare")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && allegaA) allega.mutate({ costId: allegaA, file });
            e.target.value = "";
            setAllegaA(null);
          }}
        />
        {isError ? (
          <p role="alert" className="text-sm text-destructive">{tr("Non riesco a leggere i costi.")} <button type="button" className="underline" onClick={() => void refetch()}>{tr("Riprova")}</button></p>
        ) : isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : costi.length === 0 ? (
          <div className="space-y-3">
            <p className="commessa-empty text-sm text-muted-foreground">{tr("Nessun costo senza fattura su questa commessa.")}</p>
            {puoModificare && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{tr("Aggiungine uno con un clic")}</p>
                <div className="flex flex-wrap gap-1.5" aria-label={tr("Costi pronti")}>
                  {COSTI_PRONTI.map((c) => (
                    <Button key={c.descrizione} size="sm" variant="outline" onClick={() => setModulo({ iniziale: dalPronto(c) })}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{tr(c.breve)}</Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <TabellaCommessa etichetta={tr("Altri costi")} righe={visibili} chiave={(c) => c.id} colonne={[
            { titolo: tr("Costo"), principale: true, cella: (c) => <>
              <span className="font-medium">{c.name}</span>
              {c.notes && <span className="block text-xs text-muted-foreground">{c.notes}</span>}
            </> },
            { titolo: tr("Tipo"), cella: (c) => { const l = TIPI_COSTO.find((t) => t.value === c.tipo)?.label; return l ? tr(l) : l; } },
            { titolo: tr("Data"), cella: (c) => <span className="whitespace-nowrap">{dataIt(c.due_date)}</span> },
            { titolo: tr("Fase"), cella: (c) => puoModificare && (data?.fasi.length ?? 0) > 0 ? (
              <OfficeSelect label={tr("Fase di {costo}", { costo: c.name })} value={c.order_work_phase_id ?? ""} disabled={scegliFase.isPending}
                onValueChange={(v) => scegliFase.mutate({ id: c.id, faseId: v || null })}
                className="h-7 max-w-44 rounded-lg px-1 text-xs"
                options={[{ value: "", label: tr("Senza fase") }, ...data!.fasi.map((f) => ({ value: f.id, label: f.name }))]} />
            ) : c.fase ?? "—" },
            { titolo: tr("Documento"), cella: (c) => (
              <div className="space-y-0.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENTO[c.documento].classe}`}>{c.documento === "fattura" ? tr("Fattura n. {numero}", { numero: c.fattura }) : tr(DOCUMENTO[c.documento].testo(c))}</span>
                {c.documento === "in_attesa" && arrivate.data?.get(c.id) && (() => {
                  const f = arrivate.data.get(c.id)!;
                  return (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
                      <span className="block">{tr("Arrivata? Fattura n. {numero}", { numero: f.numero_fattura ?? "—" })}{f.data_fattura ? ` del ${dataIt(f.data_fattura)}` : ""} · {formatCurrency(Number(f.totale ?? 0))}</span>
                      {puoModificare && !c.is_paid && (
                        <button type="button" className="font-medium text-primary underline underline-offset-2" disabled={sostituisci.isPending}
                          onClick={() => { if (window.confirm(tr("Sostituire «{costo}» con la fattura n. {numero} di {fornitore}? Il costo a mano si cancella, la fattura entra sulla commessa con la stessa fase.", { costo: c.name, numero: f.numero_fattura ?? "", fornitore: f.fornitore ?? tr("fornitore") }))) sostituisci.mutate(f); }}>
                          {tr("Sostituisci con la fattura")}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {c.allegato_path ? (
                  <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2" onClick={() => void apriRicevuta(c.allegato_path!, tr("Non riesco ad aprire la ricevuta."))}>
                    <Paperclip className="h-3 w-3" aria-hidden="true" />{c.allegato_nome ?? tr("Ricevuta")}
                  </button>
                ) : puoModificare && c.documento !== "fattura" ? (
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2" disabled={allega.isPending}
                    onClick={() => { setAllegaA(c.id); inputAllega.current?.click(); }}>
                    <Paperclip className="h-3 w-3" aria-hidden="true" />{tr("Allega ricevuta")}
                  </button>
                ) : null}
              </div>
            ) },
            { titolo: tr("Pagamento"), cella: (c) => (
              <div className="space-y-0.5">
                <button type="button" title={tr("Pagamenti e residuo")} aria-label={tr("Pagamenti di {costo}", { costo: c.name })} onClick={() => setPagamentiDi(c.id)}>
                  <StatoPill tono={c.is_paid ? "verde" : "ambra"}>{c.is_paid ? tr("Pagato") : tr("Da pagare")}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
                </button>
                {c.is_paid && c.paid_date && <p className="whitespace-nowrap text-xs text-muted-foreground">{tr("il {data}", { data: dataIt(c.paid_date) })}</p>}
              </div>
            ) },
            { titolo: tr("Importo"), destra: true, cella: (c) => <>
              <span className="font-medium">{formatCurrency(lordoCosto(c))}</span>
              {!!c.vat_rate && <span className="block whitespace-nowrap text-xs text-muted-foreground">{formatCurrency(c.amount)} + IVA {c.vat_rate}%</span>}
            </> },
            { titolo: tr("Azioni"), destra: true, senzaEtichetta: true, cella: (c) => puoModificare && !c.is_paid && c.documento !== "fattura" ? (
              /* Un costo pagato ha già scritto in cassa: si toglie da Economia → Costi, che storna il pagamento. */
              <div className="flex justify-end gap-0.5">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tr("Modifica {costo}", { costo: c.name })} onClick={() => setModulo({ costo: c })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tr("Elimina {costo}", { costo: c.name })} disabled={elimina.isPending}
                  onClick={() => { if (window.confirm(tr("Eliminare «{costo}»?", { costo: c.name }))) elimina.mutate(c); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ) : null },
          ]} />
        )}
      {modulo && companyId && (
        <NuovoCostoDialog
          orderId={orderId}
          companyId={companyId}
          fasi={data?.fasi ?? []}
          iniziale={modulo.iniziale}
          costo={modulo.costo}
          onClose={() => setModulo(null)}
          onSalvato={aggiorna}
        />
      )}
    </RiquadroCommessa>
    </>
  );
}

/** Fornitori già usati su questa commessa (costi e ordini d'acquisto): i primi da proporre. */
function useFornitoriCommessa(orderId: string, companyId: string) {
  return useQuery({
    queryKey: ["fornitori-commessa", companyId, orderId],
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const [costi, oda] = await Promise.all([
        db.from("company_costs").select("supplier_id").eq("company_id", companyId).eq("order_id", orderId).not("supplier_id", "is", null).limit(200),
        db.from("purchase_orders").select("supplier_id").eq("company_id", companyId).eq("order_id", orderId).not("supplier_id", "is", null).limit(200),
      ]);
      const conta = new Map<string, number>();
      for (const r of [...(costi.data ?? []), ...(oda.data ?? [])] as { supplier_id: string }[]) conta.set(r.supplier_id, (conta.get(r.supplier_id) ?? 0) + 1);
      const ids = [...conta.keys()].sort((a, b) => (conta.get(b) ?? 0) - (conta.get(a) ?? 0)).slice(0, 6);
      if (ids.length === 0) return [];
      const { data } = await db.from("suppliers").select("id, name").eq("company_id", companyId).in("id", ids);
      const nomi = new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
      return ids.filter((id) => nomi.has(id)).map((id) => ({ id, name: nomi.get(id)! }));
    },
  });
}

/** La ricevuta letta dall'AI (ai-fattura-ricevuta-ocr senza creare la fattura): il modulo si compila da sé. */
async function leggiRicevutaConAI(file: File, companyId: string, userId: string): Promise<RicevutaLetta> {
  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${userId}/costo_commessa_${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("silvio-uploads").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`File non caricato: ${upErr.message}`);
  const resp = await supabase.functions.invoke("ai-fattura-ricevuta-ocr", {
    body: { storage_path: path, bucket: "silvio-uploads", auto_create: false, company_id: companyId, mime_type: file.type, file_name: file.name },
  });
  if (resp.error) {
    let motivo = resp.error.message;
    try { const corpo = await (resp.error as { context?: Response }).context?.json?.(); if (corpo?.error) motivo = String(corpo.error); } catch { /* resta il messaggio generico */ }
    throw new Error(motivo);
  }
  const letto = (resp.data as { extracted?: RicevutaLetta } | null)?.extracted;
  if (!letto) throw new Error("L'AI non è riuscita a leggere la ricevuta.");
  return letto;
}

export function NuovoCostoDialog({ orderId, companyId, fasi, iniziale, costo, onClose, onSalvato, onCreato }: {
  orderId: string; companyId: string; fasi: Fase[];
  /** Un costo già salvato, da modificare. */
  costo?: CostoCommessa;
  /** Il modulo già compilato, per chi aggiunge un costo da un'altra vista. */
  iniziale?: Partial<FormCostoCommessa>;
  onClose: () => void; onSalvato: () => void;
  onCreato?: (costo: { id: string; imponibile: number }) => void;
}) {
  const tr = useT();
  const { user } = useAuth();
  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const [form, setForm] = useState<FormCostoCommessa>(() => (costo ? formDaCosto(costo) : { ...formCostoVuoto(oggi), ...iniziale }));
  const [file, setFile] = useState<File | null>(null);
  // L'importo si scrive come sta sulla ricevuta: di solito IVA compresa, a volte solo l'imponibile.
  const [ivaInclusa, setIvaInclusa] = useState(true);
  const [conNote, setConNote] = useState(!!form.note);
  const [lettura, setLettura] = useState<"no" | "in_corso" | "fatta" | "errore">("no");
  const [trascina, setTrascina] = useState(false);
  const inputFile = useRef<HTMLInputElement>(null);
  const set = <K extends keyof FormCostoCommessa>(k: K, v: FormCostoCommessa[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fornitoriCommessa = useFornitoriCommessa(orderId, companyId);

  const scritto = leggiImporto(form.importo);
  const iva = Number(form.aliquotaIva) || 0;
  const valido = Number.isFinite(scritto) && scritto > 0;
  const lordo = valido ? (ivaInclusa ? scritto : lordoDaNetto(scritto, iva)) : null;
  const imponibile = lordo != null ? calculateNetFromGross(lordo, iva).netAmount : null;

  const scegliFile = async (f: File | null) => {
    setFile(f);
    if (!f || costo) return;
    const errore = controllaRicevuta(f);
    if (errore) { toast.error(errore); return; }
    if (!user?.id) return;
    setLettura("in_corso");
    try {
      const letto = await leggiRicevutaConAI(f, companyId, user.id);
      const campi = formDaRicevuta(letto);
      // Il fornitore: lo stesso dell'anagrafica, per partita IVA.
      const piva = pivaPulita(letto.cedente?.piva);
      let fornitoreId: string | null = null;
      if (piva.length >= 8) {
        const { data } = await db.from("suppliers").select("id, vat_number").eq("company_id", companyId).ilike("vat_number", `%${piva}%`).limit(1);
        fornitoreId = (data?.[0] as { id: string } | undefined)?.id ?? null;
      }
      setIvaInclusa(true);
      setForm((x) => ({ ...x, ...campi, ...(fornitoreId ? { fornitoreId } : {}), ...(campi.senzaFattura === false ? { pagato: false } : {}) }));
      if (campi.note) setConNote(true);
      setLettura("fatta");
    } catch (e) {
      setLettura("errore");
      toast.error(tr("Ricevuta non letta: compila a mano"), { description: e instanceof Error ? e.message : undefined });
    }
  };

  const salva = useMutation({
    mutationFn: async () => {
      const daSalvare: FormCostoCommessa = { ...form, importo: lordo != null ? importoIt(lordo) : form.importo };
      const riga = rigaCostoCommessa(daSalvare, { companyId, orderId });
      if (file) { const errore = controllaRicevuta(file); if (errore) throw new Error(errore); }
      const path = file ? await caricaRicevuta(orderId, file) : null;
      if (costo) {
        const { error } = await db.from("company_costs").update({
          ...campiModificaCosto(daSalvare, { companyId, orderId }),
          ...(path ? { allegato_path: path, allegato_nome: file?.name ?? null } : {}),
        }).eq("id", costo.id).eq("company_id", companyId);
        if (error) {
          if (path) await supabase.storage.from(BUCKET).remove([path]);
          throw error;
        }
        // La ricevuta sostituita non serve più: se la pulizia fallisce resta solo un file in più.
        if (path && costo.allegato_path) await supabase.storage.from(BUCKET).remove([costo.allegato_path]);
        return { pagamento: null as string | null };
      }
      const { data: creato, error } = await db.from("company_costs")
        .insert({ ...riga, allegato_path: path, allegato_nome: file?.name ?? null })
        .select("id").single();
      if (error || !creato) {
        if (path) await supabase.storage.from(BUCKET).remove([path]);
        throw error ?? new Error(tr("Costo non salvato."));
      }
      onCreato?.({ id: creato.id, imponibile: riga.amount });
      if (!form.pagato) return { pagamento: null as string | null };
      // Stessa strada di Economia → Costi: stato, cassa e scadenze insieme.
      const { error: payErr } = await db.rpc("registra_pagamenti_costi", { p_ids: [creato.id], p_data: form.data });
      return { pagamento: payErr ? payErr.message : null };
    },
    onSuccess: ({ pagamento }) => {
      if (pagamento) toast.warning(tr("Costo salvato, ma il pagamento non è registrato"), { description: pagamento });
      else toast.success(costo ? tr("Costo aggiornato") : tr("Costo aggiunto alla commessa"));
      onSalvato();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : userErrorMessage(e, tr("Costo non salvato."))),
  });

  const fornitoriProposti = (fornitoriCommessa.data ?? []).filter((s) => s.id !== form.fornitoreId).slice(0, 4);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) onClose(); }}>
      <DialogContent struttura="contenuta" ampiezza="modulo" className="max-h-[90vh] max-w-2xl overflow-y-auto text-[13px] [&_label]:text-[13px]">
        <DialogHeader>
          <DialogTitle>{costo ? tr("Modifica costo") : tr("Aggiungi costo alla commessa")}</DialogTitle>
          <DialogDescription>{tr("Per le spese senza fattura (tassa comunale, bolli, F24) o quelle che aspettano ancora la fattura.")}</DialogDescription>
        </DialogHeader>
        <form
          className="commessa-modal-form"
          onSubmit={(e) => { e.preventDefault(); salva.mutate(); }}
        >
          <CorpoDialogOperativo>
          <input ref={inputFile} type="file" accept="application/pdf,image/*" className="hidden" aria-label="Ricevuta o F24"
            onChange={(e) => { void scegliFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          {/* La ricevuta per prima: se c'è, l'AI compila il resto. */}
          <div
            role="button"
            tabIndex={0}
            aria-disabled={lettura === "in_corso"}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-dashed px-3 py-1.5 text-left transition-colors ${trascina ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-muted/40"}`}
            onClick={() => { if (lettura !== "in_corso") inputFile.current?.click(); }}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && lettura !== "in_corso") { e.preventDefault(); inputFile.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setTrascina(true); }}
            onDragLeave={() => setTrascina(false)}
            onDrop={(e) => { e.preventDefault(); setTrascina(false); if (lettura !== "in_corso") void scegliFile(e.dataTransfer.files?.[0] ?? null); }}
          >
            {lettura === "in_corso" ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              : lettura === "fatta" ? <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              : <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">
                {lettura === "in_corso" ? tr("Leggo la ricevuta…")
                  : file ? file.name
                  : costo?.allegato_path ? tr("Sostituisci la ricevuta") : tr("Trascina ricevuta o F24")}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {lettura === "fatta" ? tr("compilato dalla ricevuta: controlla prima di salvare")
                  : lettura === "errore" ? tr("non letta: compila a mano, il file resta allegato")
                  : costo ? tr("PDF o foto, fino a 10 MB.") : tr("l'AI compila importo, IVA, data e fornitore")}
              </span>
            </span>
            {file && lettura !== "in_corso" && (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={(e) => { e.stopPropagation(); setFile(null); setLettura("no"); }}
                onKeyDown={(e) => e.stopPropagation()}>{tr("Togli")}</button>
            )}
          </div>
          <div>
            <Label htmlFor="costo-descrizione">{tr("Che costo è *")}</Label>
            <Input id="costo-descrizione" value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} placeholder={tr("es. Tassa comunale occupazione suolo")} maxLength={200} autoFocus={!!costo} />
            {!costo && !form.descrizione && (
              <div className="mt-1.5 flex flex-wrap gap-1" aria-label={tr("Costi pronti")}>
                {COSTI_PRONTI.map((c) => (
                  <button
                    key={c.descrizione}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                    onClick={() => setForm((f) => ({ ...f, ...dalPronto(c) }))}
                  >
                    {tr(c.breve)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="costo-importo">{tr("Importo (€) *")}</Label>
                <div className="flex rounded-md border text-[11px]" role="group" aria-label={tr("L'importo comprende l'IVA?")}>
                  {([[true, "IVA incl."], [false, "IVA escl."]] as const).map(([v, t]) => (
                    <button key={t} type="button" aria-pressed={ivaInclusa === v} onClick={() => setIvaInclusa(v)}
                      className={`px-1.5 py-0.5 ${ivaInclusa === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{tr(t)}</button>
                  ))}
                </div>
              </div>
              <Input id="costo-importo" inputMode="decimal" value={form.importo} onChange={(e) => set("importo", e.target.value)} placeholder="350,00" />
            </div>
            <div>
              <Label htmlFor="costo-iva">IVA</Label>
              <Select value={form.aliquotaIva} onValueChange={(v) => set("aliquotaIva", v)}>
                <SelectTrigger id="costo-iva"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{tr("Nessuna (0%)")}</SelectItem>
                  {VAT_RATES.filter((r) => r.value !== 0).map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="costo-data">{tr("Data *")}</Label>
              <Input id="costo-data" type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
            </div>
          </div>
          {lordo != null && iva > 0 && imponibile != null && (
            <p className="-mt-1 text-xs text-muted-foreground tabular-nums">
              {formatCurrency(imponibile)} + IVA {formatCurrency(lordo - imponibile)} = <span className="font-medium text-foreground">{formatCurrency(lordo)}</span> · {tr("nel margine entra l’imponibile.")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="costo-tipo">{tr("Di che tipo è")}</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as TipoCosto)}>
                <SelectTrigger id="costo-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_COSTO.map((t) => <SelectItem key={t.value} value={t.value}>{tr(t.label)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="costo-fase">{tr("Fase")}</Label>
              <Select value={form.faseId || "nessuna"} onValueChange={(v) => set("faseId", v === "nessuna" ? "" : v)} disabled={fasi.length === 0}>
                <SelectTrigger id="costo-fase"><SelectValue placeholder={tr("Nessuna")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">{tr("Tutta la commessa")}</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>{tr("Fornitore")}</Label>
              <SupplierSelect value={form.fornitoreId ?? ""} onValueChange={(v) => set("fornitoreId", v || null)} placeholder={tr("Nessuno")} searchable allowCreate />
            </div>
          </div>
          {fornitoriProposti.length > 0 && (
            <div className="-mt-1 flex flex-wrap items-center gap-1" aria-label={tr("Fornitori di questa commessa")}>
              <span className="text-[11px] text-muted-foreground">{tr("Già su questa commessa:")}</span>
              {fornitoriProposti.map((s) => (
                <button key={s.id} type="button" onClick={() => set("fornitoreId", s.id)}
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">{s.name}</button>
              ))}
            </div>
          )}
          {/* Una fila sola: due interruttori e, se resta da pagare, la scadenza. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border px-3 py-2">
            <label htmlFor="costo-senza-fattura" className="flex items-center gap-2" title={form.senzaFattura ? tr("Nessuno la manderà.") : tr("Quando arriva dallo SDI te la propongo da agganciare.")}>
              <Switch id="costo-senza-fattura" checked={form.senzaFattura} onCheckedChange={(v) => set("senzaFattura", v)} />
              <span>{tr("Senza fattura")}</span>
            </label>
            {!costo && (
              <label htmlFor="costo-pagato" className="flex items-center gap-2" title={form.pagato ? tr("Uscita alla data del costo, dalla cassa predefinita.") : tr("Resta da pagare.")}>
                <Switch id="costo-pagato" checked={form.pagato} onCheckedChange={(v) => set("pagato", v)} />
                <span>{tr("Già pagato")}</span>
              </label>
            )}
            {!costo && !form.pagato && (
              <label htmlFor="costo-scadenza" className="flex items-center gap-2">
                <span className="text-muted-foreground">{tr("Scadenza")}</span>
                <Input id="costo-scadenza" type="date" className="h-8 w-40" value={form.scadenza ?? ""} min={form.data} onChange={(e) => set("scadenza", e.target.value)} />
              </label>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {form.senzaFattura ? tr("Nessuna fattura in arrivo") : tr("La fattura, quando arriva, si aggancia qui")}
            </span>
          </div>
          {conNote ? (
            <div>
              <Label htmlFor="costo-note">{tr("Note")}</Label>
              <Textarea id="costo-note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} maxLength={200} />
            </div>
          ) : (
            <button type="button" className="self-start text-xs text-primary underline underline-offset-2" onClick={() => setConNote(true)}>{tr("+ Aggiungi una nota")}</button>
          )}
          </CorpoDialogOperativo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={salva.isPending}>{tr("Annulla")}</Button>
            <Button type="submit" disabled={salva.isPending || lettura === "in_corso" || !form.descrizione.trim() || !valido}>
              {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{costo ? tr("Salva") : tr("Aggiungi")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
