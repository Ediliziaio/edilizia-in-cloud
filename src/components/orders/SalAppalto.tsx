/**
 * SalAppalto — il rendiconto che mandi al committente.
 * ────────────────────────────────────────────────────────────────────────────
 * Prende le righe CONFERMATE di un periodo e le chiude in un documento con un
 * numero progressivo per committente. Dal momento in cui il documento non è più
 * in bozza, quelle righe non si toccano più: è quello che lo rende una prova e
 * non un appunto. Si libera solo annullando una bozza.
 *
 * Due modi, scelti sul contratto: per commessa, o un documento al mese con
 * tutte le commesse di quel committente. Lo stesso componente serve i due casi:
 * con `orderId` lavora su una commessa, senza lavora su tutto il committente.
 *
 * La composizione la fa il database in un colpo solo (`appalto_sal_crea`):
 * numero sotto lock e righe agganciate nella stessa transazione, così due
 * persone che compongono nello stesso momento non prendono lo stesso numero.
 *
 * Fase 5 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Loader2, Trash2, Send, CheckCircle2, Receipt, Lock,
  Printer, Link2, Unlink, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useRendicontoAppaltoPDF } from "@/hooks/useRendicontoAppaltoPDF";
import { raggruppaPerCantiere, prefillFatturaDaRendiconto, type RigaDaStampare } from "@/lib/appalto/fattura";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { euro } from "@/lib/clienti/schedaCliente";
import { periodoDaRendicontare, periodoDaRigheInAttesa, STATI_SAL } from "@/lib/appalto/rendiconto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";

export interface Sal {
  id: string; numero: number; stato: string;
  /** L'azienda: serve per creare l'anagrafica del committente alla fattura. */
  company_id?: string | null;
  periodo_dal: string; periodo_al: string;
  totale: number; ritenuta: number; netto: number; righe_contate: number;
  order_id: string | null; note: string | null;
  contratto_id: string;
  documento_fiscale_id: string | null;
  /** La fattura agganciata, se c'è: serve per dire «quale» e non solo «sì». */
  documenti_fiscali?: { id: string; numero: string; stato: string } | null;
  /** Il cantiere, quando il rendiconto è di uno solo: con la fatturazione per
      commessa, sulla scheda del committente, senza questo non si capisce a
      quale dei suoi cantieri si riferisca il documento. */
  orders?: { order_code: string | null; description: string | null } | null;
}

/** Un documento che si può agganciare a un rendiconto. */
interface DocumentoCollegabile {
  id: string; numero: string; tipo: string; stato: string;
  data_emissione: string; totale_documento: number;
}

interface Props {
  committenteId: string | null;
  /** Se c'è, il blocco lavora su questa commessa; se manca, su tutto il committente. */
  orderId?: string | null;
  modoFatturazione?: "per_commessa" | "mensile_cumulativa" | null;
  puoModificare: boolean;
  vedeImporti: boolean;
}

const giornoIT = (iso: string) => {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a.slice(2)}` : iso;
};

export function SalAppalto({ committenteId, orderId, modoFatturazione, puoModificare, vedeImporti }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const permessi = usePermissions();
  const { stampa, isGenerating } = useRendicontoAppaltoPDF();
  /* Le date delle righe gia' confermate e non ancora in un rendiconto: servono
     solo a proporre il periodo giusto (vedi `periodoDaRigheInAttesa`). */
  const inAttesa = useQuery({
    queryKey: ["appalto-rendiconto", "in-attesa", committenteId, orderId ?? "tutti"],
    enabled: !!committenteId && vedeImporti,
    queryFn: async (): Promise<string[]> => {
      let q = (supabase as any)
        .from("appalto_rendiconto_righe")
        .select("data, orders!inner(customer_id, order_type, deleted_at)")
        .eq("stato", "confermata")
        .is("sal_id", null)
        .eq("orders.customer_id", committenteId)
        .eq("orders.order_type", "appaltatore_lavoro")
        .is("orders.deleted_at", null)
        .limit(1000);
      if (orderId) q = q.eq("order_id", orderId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as { data: string }[]).map((r) => r.data);
    },
  });
  const proposto = useMemo(
    () => (inAttesa.data ? periodoDaRigheInAttesa(inAttesa.data) : periodoDaRendicontare()),
    [inAttesa.data],
  );

  const [form, setForm] = useState<{ dal: string; al: string; soloQuesta: boolean; note: string } | null>(null);
  const [daAnnullare, setDaAnnullare] = useState<Sal | null>(null);
  const [daCollegare, setDaCollegare] = useState<Sal | null>(null);
  const [daStaccare, setDaStaccare] = useState<Sal | null>(null);

  const chiave = ["appalto-sal", committenteId, orderId ?? "tutti"];

  const sal = useQuery({
    queryKey: chiave,
    enabled: vedeImporti && !!committenteId,
    queryFn: async (): Promise<Sal[]> => {
      let q = (supabase as any)
        .from("appalto_sal")
        .select(
          "id, company_id, numero, stato, periodo_dal, periodo_al, totale, ritenuta, netto, righe_contate, order_id, note, contratto_id, documento_fiscale_id, documenti_fiscali(id, numero, stato), orders(order_code, description)",
        )
        .eq("committente_id", committenteId);
      // Su una commessa interessano i documenti che la riguardano: i suoi, e
      // quelli cumulativi, che possono contenere le sue righe.
      if (orderId) q = q.or(`order_id.eq.${orderId},order_id.is.null`);
      const { data, error } = await q.order("numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sal[];
    },
  });

  const componi = useMutation({
    mutationFn: async (f: { dal: string; al: string; soloQuesta: boolean; note: string }) => {
      const { data, error } = await (supabase as any).rpc("appalto_sal_crea", {
        p_committente_id: committenteId,
        p_dal: f.dal,
        p_al: f.al,
        p_order_id: f.soloQuesta && orderId ? orderId : null,
        p_note: f.note.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ["appalto-sal"] });
      queryClient.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
      toast({ title: "Rendiconto composto", description: "Le righe che vi sono entrate ora sono congelate." });
    },
    onError: (e) => {
      logger.error("appalto_sal_crea", e);
      toast({ title: "Rendiconto non composto", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await (supabase as any).from("appalto_sal").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appalto-sal"] });
      queryClient.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
    },
    onError: (e) => toast({ title: "Stato non cambiato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const annulla = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("appalto_sal").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDaAnnullare(null);
      queryClient.invalidateQueries({ queryKey: ["appalto-sal"] });
      queryClient.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
      toast({ title: "Rendiconto annullato", description: "Le righe sono tornate libere." });
    },
    onError: (e) => toast({ title: "Non annullato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  /**
   * La bozza di fattura che nasce dal rendiconto.
   *
   * Non la scrive qui: prepara i dati e li passa all'editor dei documenti, che
   * sa già fare numerazione, riepilogo IVA ed emissione. Duplicare quella
   * logica vorrebbe dire due posti che col tempo dicono numeri diversi.
   */
  const preparaFattura = useMutation({
    mutationFn: async (s: Sal) => {
      const [righeRes, contrattoRes, committenteRes] = await Promise.all([
        (supabase as any)
          .from("appalto_rendiconto_righe")
          .select("id, order_id, data, descrizione, unita_misura, prezzo_unitario, quantita, maggiorazione_pct, importo, extra_contratto, note")
          .eq("sal_id", s.id),
        (supabase as any)
          .from("appalto_contratti")
          .select("regime_iva, ritenuta_pct, riferimento_committente, giorni_pagamento")
          .eq("id", s.contratto_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("business_name, first_name, last_name, vat_number, fiscal_code, address, city, postal_code, province")
          .eq("id", committenteId!)
          .maybeSingle(),
      ]);
      if (righeRes.error) throw righeRes.error;
      const righe = (righeRes.data ?? []) as RigaDaStampare[];
      if (righe.length === 0) throw new Error("Questo rendiconto non ha righe");

      const orderIds = [...new Set(righe.map((r) => r.order_id))];
      const { data: cantieriData } = await supabase
        .from("orders").select("id, order_code, description").in("id", orderIds);

      const contratto = (contrattoRes.data ?? {}) as {
        regime_iva?: string; ritenuta_pct?: number;
        riferimento_committente?: string | null; giorni_pagamento?: number | null;
      };

      /* L'anagrafica del committente: la fattura deve nascere agganciata a lei,
         non solo col suo nome scritto sopra. Stessa regola dell'editor quando
         si scrive un cliente nuovo: si cerca per P.IVA o codice fiscale dentro
         l'azienda, e se non c'e' si crea. Se qualcosa va storto non si blocca
         la fattura: si va avanti senza, e il cliente si sceglie a mano. */
      const comm = (committenteRes.data ?? {}) as Record<string, string | null>;
      let anagraficaId: string | null = null;
      try {
        for (const [colonna, valore] of [
          ["partita_iva", comm.vat_number],
          ["codice_fiscale", comm.fiscal_code],
        ] as Array<[string, string | null | undefined]>) {
          if (!valore || anagraficaId || !s.company_id) continue;
          const { data } = await (supabase as any)
            .from("anagrafiche_native").select("id")
            .eq("company_id", s.company_id!).eq(colonna, valore).eq("attivo", true).limit(1);
          anagraficaId = ((data ?? [])[0]?.id as string | undefined) ?? null;
        }
        if (!anagraficaId && s.company_id) {
          const nome = (comm.business_name ?? "").trim()
            || [comm.first_name, comm.last_name].filter(Boolean).join(" ").trim();
          const { data } = await (supabase as any)
            .from("anagrafiche_native")
            .insert({
              company_id: s.company_id,
              tipo: "cliente",
              tipo_cliente: "B2B",
              ragione_sociale: nome || "Committente",
              partita_iva: comm.vat_number ?? null,
              codice_fiscale: comm.fiscal_code ?? null,
              indirizzo_via: comm.address ?? null,
              indirizzo_comune: comm.city ?? null,
              indirizzo_cap: comm.postal_code ?? null,
              indirizzo_provincia: comm.province ?? null,
              indirizzo_nazione: "IT",
              cliente_id: committenteId,
              attivo: true,
            })
            .select("id").single();
          anagraficaId = (data?.id as string | undefined) ?? null;
        }
      } catch (e) {
        logger.error("preparaFattura anagrafica", e);
      }

      return prefillFatturaDaRendiconto({
        anagraficaId,
        numero: s.numero,
        periodoDal: s.periodo_dal,
        periodoAl: s.periodo_al,
        cantieri: raggruppaPerCantiere(righe, (cantieriData ?? []) as Array<{
          id: string; order_code: string | null; description: string | null;
        }>),
        committente: (committenteRes.data ?? {}) as Record<string, string | null>,
        riferimentoCommittente: contratto.riferimento_committente ?? null,
        regimeIva: contratto.regime_iva === "reverse_charge" ? "reverse_charge" : "ordinaria",
        ritenutaPct: Number(contratto.ritenuta_pct ?? 0),
        giorniPagamento: contratto.giorni_pagamento ?? null,
      });
    },
    onSuccess: (prefilled, s) => {
      // L'aggancio lo chiude l'editor appena il documento esiste: è lì che
      // nasce il suo id. Vedi EditorDocumento, parametro `appalto_sal`.
      navigate(`/azienda/documenti/nuovo?tipo=fattura&appalto_sal=${s.id}`, { state: { prefilled } });
    },
    onError: (e) => {
      logger.error("preparaFattura", e);
      toast({ title: "Fattura non preparata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  /**
   * I documenti che si possono ancora agganciare: SOLO quelli di questo
   * committente.
   *
   * Prima l'elenco era di tutte le fatture dell'azienda, comprese quelle di
   * altri clienti: si agganciava al rendiconto di un committente la fattura di
   * un condominio, e il suo incasso finiva nei conti di chi non l'aveva mai
   * ricevuta. Il database adesso lo rifiuta (`appalto_sal_collega_fattura`);
   * qui non si offre nemmeno, perche' un errore che non si puo' tentare e'
   * meglio di un errore spiegato bene.
   *
   * Il filtro passa dall'anagrafica (`cliente_id`), che e' il legame vero; i
   * documenti vecchi senza anagrafica restano fuori dall'elenco e si agganciano
   * dalla fattura, non da qui.
   */
  const collegabili = useQuery({
    queryKey: ["appalto-sal-collegabili", daCollegare?.id, committenteId],
    enabled: !!daCollegare,
    queryFn: async (): Promise<DocumentoCollegabile[]> => {
      const { data: anagrafiche } = await (supabase as any)
        .from("anagrafiche_native").select("id").eq("cliente_id", committenteId);
      const ids = ((anagrafiche ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("documenti_fiscali")
        .select("id, numero, tipo, stato, data_emissione, totale_documento")
        .is("deleted_at", null)
        .in("anagrafica_id", ids)
        .in("tipo", ["fattura", "fattura_pa", "proforma", "parcella", "reverse_charge_interno"])
        .neq("stato", "annullata")
        .order("data_emissione", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DocumentoCollegabile[];
    },
  });

  const collega = useMutation({
    mutationFn: async ({ salId, documentoId }: { salId: string; documentoId: string }) => {
      const { error } = await (supabase as any).rpc("appalto_sal_collega_fattura", {
        p_sal_id: salId, p_documento_id: documentoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDaCollegare(null);
      queryClient.invalidateQueries({ queryKey: ["appalto-sal"] });
      toast({ title: "Fattura agganciata", description: "Il rendiconto passerà a «fatturato» quando la fattura viene emessa." });
    },
    onError: (e) => toast({ title: "Non agganciata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const scollega = useMutation({
    mutationFn: async (salId: string) => {
      const { error } = await (supabase as any).rpc("appalto_sal_scollega_fattura", { p_sal_id: salId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appalto-sal"] });
      toast({ title: "Fattura staccata", description: "Lo stato del rendiconto non torna indietro: può averla emessa il committente." });
    },
    onError: (e) => toast({ title: "Non staccata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  if (!vedeImporti || !committenteId) return null;

  const cumulativo = modoFatturazione === "mensile_cumulativa";

  return (
    <QuoteCard
      title="Rendiconti al committente"
      icon={<FileText className="h-4 w-4" />}
      subtitle={
        cumulativo
          ? "Il contratto prevede un documento al mese con tutte le commesse di questo committente."
          : "Il contratto prevede un rendiconto per commessa."
      }
      action={puoModificare ? (
        <Button size="sm" variant="outline"
          onClick={() => setForm({ dal: proposto.dal, al: proposto.al, soloQuesta: !cumulativo && !!orderId, note: "" })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Componi
        </Button>
      ) : undefined}
    >
      {sal.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (sal.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">
          Nessun rendiconto. Si compone da quello che è già <strong>confermato</strong>: le righe in
          bozza restano fuori finché non le guardi.
        </p>
      ) : (
        <div className="space-y-2">
          {(sal.data ?? []).map((s) => {
            const info = STATI_SAL[s.stato] ?? { etichetta: s.stato, spiega: "" };
            return (
              <div key={s.id} className={cn(
                "rounded-lg border p-3",
                s.stato === "bozza" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white",
              )}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* Un <div>, non un <p>: i Badge sono div e dentro un
                        paragrafo il browser chiude il paragrafo da solo. */}
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      N. {s.numero}
                      <Badge variant={s.stato === "bozza" ? "outline" : "secondary"}>{info.etichetta}</Badge>
                      {s.order_id === null
                        ? <Badge variant="outline" className="text-[10px]">tutte le commesse</Badge>
                        : <Badge variant="outline" className="max-w-[16rem] truncate text-[10px]"
                                 title={s.orders?.description ?? undefined}>
                            {s.orders?.order_code ?? "una sola commessa"}
                          </Badge>}
                      {s.stato !== "bozza" && <Lock className="h-3 w-3 text-slate-400" />}
                    </div>
                    <p className="text-xs text-slate-500">
                      {giornoIT(s.periodo_dal)} → {giornoIT(s.periodo_al)} · {s.righe_contate}{" "}
                      {s.righe_contate === 1 ? "riga" : "righe"} · {info.spiega}
                    </p>
                    {s.note && <p className="mt-0.5 text-xs text-slate-600">{s.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums text-slate-900">{euro(s.netto, true)}</p>
                    {Number(s.ritenuta) > 0 && (
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {euro(s.totale, true)} − {euro(s.ritenuta, true)} di ritenuta
                      </p>
                    )}
                  </div>
                </div>

                {/* Fatturato ma senza fattura agganciata. Due strade portano
                    qui e il sistema non le distingue: l'autofattura del
                    committente («L'ha fatturato lui») e uno «Stacca». In
                    entrambi i casi lo stato non torna indietro, e senza una
                    riga come questa la scheda direbbe «è diventato una
                    fattura» indicando il nulla. */}
                {!s.documento_fiscale_id && s.stato === "fatturato" && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-900">
                    Nessuna fattura agganciata: o l'ha emessa il committente, o quella che c'era è
                    stata staccata. Lo stato «fatturato» non torna indietro; se la fattura è tua,
                    collegala.
                  </div>
                )}

                {/* La fattura agganciata: si dice QUALE, non solo che c'è. */}
                {s.documento_fiscale_id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                    <Receipt className="h-3.5 w-3.5 text-slate-500" />
                    <Link
                      to={`/azienda/documenti/${s.documento_fiscale_id}`}
                      className="font-medium text-blue-700 underline-offset-2 hover:underline"
                    >
                      Fattura {s.documenti_fiscali?.numero ?? "collegata"}
                      <ExternalLink className="ml-1 inline h-3 w-3" />
                    </Link>
                    {s.documenti_fiscali?.stato === "bozza" && (
                      <span className="text-slate-500">
                        è ancora una bozza: il rendiconto passa a «fatturato» quando la emetti
                      </span>
                    )}
                    {puoModificare && (
                      <Button size="sm" variant="ghost" className="ml-auto h-6 px-2"
                        onClick={() => {
                          /* Su una bozza si stacca e basta. Su una fattura gia'
                             emessa no: il rendiconto resta «fatturato» per
                             sempre — lo stato non torna indietro — e si
                             ritroverebbe senza fattura senza sapere perche'. */
                          if (s.documenti_fiscali?.stato === "bozza") { scollega.mutate(s.id); return; }
                          setDaStaccare(s);
                        }}>
                        <Unlink className="mr-1 h-3 w-3" /> Stacca
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                  {/* La stampa è il documento che il committente riceve: c'è
                      sempre, anche su una bozza e anche su un rendiconto chiuso. */}
                  <Button size="sm" variant="outline" disabled={isGenerating} onClick={() => stampa(s.id)}>
                    {isGenerating
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Printer className="mr-1.5 h-3.5 w-3.5" />}
                    Stampa
                  </Button>

                  {puoModificare && s.stato === "bozza" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => cambiaStato.mutate({ id: s.id, stato: "inviato" })}>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Mandato al committente
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDaAnnullare(s)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" /> Annulla
                      </Button>
                    </>
                  )}
                  {puoModificare && s.stato === "inviato" && (
                    <Button size="sm" variant="outline" onClick={() => cambiaStato.mutate({ id: s.id, stato: "approvato" })}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> L'ha approvato
                    </Button>
                  )}

                  {/* Fatturare. Due strade, perché i due casi esistono
                      entrambi: la fattura la emetti tu, oppure l'autofattura la
                      fa il committente e tu segni che è andata. */}
                  {puoModificare && s.stato !== "bozza" && !s.documento_fiscale_id && (
                    <>
                      {/* Una fattura da preparare ha senso finché il rendiconto
                          non è già dichiarato fatturato: dopo, quello che manca
                          è il documento da agganciare, non uno nuovo. */}
                      {permessi.canViewBilling && s.stato !== "fatturato" && (
                        <Button size="sm" variant="outline" disabled={preparaFattura.isPending}
                          onClick={() => preparaFattura.mutate(s)}>
                          {preparaFattura.isPending
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Receipt className="mr-1.5 h-3.5 w-3.5" />}
                          Prepara la fattura
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDaCollegare(s)}>
                        <Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega una fattura già fatta
                      </Button>
                      {s.stato === "approvato" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => cambiaStato.mutate({ id: s.id, stato: "fatturato" })}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> L'ha fatturato lui
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Comporre ─── */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Componi il rendiconto</DialogTitle>
            <DialogDescription>
              Entrano le righe <strong>confermate</strong> del periodo che non sono già in un altro
              rendiconto. Dopo, quelle righe non si toccano più.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="s-dal">Dal</Label>
                  <Input id="s-dal" type="date" value={form.dal} onChange={(e) => setForm({ ...form, dal: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="s-al">Al</Label>
                  <Input id="s-al" type="date" value={form.al} onChange={(e) => setForm({ ...form, al: e.target.value })} />
                </div>
              </div>
              {orderId && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 pr-3">
                    <Label className="cursor-pointer">Solo questa commessa</Label>
                    <p className="text-xs text-slate-500">
                      Spento, il rendiconto prende tutte le commesse di questo committente nel periodo.
                    </p>
                  </div>
                  <Switch checked={form.soloQuesta} onCheckedChange={(v) => setForm({ ...form, soloQuesta: v })} />
                </div>
              )}
              <div>
                <Label htmlFor="s-note">Note per il committente</Label>
                <Textarea id="s-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
            <Button disabled={!form?.dal || !form?.al || componi.isPending} onClick={() => form && componi.mutate(form)}>
              {componi.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Componi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Collegare una fattura già fatta ─── */}
      <Dialog open={!!daCollegare} onOpenChange={(o) => !o && setDaCollegare(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Collega una fattura al rendiconto n. {daCollegare?.numero}</DialogTitle>
            <DialogDescription>
              Una fattura aggancia <strong>un solo</strong> rendiconto: lo stesso incasso non si conta
              due volte. Se la fattura è ancora una bozza, il rendiconto passerà a «fatturato» quando
              la emetti.
            </DialogDescription>
          </DialogHeader>
          {collegabili.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : (collegabili.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              Nessuna fattura di questo committente da collegare. Usa{" "}
              <strong>Prepara la fattura</strong>: nasce già con le righe del rendiconto e intestata
              a lui.
            </p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {(collegabili.data ?? []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={collega.isPending}
                  onClick={() => daCollegare && collega.mutate({ salId: daCollegare.id, documentoId: d.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{d.numero}</span>
                    <span className="block text-xs text-slate-500">
                      {giornoIT(d.data_emissione)} · {d.tipo.replace(/_/g, " ")} · {d.stato}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {euro(d.totale_documento, true)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDaCollegare(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Annullare una bozza ─── */}
      <AlertDialog open={!!daAnnullare} onOpenChange={(o) => !o && setDaAnnullare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare il rendiconto n. {daAnnullare?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Diceva «il numero non verrà riusato», e non era vero: il
                  progressivo e' max(numero)+1, quindi il prossimo rendiconto
                  riprende quel numero. Ed e' giusto cosi' — si annulla solo una
                  BOZZA, che al committente non e' mai arrivata — ma la frase
                  prometteva il contrario. */}
              Le {daAnnullare?.righe_contate} righe tornano libere e modificabili. Il numero{" "}
              {daAnnullare?.numero} torna libero e lo prenderà il prossimo rendiconto: questa bozza
              al committente non è mai arrivata, quindi nella sua numerazione non resta un buco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lascia stare</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daAnnullare && annulla.mutate(daAnnullare.id)}
            >
              Annulla il rendiconto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Staccare una fattura gia' emessa ─── */}
      <AlertDialog open={!!daStaccare} onOpenChange={(o) => !o && setDaStaccare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Staccare la fattura {daStaccare?.documenti_fiscali?.numero} dal rendiconto n.{" "}
              {daStaccare?.numero}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La fattura non viene toccata: resta emessa, col suo numero e la sua data. Si stacca
              solo il legame. Il rendiconto però <strong>resta «fatturato»</strong> — uno stato non
              torna indietro — e finché non ne colleghi un'altra risulterà fatturato senza fattura.
              Fallo se hai agganciato quella sbagliata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lascia stare</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daStaccare && scollega.mutate(daStaccare.id)}
            >
              Stacca la fattura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuoteCard>
  );
}

export default SalAppalto;
