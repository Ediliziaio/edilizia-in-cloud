import { cn } from "@/lib/utils";
import { QuoteConversionSummary } from "@/components/marketing/preventivi/QuoteConversionSummary";
import { idComputoNativo, percorsoComputoNativo } from "@/lib/computo/percorsiComputo";
import { PlanimetrieAssociate } from "@/components/planimetrie/PlanimetrieAssociate";
import { separaVoci } from "../../../../supabase/functions/_shared/destinazioneVocePreventivo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { PreventivoDaAggiornare } from "@/components/marketing/preventivi/PreventivoDaAggiornare";
import { QUOTE_STATUS_CONFIG } from "@/lib/quoteStatus";
import { useSignatureActions } from "@/hooks/useSignatureActions";
import { duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";
import { convertiPreventivoInCantiere } from "@/lib/quotes/convertiPreventivoInCantiere";
import { avvisoSchedeNonAllegate } from "@/lib/quotes/allegatiPreventivo";
import { eRigaDiModulo, preventivoDelModulo } from "@/lib/moduli/quoteBridge";
import { fetchQuotePdf, downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { messaggioDaErroreFirma } from "@/lib/preventivi/offertaPubblica";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendSignatureDialog } from "@/components/marketing/preventivi/SendSignatureDialog";
import { QuoteSignatureStatusCard } from "@/components/marketing/preventivi/QuoteSignatureStatusCard";
import { ContrattoFirmatoCard, FirmatoSuCartaDialog } from "@/components/marketing/preventivi/FirmatoSuCarta";
import { puoFirmareSuCarta } from "@/lib/preventivi/contrattoFirmato";
import { BloccaPrezzoCard } from "@/components/orders/BloccaPrezzoCard";
import { VersioniPreventivo } from "@/components/marketing/preventivi/VersioniPreventivo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteDetailItems } from "@/components/quotes/QuoteDetailItems";
import {
  ArrowLeft, Pencil, Send, FileDown, Loader2, User, FileText, FileCheck,
  MessageCircle, Copy, HardHat, Package, StickyNote, MoreHorizontal, GitBranch, Trash2, FileSignature,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PulsanteCreaConSilvio } from "@/components/silvio-commessa/PulsanteCreaConSilvio";
import {
  QuotePageHeader,
  QuoteCard,
  QuoteChip,
} from "@/components/marketing/preventivi/ui/builderUI";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function QuoteDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { effectiveCompany } = useAuth();
  // Creare o aprire la commessa è la parte Cantieri: chi lavora solo in
  // Marketing & Vendita (il venditore, di serie) non vede questi pulsanti,
  // che lo porterebbero su pagine negate (25/09/2026).
  const permessi = usePermissions();
  const accessoAnalisi = useFeatureAccess("preventivi_analisi_costi");
  const puoCreareCommessa = permessi.isAdmin || permessi.canEditOrders;
  const puoVedereCommessa = permessi.isAdmin || permessi.canViewOrders;
  // Mandare il preventivo al cliente (PDF, firma, link) lo cambia: serve poterlo
  // modificare, non solo vederlo. Chi lo vede dalle Commesse o in sola lettura non ha
  // questi pulsanti, e send-quote-signature lo rifiuta comunque (26/09/2026).
  const puoInviare = permessi.canEditPreventivi;
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(() => state?.apriInvioFirma === true);
  const [firmaCartaOpen, setFirmaCartaOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [duplicando, setDuplicando] = useState(false);

  const { sendForSignature, openWhatsApp, copySignatureLink } = useSignatureActions(id);

  const handleGeneratePdf = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
        body: { quote_id: id },
      });
      if (error) throw error;
      const blob = await fetchQuotePdf(data?.signed_url);
      if (!await downloadQuotePdf(blob, data?.pdf_path)) return;
      // Preventivo già firmato: l'edge restituisce il PDF firmato senza rigenerarlo.
      toast.success(data?.gia_firmato ? t("PDF firmato scaricato (non rigenerato: è il documento firmato dal cliente)") : t("PDF scaricato nei Download"));
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "errore";
      toast.error("Errore generazione PDF: " + msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleConvertToCantiere = async () => {
    if (!id) return;
    setConverting(true);
    try {
      const esito = await convertiPreventivoInCantiere(id, quote?.version);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.linkedOrder(id) });
      // La commessa c'è ma le righe no: dirlo, non «convertito con successo» davanti a una commessa vuota.
      if (esito.avviso) {
        toast.warning(t("Commessa creata, ma non completa"), { description: esito.avviso, duration: 12000 });
      } else {
        toast.success(t("Preventivo convertito in cantiere con successo!"));
      }
      navigate(`/azienda/ordini/${esito.orderId}`);
    } catch (e: unknown) {
      toast.error("Errore conversione: " + (e instanceof Error ? e.message : "Errore durante la conversione"));
    } finally {
      setConverting(false);
    }
  };

  const companyId = effectiveCompany?.id;

  // Invio semplice: email col PDF allegato, senza flusso firma OTP.
  const [inviandoPdf, setInviandoPdf] = useState(false);
  const inviaPdfSemplice = async (email: string | null, validityDays?: number | null) => {
    if (!id || !email || inviandoPdf) return;
    setInviandoPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-signature", {
        body: { quote_id: id, mode: "solo_pdf", expires_days: validityDays ?? undefined },
      });
      if (error) throw new Error(await messaggioDaErroreFirma(error, "Riprova tra qualche istante."));
      if (!data?.success) throw new Error(data?.error ?? "Invio non riuscito");
      toast.success(t("Preventivo inviato in PDF"), { description: t("Email con allegato mandata a {email}.", { email: String(email ?? "") }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    } catch (e) {
      toast.error(t("Invio non riuscito"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInviandoPdf(false);
    }
  };

  // Cestino dal dettaglio: prima si poteva eliminare solo dalla selezione
  // multipla in lista. Soft delete (30 giorni), come la toolbar.
  const [confermaCestino, setConfermaCestino] = useState(false);
  const [cestinando, setCestinando] = useState(false);
  const spostaNelCestino = async () => {
    if (!id || !companyId || cestinando) return;
    setCestinando(true);
    try {
      const { data, error } = await supabase
        .from("quotes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Preventivo già nel cestino o permessi insufficienti.");
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      toast.success(t("Preventivo spostato nel cestino"), { description: t("Recuperabile dal Cestino per 30 giorni.") });
      navigate("/azienda/marketing/preventivi");
    } catch (e) {
      toast.error(t("Non sono riuscito a spostarlo nel cestino"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCestinando(false);
      setConfermaCestino(false);
    }
  };

  // Duplica / Nuova revisione: la copia nasce bozza e si apre subito nel builder.
  const eseguiCopia = async (comeRevisione: boolean) => {
    if (!id || !companyId || duplicando) return;
    setDuplicando(true);
    try {
      const { id: nuovoId, nonAllegate, analisiNonCopiata } = await duplicaPreventivo(id, companyId, {
        comeRevisione,
        conAnalisiCosti: accessoAnalisi.accessLevel === "enabled" && permessi.canViewCosts && permessi.canViewMargins && permessi.canEditPreventivi,
      });
      const titolo = comeRevisione ? "Nuova revisione creata" : "Preventivo duplicato";
      const avviso = avvisoSchedeNonAllegate(nonAllegate);
      if (avviso) {
        toast.warning(`${titolo}: ${avviso.conteggio}`, { description: avviso.descrizione, duration: 10000 });
      } else {
        toast.success(titolo, {
          description: comeRevisione
            ? t("La revisione parte in bozza, agganciata a questo preventivo.")
            : t("La copia parte in bozza: aprila e adattala."),
        });
      }
      if (analisiNonCopiata) toast.warning(t("La revisione è stata creata. L’analisi costi è disponibile sull’originale."));
      navigate(`/azienda/marketing/preventivi/${nuovoId}/modifica`);
    } catch (e) {
      toast.error(t("Operazione non riuscita"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDuplicando(false);
    }
  };

  const { data: quote, isLoading } = useQuery({
    queryKey: queryKeys.quotes.detail(id),
    enabled: !!id && !!companyId,
    refetchOnWindowFocus: "always",
    refetchInterval: ({ state }) => state.data?.status === "inviata" ? 15_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [], isFetching: loadingItems, isError: itemsError } = useQuery({
    queryKey: queryKeys.quotes.items(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: queryKeys.quotes.attachments(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_attachments")
        .select("*, quote_pdf_materials(*)")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: versionCount = 0 } = useQuery<number>({
    queryKey: ["quote_versions_count", id],
    enabled: !!id,
    queryFn: async () => {
      // quote_versions is not in generated types — as any required for this table
      const { count, error } = await (supabase as any)
        .from("quote_versions")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", id!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Back-link: la commessa generata da questo preventivo (orders.quote_id = id).
  // Rende bidirezionale il legame preventivo↔commessa (prima solo commessa→preventivo).
  // Sta dietro la guardia «una commessa sola» (i due pulsanti sotto): la legge sempre fresca, a ogni apertura della
  // pagina. L'app tiene le query fresche 5 minuti, e «Crea commessa (rivedi)» non cambia lo stato del preventivo:
  // con la copia in cache si tornava qui entro 5 minuti, si rivedevano i pulsanti e si faceva una seconda commessa.
  const { data: linkedOrder, isFetching: controlloCommessa } = useQuery({
    queryKey: queryKeys.quotes.linkedOrder(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code")
        .eq("quote_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-5 pb-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{t("Preventivo non trovato")}</p>
        <Button variant="link" onClick={() => navigate("/azienda/marketing/preventivi")}>
          {t("Torna alla lista")}
        </Button>
      </div>
    );
  }

  if (quote.deleted_at) {
    return <section className="rounded-xl border border-amber-300 bg-amber-50 p-6" aria-label={t("Preventivo nel cestino")}>
      <h1 className="text-xl font-semibold">{t("{quote_number} · Preventivo nel cestino", { quote_number: String(quote.quote_number ?? "") })}</h1>
      <p className="mt-2 text-sm">{quote.title}</p>
      <p className="mt-3 text-sm">{t("Apri il Cestino dalla lista Preventivi per ripristinarlo.")}</p>
      <Button className="mt-4" variant="outline" onClick={() => navigate("/azienda/marketing/preventivi")}>{t("Torna ai preventivi")}</Button>
    </section>;
  }

  const sc = QUOTE_STATUS_CONFIG[quote.status as keyof typeof QUOTE_STATUS_CONFIG] || QUOTE_STATUS_CONFIG.bozza;
  // Documento di firma di un preventivo di modulo (Tetti, Bagni…): voci, prezzi e
  // commessa stanno nel modulo. Modificarlo, duplicarlo o convertirlo da qui
  // lavorava su un preventivo classico vuoto (commessa senza righe).
  const rigaDiModulo = eRigaDiModulo(quote.source);
  const moduloDellaRiga = preventivoDelModulo(quote.source);
  const puoModificareBozza = quote.status === "bozza" && !rigaDiModulo;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header (replica FvPageHeader) — telefono: senza riquadro né icona; il
          cliente va accanto a numero e stato (il sottotitolo lì è nascosto). */}
      <QuotePageHeader
        className="testata-pagina"
        azioniInRiga={quote.status !== "accettata"}
        numero={quote.quote_number}
        title={quote.title || t("Preventivo")}
        subtitle={quote.client_name || undefined}
        icon={<FileCheck className="h-5 w-5" />}
        stato={
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className={`whitespace-nowrap ${sc.className}`}>{sc.label}</Badge>
            {/* Telefono: il cliente accanto allo stato, se non è già nel titolo. */}
            {quote.client_name && !(quote.title ?? "").includes(quote.client_name) && (
              <span className="truncate font-medium text-slate-700 sm:hidden">{quote.client_name}</span>
            )}
            {Number((quote as Record<string, unknown>).revision_number ?? 0) > 0 && (
              <Badge variant="secondary" className="whitespace-nowrap">{t("Rev. {valore}", { valore: Number((quote as Record<string, unknown>).revision_number) })}</Badge>
            )}
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 lg:inline-flex"
              onClick={() => navigate("/azienda/marketing/preventivi")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> {t("Lista")}
            </Button>
            <Button variant="outline" onClick={handleGeneratePdf} disabled={generating} className="h-9 px-3 max-lg:hidden" aria-label={t("Genera PDF")}>
              {generating ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <FileDown className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{generating ? "Generando..." : "Genera PDF"}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 px-2.5 max-lg:size-11 max-lg:p-0" aria-label={t("Altre azioni")} disabled={duplicando}>
                  {duplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-lg:[&_[role=menuitem]]:min-h-11">
                <DropdownMenuItem className="lg:hidden" disabled={generating} onSelect={() => void handleGeneratePdf()}>
                  <FileDown className="mr-2 h-4 w-4" />{t("Genera PDF")}
                </DropdownMenuItem>
                {puoModificareBozza && puoInviare && (
                  <DropdownMenuItem className="lg:hidden" onSelect={() => navigate(`/azienda/marketing/preventivi/${id}/modifica`)}>
                    <Pencil className="mr-2 size-4" />{t("Modifica")}
                  </DropdownMenuItem>
                )}
                {puoFirmareSuCarta(quote.status, quote.source) && puoInviare && (
                  <DropdownMenuItem className="lg:hidden" onSelect={() => setFirmaCartaOpen(true)}>
                    <FileSignature className="mr-2 size-4" />{t("Firmato su carta")}
                  </DropdownMenuItem>
                )}
                {quote.status === "inviata" && quote.signature_token && puoInviare && (
                  <>
                    <DropdownMenuItem className="lg:hidden" onSelect={() => openWhatsApp(quote)}>
                      <MessageCircle className="mr-2 size-4" />{t("Link firma via WhatsApp")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="lg:hidden" onSelect={() => copySignatureLink(quote)}>
                      <Copy className="mr-2 size-4" />{t("Copia link firma")}
                    </DropdownMenuItem>
                  </>
                )}
                {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && !linkedOrder && (
                  <DropdownMenuItem className="lg:hidden" disabled={controlloCommessa}
                    onSelect={() => navigate(`/azienda/ordini/nuovo?quote_id=${id}`)}>
                    <Package className="mr-2 size-4" />{t("Crea commessa e rivedi le voci")}
                  </DropdownMenuItem>
                )}
                {!rigaDiModulo && (
                  <>
                    <DropdownMenuItem onClick={() => eseguiCopia(false)}>
                      <Copy className="h-4 w-4 mr-2" /> {t("Duplica preventivo")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => eseguiCopia(true)}>
                      <GitBranch className="h-4 w-4 mr-2" /> {t("Nuova revisione")}
                    </DropdownMenuItem>
                  </>
                )}
                {puoInviare && (
                  <DropdownMenuItem
                    disabled={!quote.client_email || inviandoPdf}
                    onClick={() => inviaPdfSemplice(quote.client_email, quote.validity_days)}
                  >
                    {inviandoPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {quote.client_email
                      ? "Invia PDF"
                      : "Invia PDF (email mancante)"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={cestinando || rigaDiModulo}
                  onClick={() => setConfermaCestino(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> {t("Sposta nel cestino")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confermaCestino} onOpenChange={setConfermaCestino}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("Sposta nel cestino {quote_number}?", { quote_number: String(quote.quote_number ?? "") })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("Il preventivo sparisce dalla lista e resta recuperabile dal Cestino per 30 giorni.")}
                    {quote.status !== "bozza" ? " Il cliente non viene avvisato." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                  <AlertDialogAction onClick={spostaNelCestino} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {cestinando ? "Sposto…" : "Sposta nel cestino"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {puoModificareBozza && (
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/marketing/preventivi/${id}/modifica`)}
                className={cn("h-9 px-3 max-lg:min-h-11", puoInviare && "max-lg:hidden")}
                aria-label={t("Modifica")}
              >
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span>{t("Modifica")}</span>
              </Button>
            )}

            {(quote.status === "bozza" || quote.status === "inviata") && puoInviare && (
              <button
                type="button"
                onClick={() => setSendDialogOpen(true)}
                className={cn("inline-flex flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-orange-500 to-eic-amber shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)] h-9 max-lg:min-h-11")}
              >
                <Send className="h-4 w-4" />
                {quote.status === "inviata" ? "Reinvia" : "Invia per firma"}
              </button>
            )}

            {/* Firmato su carta: con la scansione il preventivo diventa il contratto, come con la firma digitale. */}
            {puoFirmareSuCarta(quote.status, quote.source) && puoInviare && (
              <Button variant="outline" className="h-9 max-lg:hidden" onClick={() => setFirmaCartaOpen(true)}>
                <FileSignature className="mr-2 h-4 w-4" aria-hidden />{t("Firmato su carta")}
              </Button>
            )}
            {firmaCartaOpen && (
              <FirmatoSuCartaDialog open={firmaCartaOpen} onOpenChange={setFirmaCartaOpen}
                quote={{ id: quote.id, company_id: quote.company_id, client_name: quote.client_name, quote_number: quote.quote_number }} />
            )}

            <Dialog open={conversionOpen} onOpenChange={open => { if (!converting) setConversionOpen(open); }}>
              <DialogContent struttura="scorrevole" className="sm:max-w-2xl">
                <DialogHeader><DialogTitle>{t("Crea la commessa")}</DialogTitle><DialogDescription>{t("Verifica lavorazioni e materiali.")}</DialogDescription></DialogHeader>
                {itemsError ? <p role="alert">{t("Non riesco a verificare le voci. Riapri il preventivo prima di continuare.")}</p> : loadingItems ? <p>{t("Verifica delle voci…")}</p> : <QuoteConversionSummary items={items} total={Number(quote.total ?? 0)} />}
                <DialogFooter><Button className="min-h-11" variant="outline" disabled={converting} onClick={() => setConversionOpen(false)}>{t("Annulla")}</Button><Button className="min-h-11 whitespace-normal" disabled={converting || loadingItems || itemsError || separaVoci(items).daVerificare.length > 0} onClick={handleConvertToCantiere}>{converting ? "Creazione…" : "Conferma e crea commessa"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Una commessa sola per preventivo: «Crea commessa (rivedi)» non cambia lo stato e non controlla, quindi
                con la commessa già collegata («Vai alla commessa» qui sotto) le due strade non si offrono più. */}
            {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && !linkedOrder && (
              <button
                type="button"
                onClick={() => setConversionOpen(true)}
                disabled={converting || controlloCommessa}
                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] disabled:opacity-50 min-h-11"
              >
                {converting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <HardHat className="h-4 w-4" />}
                {converting ? "Creazione…" : "Crea commessa"}
              </button>
            )}

            {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && !linkedOrder && !controlloCommessa && (
              // Lotto 1.5: lo stesso preventivo, letto da Silvio, apre il popup già al lavoro.
              <PulsanteCreaConSilvio etichetta={t("Trasforma in commessa con Silvio")} variant="outline"
                className="h-9 border-orange-300 text-orange-800 hover:bg-orange-50 max-lg:hidden"
                iniziale={{ tipo: "preventivo", id: quote.id, etichetta: `preventivo ${quote.quote_number}` }} />
            )}

            {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && !linkedOrder && (
              // Telefono no: la strada «rivedi prima» è da scrivania, resta «Converti in Cantiere».
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/ordini/nuovo?quote_id=${id}`)}
                disabled={controlloCommessa}
                className="h-9 max-lg:hidden"
                title={t("Apre una nuova commessa con righe e misure già compilate dal preventivo: puoi rivederle e aggiustarle prima di salvare")}
              >
                <Package className="h-4 w-4 mr-2" />
                {t("Crea commessa (rivedi)")}
              </Button>
            )}

            {/* Back-link: commessa già generata da questo preventivo (qualsiasi stato) */}
            {linkedOrder && puoVedereCommessa && (
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/ordini/${linkedOrder.id}`)}
                className="h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400"
                title={t("Apri la commessa generata da questo preventivo")}
                aria-label={t("Vai alla commessa")}
              >
                <HardHat className="h-4 w-4 mr-2 max-sm:mr-0" />
                <span className="max-sm:hidden">{t("Vai alla commessa")}{linkedOrder.order_code ? ` ${linkedOrder.order_code}` : ""}</span>
              </Button>
            )}

            {/* WhatsApp e copia link — visibili solo se il preventivo è stato inviato */}
            {quote.status === "inviata" && quote.signature_token && puoInviare && (
              <>
                <Button
                  variant="outline"
                  className="h-9 gap-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 max-lg:hidden"
                  aria-label={t("Invia link firma via WhatsApp")}
                  onClick={() => openWhatsApp(quote)}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="max-sm:hidden">WhatsApp</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 max-lg:hidden"
                  aria-label={t("Copia link firma negli appunti")}
                  onClick={() => copySignatureLink(quote)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </>
            )}
          </>
        }
      />

      <PlanimetrieAssociate companyId={companyId} tipo="preventivo" schedaId={id} nascondiSeVuoto />
      {permessi.canEditPreventivi && idComputoNativo(quote.source) && <Button variant="outline" onClick={() => navigate(percorsoComputoNativo(idComputoNativo(quote.source)!))}><FileText className="mr-2 h-4 w-4" />{t("Apri computo del preventivo")}</Button>}

      {/* Pianta o computo cambiati dopo il preventivo: quantità da aggiornare (o revisione). */}
      {id && companyId && !rigaDiModulo && (
        <PreventivoDaAggiornare quoteId={id} companyId={companyId} bozza={quote.status === "bozza" && !(quote as Record<string, unknown>).signed_at} />
      )}

      {rigaDiModulo && (
        // Telefono: una riga sola, testo breve e «Apri».
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:p-2 max-sm:text-xs">
          <p className="max-sm:min-w-0 max-sm:flex-1">
            <span className="max-sm:hidden">
              {t("Questa è la copia di firma di un preventivo")} {moduloDellaRiga ? <strong>{moduloDellaRiga.nome}</strong> : t("di un modulo")}{t(": voci, prezzi e commessa si gestiscono dal preventivo del modulo.")}
            </span>
            <span className="sm:hidden">{t("Copia di firma: si modifica dal preventivo")} {moduloDellaRiga?.nome ?? t("del modulo")}.</span>
          </p>
          {moduloDellaRiga && (
            <Button variant="outline" className="tap-compact h-9 shrink-0 bg-white max-sm:h-8 max-sm:px-3 max-sm:text-xs" onClick={() => navigate(moduloDellaRiga.href)}>
              <span className="max-sm:hidden">{t("Apri il preventivo {nome}", { nome: String(moduloDellaRiga.nome ?? "") })}</span>
              <span className="sm:hidden">{t("Apri")}</span>
            </Button>
          )}
        </div>
      )}

      {/* Il contratto: come è stato firmato e il documento firmato. */}
      <ContrattoFirmatoCard quote={quote as Parameters<typeof ContrattoFirmatoCard>[0]["quote"]} />

      <Tabs defaultValue="offerta">
        <TabsList className="max-w-full justify-start bg-slate-100 max-sm:grid max-sm:h-auto max-sm:w-full max-sm:grid-cols-3 max-sm:gap-1 max-sm:[&>button]:min-h-10 max-sm:[&>button]:px-1 max-sm:[&>button]:text-xs">
          <TabsTrigger value="offerta" className="tap-compact data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm gap-1.5">
            <Package className="h-3.5 w-3.5 max-sm:hidden" /> {t("Offerta")}
          </TabsTrigger>
          <TabsTrigger value="cliente" className="tap-compact data-[state=active]:bg-white gap-1.5">
            <User className="h-3.5 w-3.5 max-sm:hidden" /> {t("Cliente")}
          </TabsTrigger>
          <TabsTrigger value="documenti" className="tap-compact data-[state=active]:bg-white gap-1.5">
            <FileText className="h-3.5 w-3.5 max-sm:hidden" /> {t("Documenti (")}{attachments.length})
          </TabsTrigger>
          <TabsTrigger value="attivita" className="tap-compact data-[state=active]:bg-white">{t("Attività")}</TabsTrigger>
          <TabsTrigger value="versioni" className="tap-compact gap-1.5 data-[state=active]:bg-white">
            {t("Versioni")}
            {versionCount > 0 && (
              <QuoteChip variant="orange" className="ml-0.5">{versionCount}</QuoteChip>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offerta" className="space-y-4 mt-4 sm:space-y-6">
          <QuoteCard title={t("Prodotti e lavorazioni")} icon={<Package className="h-4 w-4" />} className="max-sm:p-3">
              {items.length === 0 ? (
                <p className="text-slate-500 text-sm">{t("Nessuna voce")}</p>
              ) : (
                <QuoteDetailItems items={items} />
              )}

              <div className="mt-4 flex flex-col items-end gap-3">
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-1.5 text-sm shadow-sm max-sm:p-3 max-sm:text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("Subtotale")}</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.subtotal || 0)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>{t("Sconto {discount_percent}%", { discount_percent: String(quote.discount_percent ?? "") })}</span>
                      <span className="tabular-nums">-{formatCurrency(quote.discount_amount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.vat_amount || 0)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-2" />
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-base">{t("Totale")}</span>
                    <span className="text-2xl tabular-nums text-orange-600 max-sm:text-lg">{formatCurrency(quote.total || 0)}</span>
                  </div>
                </div>

                {/* Proposta finanziamento (se presente) */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(quote as any).financing_monthly_rate != null && (quote as any).financing_num_installments && (
                  <div className="w-full max-w-sm rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
                      {t("Oppure paga in comode rate mensili")}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold tabular-nums text-blue-700">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {formatCurrency((quote as any).financing_monthly_rate)}
                      </span>
                      <span className="text-sm text-slate-600">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        × {(quote as any).financing_num_installments} {t("rate")}
                      </span>
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(quote as any).financing_total_due != null && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {t("Importo totale dovuto:")}{" "}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <strong className="tabular-nums">{formatCurrency((quote as any).financing_total_due)}</strong>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(quote as any).financing_calculation_json?.tan && (
                          <>
                            {` ${t("· TAN")} `}
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {((quote as any).financing_calculation_json.tan).toFixed(2)}%
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] italic text-slate-400">
                      {t("Proposta indicativa salvo approvazione della finanziaria.")}
                    </p>
                  </div>
                )}
              </div>
          </QuoteCard>

          {(quote.notes || quote.description) && (
            <QuoteCard title={t("Note")} icon={<StickyNote className="h-4 w-4" />}>
              <div className="space-y-3 text-sm">
                {quote.description && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{t("Descrizione")}</p>
                    <p className="text-slate-700">{quote.description}</p>
                  </div>
                )}
                {quote.notes && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{t("Note per il cliente")}</p>
                    <p className="text-slate-700">{quote.notes}</p>
                  </div>
                )}
              </div>
            </QuoteCard>
          )}
        </TabsContent>

        <TabsContent value="cliente" className="mt-4">
          <QuoteCard
            title={t("Dati Cliente")}
            icon={<User className="h-4 w-4" />}
            action={
              quote.contact_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/azienda/marketing/contatti/${quote.contact_id}`)}
                >
                  <User className="h-4 w-4 mr-2" />
                  {t("Vedi nel CRM")}
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("Nome")}</p>
                <p className="font-medium text-slate-900">{quote.client_name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{quote.client_email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("Telefono")}</p>
                <p className="font-medium text-slate-900">{quote.client_phone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("Azienda")}</p>
                <p className="font-medium text-slate-900">{quote.client_company || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("Codice Fiscale")}</p>
                <p className="font-medium text-slate-900">{quote.client_fiscal_code || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">P.IVA</p>
                <p className="font-medium text-slate-900">{quote.client_vat_number || "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("Indirizzo")}</p>
                <p className="font-medium text-slate-900">{quote.client_address || "—"}</p>
              </div>
            </div>
          </QuoteCard>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <QuoteCard title={t("Documenti Allegati")} icon={<FileText className="h-4 w-4" />}>
            {attachments.length === 0 ? (
              <p className="text-slate-500 text-sm">{t("Nessun documento allegato")}</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-orange-50/50 hover:border-orange-200 transition-colors"
                  >
                    <FileText className="h-5 w-5 text-orange-500" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{a.quote_pdf_materials?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{a.quote_pdf_materials?.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </QuoteCard>
        </TabsContent>

        <TabsContent value="attivita" className="mt-4 space-y-4">
          {/* Blocca prezzo versato alla firma, prima che la commessa esista.
              Alla trasformazione in commessa il versamento la segue. */}
          <BloccaPrezzoCard quoteId={id!} />
          <QuoteSignatureStatusCard
            status={quote.status}
            createdAt={quote.created_at}
            sentAt={quote.sent_at}
            viewedAt={quote.viewed_at}
            signedAt={quote.signed_at}
            signedByName={quote.signed_by_name}
            signedByIp={quote.signed_by_ip}
            refusedAt={quote.refused_at}
            refusedReason={quote.refused_reason}
            expiresAt={quote.expires_at}
          />
        </TabsContent>

        <TabsContent value="versioni" className="mt-4">
          <VersioniPreventivo quoteId={id!} />
        </TabsContent>
      </Tabs>

      {/* Send Signature Dialog */}
      <SendSignatureDialog
        open={sendDialogOpen && puoInviare && (quote.status === "bozza" || quote.status === "inviata")}
        onOpenChange={setSendDialogOpen}
        clientEmail={quote.client_email}
        clientName={quote.client_name}
        quoteNumber={quote.quote_number}
        validityDays={quote.validity_days}
        onSend={(params) => sendForSignature.mutateAsync(params)}
        isSending={sendForSignature.isPending}
      />
    </div>
  );
}
