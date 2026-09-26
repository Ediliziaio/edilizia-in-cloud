import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { QUOTE_STATUS_CONFIG } from "@/lib/quoteStatus";
import { useSignatureActions } from "@/hooks/useSignatureActions";
import { duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";
import { eRigaDiModulo, preventivoDelModulo } from "@/lib/moduli/quoteBridge";
import { fetchQuotePdf, downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendSignatureDialog } from "@/components/marketing/preventivi/SendSignatureDialog";
import { QuoteSignatureStatusCard } from "@/components/marketing/preventivi/QuoteSignatureStatusCard";
import { BloccaPrezzoCard } from "@/components/orders/BloccaPrezzoCard";
import { VersioniPreventivo } from "@/components/marketing/preventivi/VersioniPreventivo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Pencil, Send, FileDown, Loader2, User, FileText, FileCheck,
  MessageCircle, Copy, HardHat, Package, StickyNote, MoreHorizontal, GitBranch, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  QuotePageHeader,
  QuoteCard,
  QuoteChip,
} from "@/components/marketing/preventivi/ui/builderUI";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  // Creare o aprire la commessa è la parte Cantieri: chi lavora solo in
  // Marketing & Vendita (il venditore, di serie) non vede questi pulsanti,
  // che lo porterebbero su pagine negate (25/09/2026).
  const permessi = usePermissions();
  const puoCreareCommessa = permessi.isAdmin || permessi.canEditOrders;
  const puoVedereCommessa = permessi.isAdmin || permessi.canViewOrders;
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);
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
      downloadQuotePdf(blob, data?.pdf_path);
      // Preventivo già firmato: l'edge restituisce il PDF firmato senza rigenerarlo.
      toast.success(data?.gia_firmato ? "PDF firmato scaricato (non rigenerato: è il documento firmato dal cliente)" : "PDF scaricato nei Download");
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "errore";
      toast.error("Errore generazione PDF: " + msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleConvertToCantiere = async () => {
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("converti-preventivo-cantiere", {
        body: { quote_id: id },
      });
      if (error) throw error;
      toast.success("Preventivo convertito in cantiere con successo!");
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      navigate(`/azienda/ordini/${data.order_id}`);
    } catch (e: unknown) {
      const err = e as { context?: { json?: { error?: string } }; message?: string };
      const msg = err?.context?.json?.error || err?.message || "Errore durante la conversione";
      toast.error("Errore conversione: " + msg);
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
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Invio non riuscito");
      toast.success("Preventivo inviato in PDF", { description: `Email con allegato mandata a ${email}.` });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    } catch (e) {
      toast.error("Invio non riuscito", { description: e instanceof Error ? e.message : String(e) });
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
      toast.success("Preventivo spostato nel cestino", { description: "Recuperabile dal Cestino per 30 giorni." });
      navigate("/azienda/marketing/preventivi");
    } catch (e) {
      toast.error("Non sono riuscito a spostarlo nel cestino", {
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
      const nuovoId = await duplicaPreventivo(id, companyId, { comeRevisione });
      toast.success(comeRevisione ? "Nuova revisione creata" : "Preventivo duplicato", {
        description: comeRevisione
          ? "La revisione parte in bozza, agganciata a questo preventivo."
          : "La copia parte in bozza: aprila e adattala.",
      });
      navigate(`/azienda/marketing/preventivi/${nuovoId}/modifica`);
    } catch (e) {
      toast.error("Operazione non riuscita", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDuplicando(false);
    }
  };

  const { data: quote, isLoading } = useQuery({
    queryKey: queryKeys.quotes.detail(id),
    enabled: !!id && !!companyId,
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

  const { data: items = [] } = useQuery({
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
  const { data: linkedOrder } = useQuery({
    queryKey: ["quote-linked-order", id],
    enabled: !!id,
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
        <p className="text-muted-foreground">Preventivo non trovato</p>
        <Button variant="link" onClick={() => navigate("/azienda/marketing/preventivi")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  const sc = QUOTE_STATUS_CONFIG[quote.status as keyof typeof QUOTE_STATUS_CONFIG] || QUOTE_STATUS_CONFIG.bozza;
  // Documento di firma di un preventivo di modulo (Tetti, Bagni…): voci, prezzi e
  // commessa stanno nel modulo. Modificarlo, duplicarlo o convertirlo da qui
  // lavorava su un preventivo classico vuoto (commessa senza righe).
  const rigaDiModulo = eRigaDiModulo(quote.source);
  const moduloDellaRiga = preventivoDelModulo(quote.source);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header (replica FvPageHeader) — telefono: senza riquadro né icona; il
          cliente va accanto a numero e stato (il sottotitolo lì è nascosto). */}
      <QuotePageHeader
        className="testata-pagina"
        azioniInRiga
        numero={quote.quote_number}
        title={quote.title || "Preventivo"}
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
              <Badge variant="secondary" className="whitespace-nowrap">
                Rev. {Number((quote as Record<string, unknown>).revision_number)}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 hidden md:inline-flex"
              onClick={() => navigate("/azienda/marketing/preventivi")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Lista
            </Button>
            {/* Telefono no: niente PDF da scaricare (dal «…» si invia al cliente). */}
            <Button variant="outline" onClick={handleGeneratePdf} disabled={generating} className="h-9 px-2.5 sm:px-3 max-sm:hidden" aria-label="Genera PDF">
              {generating ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <FileDown className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{generating ? "Generando..." : "Genera PDF"}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 px-2.5" aria-label="Altre azioni" disabled={duplicando}>
                  {duplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!rigaDiModulo && (
                  <>
                    <DropdownMenuItem onClick={() => eseguiCopia(false)}>
                      <Copy className="h-4 w-4 mr-2" /> Duplica preventivo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => eseguiCopia(true)}>
                      <GitBranch className="h-4 w-4 mr-2" /> Nuova revisione
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  disabled={!quote.client_email || inviandoPdf}
                  onClick={() => inviaPdfSemplice(quote.client_email, quote.validity_days)}
                >
                  {inviandoPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  {quote.client_email
                    ? `Invia PDF a ${quote.client_email}`
                    : "Invia PDF (manca l'email del cliente)"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={cestinando || rigaDiModulo}
                  onClick={() => setConfermaCestino(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Sposta nel cestino
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confermaCestino} onOpenChange={setConfermaCestino}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sposta nel cestino {quote.quote_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Il preventivo sparisce dalla lista e resta recuperabile dal Cestino per 30 giorni.
                    {quote.status !== "bozza" ? " Il cliente non viene avvisato." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={spostaNelCestino} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {cestinando ? "Sposto…" : "Sposta nel cestino"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {quote.status === "bozza" && !rigaDiModulo && (
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/marketing/preventivi/${id}/modifica`)}
                className="h-9 px-2.5 sm:px-3"
                aria-label="Modifica"
              >
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Modifica</span>
              </Button>
            )}

            {(quote.status === "bozza" || quote.status === "inviata") && (
              <button
                type="button"
                onClick={() => setSendDialogOpen(true)}
                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)] h-9"
              >
                <Send className="h-4 w-4" />
                {quote.status === "inviata" ? "Reinvia" : "Invia per Firma"}
              </button>
            )}

            {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && (
              <button
                type="button"
                onClick={handleConvertToCantiere}
                disabled={converting}
                className="inline-flex flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-md text-white transition-all bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] disabled:opacity-50 h-9"
              >
                {converting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <HardHat className="h-4 w-4" />}
                {converting ? "Conversione..." : "Converti in Cantiere"}
              </button>
            )}

            {quote.status === "accettata" && !rigaDiModulo && puoCreareCommessa && (
              // Telefono no: la strada «rivedi prima» è da scrivania, resta «Converti in Cantiere».
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/ordini/nuovo?quote_id=${id}`)}
                className="h-9 max-sm:hidden"
                title="Apre una nuova commessa con righe e misure già compilate dal preventivo: puoi rivederle e aggiustarle prima di salvare"
              >
                <Package className="h-4 w-4 mr-2" />
                Crea commessa (rivedi)
              </Button>
            )}

            {/* Back-link: commessa già generata da questo preventivo (qualsiasi stato) */}
            {linkedOrder && puoVedereCommessa && (
              <Button
                variant="outline"
                onClick={() => navigate(`/azienda/ordini/${linkedOrder.id}`)}
                className="h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400"
                title="Apri la commessa generata da questo preventivo"
                aria-label="Vai alla commessa"
              >
                <HardHat className="h-4 w-4 mr-2 max-sm:mr-0" />
                <span className="max-sm:hidden">Vai alla commessa{linkedOrder.order_code ? ` ${linkedOrder.order_code}` : ""}</span>
              </Button>
            )}

            {/* WhatsApp e copia link — visibili solo se il preventivo è stato inviato */}
            {quote.status === "inviata" && quote.signature_token && (
              <>
                <Button
                  variant="outline"
                  className="gap-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 h-9"
                  aria-label="Invia link firma via WhatsApp"
                  onClick={() => openWhatsApp(quote)}
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="max-sm:hidden">WhatsApp</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Copia link firma negli appunti"
                  onClick={() => copySignatureLink(quote)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </>
            )}
          </>
        }
      />

      {rigaDiModulo && (
        // Telefono: una riga sola, testo breve e «Apri».
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:p-2 max-sm:text-xs">
          <p className="max-sm:min-w-0 max-sm:flex-1">
            <span className="max-sm:hidden">
              Questa è la copia di firma di un preventivo {moduloDellaRiga ? <strong>{moduloDellaRiga.nome}</strong> : "di un modulo"}:
              voci, prezzi e commessa si gestiscono dal preventivo del modulo.
            </span>
            <span className="sm:hidden">Copia di firma: si modifica dal preventivo {moduloDellaRiga?.nome ?? "del modulo"}.</span>
          </p>
          {moduloDellaRiga && (
            <Button variant="outline" className="tap-compact h-9 shrink-0 bg-white max-sm:h-8 max-sm:px-3 max-sm:text-xs" onClick={() => navigate(moduloDellaRiga.href)}>
              <span className="max-sm:hidden">Apri il preventivo {moduloDellaRiga.nome}</span>
              <span className="sm:hidden">Apri</span>
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="offerta">
        {/* Telefono: tre schede a tutta larghezza (Offerta, Cliente, Attività);
            documenti e versioni si guardano dal computer. */}
        <TabsList className="bg-slate-100 max-w-full justify-start overflow-x-auto max-sm:grid max-sm:w-full max-sm:grid-cols-3">
          <TabsTrigger value="offerta" className="tap-compact data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm gap-1.5">
            <Package className="h-3.5 w-3.5 max-sm:hidden" /> Offerta
          </TabsTrigger>
          <TabsTrigger value="cliente" className="tap-compact data-[state=active]:bg-white gap-1.5">
            <User className="h-3.5 w-3.5 max-sm:hidden" /> Cliente
          </TabsTrigger>
          <TabsTrigger value="documenti" className="data-[state=active]:bg-white gap-1.5 max-sm:hidden">
            <FileText className="h-3.5 w-3.5" /> Documenti ({attachments.length})
          </TabsTrigger>
          <TabsTrigger value="attivita" className="tap-compact data-[state=active]:bg-white">Attività</TabsTrigger>
          <TabsTrigger value="versioni" className="gap-1.5 data-[state=active]:bg-white max-sm:hidden">
            Versioni
            {versionCount > 0 && (
              <QuoteChip variant="orange" className="ml-0.5">{versionCount}</QuoteChip>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offerta" className="space-y-4 mt-4 sm:space-y-6">
          <QuoteCard title="Prodotti e Servizi" icon={<Package className="h-4 w-4" />} className="max-sm:p-3">
              {items.length === 0 ? (
                <p className="text-slate-500 text-sm">Nessun prodotto</p>
              ) : (
                <>
                  {/* Desktop: tabella completa a 7 colonne */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Prodotto</TableHead>
                          <TableHead>Descrizione</TableHead>
                          <TableHead className="text-right">Qtà</TableHead>
                          <TableHead className="text-right">Prezzo</TableHead>
                          <TableHead className="text-right">Sconto</TableHead>
                          <TableHead className="text-right">IVA</TableHead>
                          <TableHead className="text-right">Totale</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate">
                              {item.description || "—"}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity} {item.unit_of_measure}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              {item.discount_percent > 0 ? `${item.discount_percent}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right">{item.vat_rate}%</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.line_total || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile: una riga per voce (nome e importo; quantità × prezzo e
                      IVA sotto). Via la descrizione, che ripeteva il nome, e il
                      riquadro intorno a ogni voce. */}
                  <div className="md:hidden divide-y divide-border">
                    {items.map((item) => (
                      <div key={item.id} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-[13px] leading-snug">{item.name}</p>
                          <p className="shrink-0 font-semibold text-[13px] tabular-nums text-slate-900">
                            {formatCurrency(item.line_total || 0)}
                          </p>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="tabular-nums">
                            {item.quantity} {item.unit_of_measure} × {formatCurrency(item.unit_price)}
                          </span>
                          {item.discount_percent > 0 && (
                            <span className="text-orange-600">−{item.discount_percent}%</span>
                          )}
                          <span>IVA {item.vat_rate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 flex flex-col items-end gap-3">
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-1.5 text-sm shadow-sm max-sm:p-3 max-sm:text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subtotale</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.subtotal || 0)}</span>
                  </div>
                  {(quote.discount_percent || 0) > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Sconto {quote.discount_percent}%</span>
                      <span className="tabular-nums">-{formatCurrency(quote.discount_amount || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quote.vat_amount || 0)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-2" />
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-base">Totale</span>
                    <span className="text-2xl tabular-nums text-orange-600 max-sm:text-lg">{formatCurrency(quote.total || 0)}</span>
                  </div>
                </div>

                {/* Proposta finanziamento (se presente) */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(quote as any).financing_monthly_rate != null && (quote as any).financing_num_installments && (
                  <div className="w-full max-w-sm rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
                      Oppure paga in comode rate mensili
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold tabular-nums text-blue-700">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {formatCurrency((quote as any).financing_monthly_rate)}
                      </span>
                      <span className="text-sm text-slate-600">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        × {(quote as any).financing_num_installments} rate
                      </span>
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(quote as any).financing_total_due != null && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Importo totale dovuto:{" "}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <strong className="tabular-nums">{formatCurrency((quote as any).financing_total_due)}</strong>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(quote as any).financing_calculation_json?.tan && (
                          <>
                            {" · TAN "}
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {((quote as any).financing_calculation_json.tan).toFixed(2)}%
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] italic text-slate-400">
                      Proposta indicativa salvo approvazione della finanziaria.
                    </p>
                  </div>
                )}
              </div>
          </QuoteCard>

          {(quote.notes || quote.description) && (
            <QuoteCard title="Note" icon={<StickyNote className="h-4 w-4" />}>
              <div className="space-y-3 text-sm">
                {quote.description && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Descrizione</p>
                    <p className="text-slate-700">{quote.description}</p>
                  </div>
                )}
                {quote.notes && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Note per il cliente</p>
                    <p className="text-slate-700">{quote.notes}</p>
                  </div>
                )}
              </div>
            </QuoteCard>
          )}
        </TabsContent>

        <TabsContent value="cliente" className="mt-4">
          <QuoteCard
            title="Dati Cliente"
            icon={<User className="h-4 w-4" />}
            action={
              quote.contact_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/azienda/marketing/contatti/${quote.contact_id}`)}
                >
                  <User className="h-4 w-4 mr-2" />
                  Vedi nel CRM
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nome</p>
                <p className="font-medium text-slate-900">{quote.client_name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{quote.client_email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Telefono</p>
                <p className="font-medium text-slate-900">{quote.client_phone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Azienda</p>
                <p className="font-medium text-slate-900">{quote.client_company || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Codice Fiscale</p>
                <p className="font-medium text-slate-900">{quote.client_fiscal_code || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">P.IVA</p>
                <p className="font-medium text-slate-900">{quote.client_vat_number || "—"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Indirizzo</p>
                <p className="font-medium text-slate-900">{quote.client_address || "—"}</p>
              </div>
            </div>
          </QuoteCard>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <QuoteCard title="Documenti Allegati" icon={<FileText className="h-4 w-4" />}>
            {attachments.length === 0 ? (
              <p className="text-slate-500 text-sm">Nessun documento allegato</p>
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
        open={sendDialogOpen}
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
