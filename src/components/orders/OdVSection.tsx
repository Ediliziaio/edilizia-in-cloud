import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { useOrderVariations } from "@/hooks/useOrderVariations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "./TabellaCommessa";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, Loader2, Copy, ExternalLink, Send, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { usePermissions } from "@/hooks/usePermissions";
import { type VariationContext } from "./VariationEditor";
import type { VariationDraft } from "@/lib/orders/variationDraft";
import { variationEventDate } from "@/lib/orders/pendingVariationDocument";
import { dettagliImpresa } from "@/lib/orders/variationDocumentContext";
import { caricaDatiSocietari, righeSocietarie } from "../../../supabase/functions/_shared/datiSocietari";
import { useCompanyAnagraficaForTemplate } from "@/hooks/useCompanyAnagraficaForTemplate";
import { PendingVariationPdf } from "./PendingVariationPdf";
import { VariationLifecycleDialog } from "./VariationLifecycleDialog";
import { VarianteDaDocumento } from "./VarianteDaDocumento";
import type { WorkflowVariation } from "@/hooks/useVariationWorkflow";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface OdVSectionProps {
  orderId: string;
  companyId: string;
  context?: VariationContext;
  onOpenDocuments?:()=>void;
  /** Un lavoro extra già scritto (dal preventivo accettato del committente): si apre subito, da salvare. */
  bozzaIniziale?: { id: string; bozza: VariationDraft };
  /** Chiamata alla chiusura del lavoro extra aperto con `bozzaIniziale`. */
  onBozzaChiusa?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; tono: TonoStato }> = {
  bozza: { label: "Bozza", tono: "grigio" },
  in_attesa: { label: "In attesa", tono: "ambra" },
  approvato: { label: "Approvato", tono: "verde" },
  rifiutato: { label: "Rifiutato", tono: "rosso" },
  annullato: { label: "Annullato", tono: "grigio" },
};

export function OdVSection({ orderId, companyId, context: contestoCommessa = {}, onOpenDocuments, bozzaIniziale, onBozzaChiusa }: OdVSectionProps) {
  const t = useT();
  // Senza i dati dell'impresa il riquadro nel PDF restava col solo nome.
  const anagrafica = useCompanyAnagraficaForTemplate();
  const { data: societarie } = useQuery({
    queryKey: ["dati-societari", companyId], staleTime: 5 * 60_000, enabled: !!companyId,
    queryFn: async () => righeSocietarie(await caricaDatiSocietari(supabase, companyId)),
  });
  const context: VariationContext = { ...contestoCommessa, societarie, companyId, companyDetails: contestoCommessa.companyDetails ?? dettagliImpresa(anagrafica) };
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{id:string;existing:boolean}|null>(() => bozzaIniziale ? { id: bozzaIniziale.id, existing: false } : null);
  // La variante scritta dall'AI da un documento (15/11/2026): si apre come una nuova, da salvare.
  const [bozzaAi, setBozzaAi] = useState<{ id: string; bozza: VariationDraft } | null>(null);
  const sending = useRef(new Set<string>());
  const [campiDi, setCampiDi] = useState<string | null>(null);
  const [invioEmailLoading, setInvioEmailLoading] = useState<string | null>(null);

  const { data: odvList = [], isLoading, isError, refetch } = useOrderVariations(orderId, companyId);
  // Total approved variazioni
  const totaleApprovato = odvList
    .filter(o => o.status === "approvato")
    .reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);
  // Riepilogo in testa: da dove si parte, cosa è approvato, cosa aspetta la firma, dove si arriva.
  const inAttesa = odvList.filter(o => o.status === "in_attesa" || o.status === "bozza");
  const totaleInAttesa = inAttesa.reduce((sum, o) => sum + Number(o.impatto_economico || 0), 0);
  const giorniApprovati = odvList.filter(o => o.status === "approvato").reduce((sum, o) => sum + Number(o.impatto_giorni || 0), 0);
  const contrattoAggiornato = typeof context.currentNet === "number" ? context.currentNet : null;
  const contrattoIniziale = contrattoAggiornato != null ? contrattoAggiornato - totaleApprovato : null;

  const copyFirmaLink = async (token: string) => {
    const url = `${window.location.origin}/firma-odv/${token}`;
    try { await navigator.clipboard.writeText(url); toast.success(t("Link di firma copiato!")); }
    catch { toast.error(t("Copia non riuscita. Apri il link e copialo dalla barra degli indirizzi.")); }
  };
  const approvate = odvList.filter(o => o.status === "approvato");
  // La fase che ogni variante approvata ha creato nelle Lavorazioni (06/11/2026): dalle sue voci, origine «variante».
  const fasiDaVarianti = useQuery({
    queryKey: ["varianti-fasi", orderId],
    enabled: approvate.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db.from("order_work_phase_voci").select("origine_codice, phase:order_work_phases(id,name)")
        .eq("order_id", orderId).eq("origine", "variante").limit(1000);
      if (error) throw error;
      const m = new Map<string, { id: string; name: string }>();
      for (const v of (data ?? []) as Array<{ origine_codice: string | null; phase: { id: string; name: string } | null }>) if (v.origine_codice && v.phase) m.set(v.origine_codice, v.phase);
      return m;
    },
  });
  const creaFase = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)("variante_crea_lavori_da_ufficio", { p_variante: id });
      if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? t("La creazione della fase non è ancora attiva su questo database.") : error.message);
      if (!data) throw new Error(t("Questa variante non crea lavori (è una riduzione o un importo negativo)."));
    },
    onSuccess: () => {
      toast.success(t("Fase creata nelle Lavorazioni"));
      void queryClient.invalidateQueries({ queryKey: ["varianti-fasi", orderId] });
      refreshWorkQueries(queryClient, orderId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const colonne: ColonnaTabella<WorkflowVariation>[] = [
    { titolo: t("Variante"), principale: true, cella: odv => (
      <div className="min-w-0 max-w-xl">
        <p className="font-medium"><span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">OdV #{odv.numero_odv}</span>{odv.titolo}</p>
        <p className="line-clamp-1 text-xs font-normal text-muted-foreground max-sm:hidden" title={odv.descrizione}>{odv.descrizione}</p>
        {odv.richiesto_da && <p className="text-xs font-normal text-muted-foreground">{t("Richiesto da: {nome}", { nome: odv.richiesto_da })}</p>}
      </div>
    ) },
    { titolo: t("Importo"), destra: true, cella: odv => <span className="font-medium">{formatCurrency(odv.impatto_economico)}</span> },
    { titolo: t("Giorni"), destra: true, cella: odv => (odv.impatto_giorni > 0 ? `+${odv.impatto_giorni}` : "—") },
    { titolo: t("Stato"), cella: odv => {
      const cfg = STATUS_CONFIG[odv.status] || STATUS_CONFIG.in_attesa;
      const quando = variationEventDate(odv.offline_signed_on ?? odv.firmato_il);
      const fase = fasiDaVarianti.data?.get(odv.id);
      const lavori = odv.status === "approvato" && Number(odv.impatto_economico) >= 0;
      return <><StatoPill tono={cfg.tono}>{t(cfg.label)}</StatoPill>{quando && <p className="mt-0.5 text-xs text-muted-foreground">{odv.status === "approvato" ? t("Approvato") : odv.status === "rifiutato" ? t("Rifiutato") : t("Elaborato")} {quando}</p>}
        {lavori && fase && <p className="mt-0.5 text-xs text-emerald-700">{t("Nelle Lavorazioni: {fase}", { fase: fase.name })}</p>}
        {lavori && !fase && fasiDaVarianti.isSuccess && permissions.canEditOrders && <Button variant="outline" size="sm" className="mt-1 h-7 text-xs" disabled={creaFase.isPending} onClick={() => creaFase.mutate(odv.id)}>
          {creaFase.isPending && creaFase.variables === odv.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{t("Crea la fase nelle Lavorazioni")}</Button>}
        {odv.status === "in_attesa" && <p className="mt-0.5 text-xs text-muted-foreground">{t("Quando il cliente accetta diventa una fase delle Lavorazioni")}</p>}</>;
    } },
    { titolo: t("Azioni"), intestazione: <span className="sr-only">{t("Azioni")}</span>, destra: true, senzaEtichetta: true, cella: odv => {
      const linkAttivo = odv.status === "in_attesa" && odv.firma_token && !odv.link_revoked_at && (!odv.link_expires_at || new Date(odv.link_expires_at).getTime() > Date.now());
      return (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {permissions.canEditOrders && odv.status === "in_attesa" && !odv.current_document_id && <PendingVariationPdf variation={odv} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments} />}
          {permissions.canEditOrders && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing({id:odv.id,existing:true})}>{odv.status === "bozza" ? t("Riprendi bozza") : t("Documento e approvazione")}</Button>}
          {permissions.canEditOrders && linkAttivo && <>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyFirmaLink(odv.firma_token as string)}><Copy className="mr-1 h-3 w-3" /> {t("Copia link")}</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700" disabled={invioEmailLoading === odv.id}
              onClick={async () => {
                if (sending.current.has(odv.id) || !permissions.canEditOrders) return;
                sending.current.add(odv.id);
                setInvioEmailLoading(odv.id);
                try {
                  const { data, error } = await supabase.functions.invoke("invia-odv", { body: { odv_id: odv.id } });
                  if (error || data?.success !== true) throw error || new Error(t("Invio non confermato"));
                  toast.success(t("Email inviata al cliente"));
                  queryClient.invalidateQueries({ queryKey: ["ordini-variazione", orderId] });
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : t("Errore nell'invio email"));
                } finally {
                  sending.current.delete(odv.id);
                  setInvioEmailLoading(null);
                }
              }}>
              {invioEmailLoading === odv.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              {t("Invia per email")}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => window.open(`/firma-odv/${odv.firma_token}`, "_blank")} aria-label={t("Apri link firma")}><ExternalLink className="h-3 w-3" /></Button>
          </>}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t("Campi personalizzati di OdV {n}", { n: odv.numero_odv })} title={t("Campi personalizzati")} onClick={() => setCampiDi(odv.id)}><SlidersHorizontal className="h-3.5 w-3.5" /></Button>
        </div>
      );
    } },
  ];

  return (
    <>
      <RiquadroCommessa icona={<GitBranch className="h-4 w-4 shrink-0 text-primary" aria-hidden />} titolo={t("Lavori extra e varianti")} conteggio={odvList.length}
        azioni={permissions.canEditOrders ? <div className="flex gap-2">
          {!isLoading && !isError && <VarianteDaDocumento companyId={companyId} context={context}
            onBozza={(bozza) => { const id = crypto.randomUUID(); setBozzaAi({ id, bozza }); setEditing({ id, existing: false }); }} />}
          <Button size="sm" disabled={isLoading || isError} onClick={() => setEditing({id:crypto.randomUUID(),existing:false})} aria-label={t("Nuova variante")}>
            <Plus className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">{t("Nuova variante")}</span>
          </Button>
        </div> : undefined}
        numeri={!isLoading && !isError ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("Riepilogo varianti")}>
            <RiepilogoVoce titolo={t("Contratto iniziale")} valore={contrattoIniziale == null ? "—" : formatCurrency(contrattoIniziale)} />
            <RiepilogoVoce titolo={t("Varianti approvate ({n})", { n: approvate.length })}
              valore={`${totaleApprovato > 0 ? "+" : ""}${formatCurrency(totaleApprovato)}`} tono={totaleApprovato < 0 ? "rosso" : totaleApprovato > 0 ? "verde" : undefined}
              nota={giorniApprovati > 0 ? t("+{n} giorni di lavoro", { n: giorniApprovati }) : undefined} />
            <RiepilogoVoce titolo={t("Da approvare ({n})", { n: inAttesa.length })} valore={formatCurrency(totaleInAttesa)} tono={inAttesa.length > 0 ? "ambra" : undefined}
              nota={inAttesa.length > 0 ? t("non ancora nel contratto") : t("niente in sospeso")} />
            <RiepilogoVoce titolo={t("Contratto aggiornato")} valore={contrattoAggiornato == null ? "—" : formatCurrency(contrattoAggiornato)} forte nota={t("iniziale + approvate, IVA esclusa")} />
          </div>
        ) : undefined}>
        {isError ? <div role="alert" className="text-sm text-destructive">{t("Varianti non disponibili.")} <Button variant="outline" size="sm" onClick={() => refetch()}>{t("Riprova")}</Button></div> : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : odvList.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground max-sm:text-xs">
            {t("Nessuna variante registrata.")}<span className="max-sm:hidden"> {t("Il PDF ha voci, totali, condizioni contrattuali e firme: si stampa da firmare oppure si manda col link di firma online.")}</span>
          </p>
        ) : (
          <TabellaCommessa etichetta={t("Varianti della commessa")} colonne={colonne} righe={odvList as WorkflowVariation[]} chiave={odv => odv.id} />
        )}
      </RiquadroCommessa>

      <Dialog open={!!campiDi} onOpenChange={aperto => { if (!aperto) setCampiDi(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Campi personalizzati")}</DialogTitle><DialogDescription>{t("I campi che l'azienda ha aggiunto alle varianti.")}</DialogDescription></DialogHeader>
          {campiDi && <EntityCustomFieldsSection entityType="ordini_variazione" entityId={campiDi} />}
        </DialogContent>
      </Dialog>
      {editing && <VariationLifecycleDialog key={`${companyId}:${orderId}:${editing.id}`} id={editing.id} existing={editing.existing} order={orderId} company={companyId} context={context} canEdit={permissions.canEditOrders}
        bozzaIniziale={editing.id === bozzaIniziale?.id ? bozzaIniziale.bozza : editing.id === bozzaAi?.id ? bozzaAi.bozza : undefined}
        onClose={() => { const daBozza = editing.id === bozzaIniziale?.id; setEditing(null); setBozzaAi(null); if (daBozza) onBozzaChiusa?.(); }} />}
    </>
  );
}

function RiepilogoVoce({ titolo, valore, nota, tono, forte }: { titolo: string; valore: string; nota?: string; tono?: "verde" | "ambra" | "rosso"; forte?: boolean }) {
  const colore = tono === "verde" ? "text-green-700" : tono === "ambra" ? "text-amber-700" : tono === "rosso" ? "text-red-700" : "text-foreground";
  return (
    <div className={`rounded-lg border p-2.5 ${forte ? "border-primary/40 bg-primary/5" : "bg-muted/20"}`}>
      <p className="truncate text-[11px] text-muted-foreground">{titolo}</p>
      <p className={`text-sm font-semibold tabular-nums ${colore}`}>{valore}</p>
      {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}
