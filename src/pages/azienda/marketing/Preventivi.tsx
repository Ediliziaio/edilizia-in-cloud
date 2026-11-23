/**
 * Preventivi — hub principale dei preventivi.
 *
 * Layout a tab:
 *  - "lista"        → vista unificata cross-modulo (UnifiedPreventiviList)
 *                     Classico + Serramenti + Fotovoltaico in unica tabella
 *                     con KPI hero, grafici, filtri Sheet, export Excel.
 *  - "moduli"       → compatibilità: apre il popup Nuovo preventivo sopra la lista
 *  - "approvazioni" → richieste sconto pending/storico (solo admin)
 *  - "analisi"      → analisi AI dei preventivi (solo admin)
 *
 * Deep-link supportato via query params:
 *  - ?tab=<lista|moduli|approvazioni|analisi>
 *  - ?action=import-computo|import-foto|import-smart → apre il modal AI
 *
 * NOTA: il refactor V2 (2026-05) ha unificato l'intera lista in
 * `UnifiedPreventiviList`. Tutto il vecchio rendering quote-only è stato
 * rimosso (KPI dedicati, charts, bulk select, columns picker, advanced
 * filters sheet). Le feature equivalenti sono ora dentro UnifiedPreventiviList.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelettoreSezione } from "@/components/mobile/FiltriMobile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileSignature,
  Percent,
  BrainCircuit,
  ChevronDown,
  Sparkles,
  FileUp,
  Inbox,
  Plus,
  Library,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import {
  QuoteHubTabs,
  QuotePageHeader,
  type HubTab,
} from "@/components/marketing/preventivi/ui/builderUI";
import { PreventiviCestinoDialog } from "@/components/marketing/preventivi/PreventiviCestinoDialog";
import { NewQuoteDialog } from "@/components/marketing/preventivi/moduli/NewQuoteDialog";
import { useModuliVendita } from "@/lib/moduli-vendita";
import { UnifiedPreventiviList } from "@/components/marketing/preventivi/UnifiedPreventiviList";
import { consentiPreventivoConversazionale } from "@/lib/preventivi/quoteRollout";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const AnalisiPreventivi = lazy(() => import("./AnalisiPreventivi"));
const QuoteApprovals = lazy(() => import("./QuoteApprovals"));
const ComputoUploadModal = lazy(() => import("@/components/computo/ComputoUploadModal").then(m => ({ default: m.ComputoUploadModal })));
const QuoteFromCaptureDialog = lazy(() => import("@/components/quotes/QuoteFromCaptureDialog").then(m => ({ default: m.QuoteFromCaptureDialog })));
const SmartDocumentInboxDialog = lazy(() => import("@/components/documenti/SmartDocumentInboxDialog").then(m => ({ default: m.SmartDocumentInboxDialog })));
const SmartDocumentImportModal = lazy(() => import("@/components/documenti/SmartDocumentImportModal").then(m => ({ default: m.SmartDocumentImportModal })));

// I moduli con un «Listino lavorazioni» dedicato (rotta /azienda/<modulo>/listino).
const LISTINO_SLUGS = new Set(["ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"]);
const ALLOWED_USER_TABS = new Set(["lista"]);

function AttesaImportazione({ open, onOpenChange, titolo }: { open: boolean; onOpenChange: (open: boolean) => void; titolo: string }) {
  const t = useT();
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>{titolo}</DialogTitle>
        <DialogDescription role="status">{t("Apertura in corso…")}</DialogDescription>
      </DialogHeader>
    </DialogContent>
  </Dialog>;
}

export default function Preventivi() {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  // Dall'admin (/admin/marketing/preventivi) si resta nell'admin: prima la
  // creazione AI portava sempre a /azienda/marketing/preventivi/:id.
  const routePrefix = useMarketingRoutePrefix();
  // I «Listini lavorazioni» dei moduli attivi, spostati qui dopo il ritiro delle pagine-hub di modulo.
  const { moduli: moduliVendita } = useModuliVendita();
  const listiniModuli = moduliVendita.filter((m) => LISTINO_SLUGS.has(m.modulo.slug) && m.isEnabled);
  const renderListiniItems = () =>
    listiniModuli.map((m) => {
      const Icon = m.modulo.icon;
      return (
        <DropdownMenuItem key={m.modulo.slug} onClick={() => navigate(`${m.modulo.href}/listino`)}>
          <Icon className="mr-2 h-4 w-4 opacity-70" />
          {m.modulo.nome}
        </DropdownMenuItem>
      );
    });
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [cestinoOpen, setCestinoOpen] = useState(false);
  const [showAiQuote, setShowAiQuote] = useState(false);
  const localAiEnabled = consentiPreventivoConversazionale(companyId) && permissions.canEditPreventivi;
  const puoCreare = permissions.canEditPreventivi || permissions.canEditMarketingOpportunities;
  // Old selector links now open the popup above the same unified list.
  const quoteDialogOpen = showNewQuote || searchParams.get("tab") === "moduli";
  const handleQuoteDialog = (open: boolean) => {
    setShowNewQuote(open);
    if (!open && searchParams.get("tab") === "moduli") {
      const next = new URLSearchParams(searchParams);
      for (const key of ["tab", "area", "intervento", "q_moduli", "stato_moduli", "vista_moduli"]) next.delete(key);
      setSearchParams(next, { replace: true });
    }
  };

  // Gate PER-AZIENDA (prima usava il ruolo GLOBALE → leak cross-azienda per utenti
  // multi-azienda). "Approvazioni sconto" richiede can_approve_discounts; "Analisi
  // AI" (margine %, commissioni) richiede la vista margini/costi.
  const canSeeApprovazioni = permissions.canApproveDiscounts;
  const canSeeAnalisi = permissions.canViewMargins || permissions.canViewCosts;

  const requestedTab = searchParams.get("tab") || "lista";
  const allowedTabs = new Set(ALLOWED_USER_TABS);
  if (canSeeApprovazioni) allowedTabs.add("approvazioni");
  if (canSeeAnalisi) allowedTabs.add("analisi");
  const activeTab = allowedTabs.has(requestedTab) ? requestedTab : "lista";
  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "lista") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next);
  };

  // Cleanup ?status= legacy: vecchio drill-down Sales OS passava ?status=inviata.
  // Ora il filtro stato è gestito da UnifiedPreventiviList in modo unificato.
  // Strip silenzioso al primo render per evitare URL "sporche".
  useEffect(() => {
    if (searchParams.has("status")) {
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Count approvazioni pending (badge sul tab — solo admin) ─────────────
  const { data: pendingApprovalsCount = 0 } = useQuery({
    queryKey: ["quote-approvals-pending-count", companyId],
    enabled: !!companyId && canSeeApprovazioni,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("quote_approvals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .is("decision", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ─── Modal AI import (deep-link via ?action=...) ─────────────────────────
  // Dopo la prima apertura la finestra resta montata per conservare il flusso di importazione.
  const [showComputoModal, setShowComputoModal] = useState<boolean | null>(null);
  const [showFotoModal, setShowFotoModal] = useState<boolean | null>(null);
  const [showSmartInbox, setShowSmartInbox] = useState<boolean | null>(null);
  const [showSmartImportModal, setShowSmartImportModal] = useState<boolean | null>(null);
  const [smartComputoId, setSmartComputoId] = useState<string | null>(null);

  const handleComputoModalOpenChange = (open: boolean) => {
    setShowComputoModal(open);
    if (!open) setSmartComputoId(null);
  };

  // Handler ?action=... per deep-link da SilvioFAB / SmartDocumentImportModal.
  // Senza questo, cliccando "Computo metrico → Preventivo" il modal non si apriva.
  // Pulisce il query param dopo l'apertura per evitare re-trigger su back/forward.
  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;
    const computoId = searchParams.get("computo_id");
    if (action === "import-computo") {
      if (computoId) setSmartComputoId(computoId);
      setShowComputoModal(true);
    }
    else if (action === "import-foto") setShowFotoModal(true);
    else if (action === "import-smart") setShowSmartImportModal(true);
    if (["import-computo", "import-foto", "import-smart"].includes(action)) {
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      next.delete("computo_id");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ─── Tab navigation config ───────────────────────────────────────────────
  // I moduli sono accessibili anche da telefono; l'analisi resta desktop.
  const isMobile = useIsMobile();
  const vistaCompatta = useIsMobile(1024);
  const hubTabs: HubTab[] = [
    { key: "lista", label: t("Lista Preventivi"), icon: <FileSignature className="h-4 w-4" /> },
    ...(canSeeApprovazioni
      ? [
          {
            key: "approvazioni",
            label: t("Approvazioni sconto"),
            icon: <Percent className="h-4 w-4" />,
            badge: pendingApprovalsCount > 0 ? (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {pendingApprovalsCount}
              </Badge>
            ) : null,
          },
        ]
      : []),
    ...(canSeeAnalisi && !isMobile
      ? [
          {
            key: "analisi",
            label: t("Analisi AI"),
            icon: <BrainCircuit className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 max-lg:space-y-3">
      {hubTabs.length > 1 && (
        <SelettoreSezione nome={t("Sezioni preventivi")} valore={activeTab} onScegli={handleTabChange}
          sezioni={hubTabs.map(({ key, label }) => ({ id: key, label: key === "approvazioni" && pendingApprovalsCount > 0 ? `${label} (${pendingApprovalsCount})` : label }))}
          className="lg:hidden" />
      )}
      <QuoteHubTabs tabs={hubTabs} active={activeTab} onSelect={handleTabChange} className="max-lg:hidden" />

      {activeTab === "lista" && (
        <>
          {vistaCompatta ? (
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-slate-900">{t("Preventivi")}</h1>
              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="size-11" aria-label={t("Azioni preventivi")}>
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 [&_[role=menuitem]]:min-h-11">
                    {localAiEnabled && (
                      <DropdownMenuItem onSelect={() => setShowAiQuote(true)}>
                        <Sparkles className="mr-2 h-4 w-4 text-orange-600" />{t("Preventivo AI")}
                      </DropdownMenuItem>
                    )}
                    {puoCreare && <>
                      <DropdownMenuItem onSelect={() => setShowComputoModal(true)}><FileUp className="mr-2 h-4 w-4" />{t("Computo metrico")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setShowSmartImportModal(true)}><FileUp className="mr-2 h-4 w-4" />{t("Importa documento")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setShowFotoModal(true)}><Sparkles className="mr-2 h-4 w-4" />{t("Foto, schizzi o audio")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setShowSmartInbox(true)}><Inbox className="mr-2 h-4 w-4" />{t("Importazioni recenti")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>}
                    {permissions.canViewSettingsPricing && (
                      <DropdownMenuItem onSelect={() => navigate("/azienda/impostazioni/template-preventivi")}>
                        <Library className="mr-2 h-4 w-4" />{t("Modelli dei preventivi")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setCestinoOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" />{t("Cestino")}
                    </DropdownMenuItem>
                    {listiniModuli.length > 0 && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t("Listini lavorazioni")}</DropdownMenuLabel>
                      {renderListiniItems()}
                    </>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {puoCreare && <NewQuoteDialog open={quoteDialogOpen} onOpenChange={handleQuoteDialog} params={searchParams}
                  trigger={<Button size="sm" className="min-h-11 px-3"><Plus className="mr-1 h-4 w-4" />{t("Nuovo")}</Button>} />}
                {localAiEnabled && <NewQuoteDialog ai open={showAiQuote} onOpenChange={setShowAiQuote} params={searchParams} />}
              </div>
            </div>
          ) : (
            <QuotePageHeader
              title={t("Preventivi")}
              icon={<FileSignature className="h-5 w-5" />}
              actions={
                <>
                  {localAiEnabled && <NewQuoteDialog ai open={showAiQuote} onOpenChange={setShowAiQuote} params={searchParams} trigger={<Button variant="outline" size="sm" aria-label={t("Preventivo AI")} title={t("Preventivo AI")}><Sparkles className="h-4 w-4 xl:mr-2" /><span className="hidden xl:inline">{t("Preventivo AI")}</span></Button>} />}
                  {puoCreare && <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-10 sm:h-9 flex-1 sm:flex-initial" aria-label={t("Crea preventivo da fonte")} title={t("Crea da documento, computo, foto o audio")}>
                        <Sparkles className="h-4 w-4 xl:mr-2" />
                        <span className="hidden xl:inline">{t("Crea da...")}</span>
                        <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem
                        onClick={() => setShowSmartImportModal(true)}
                        className="font-semibold"
                      >
                        <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                        {t("Documento intelligente")}
                        <span className="ml-auto text-[10px] text-orange-600">{t("AI sceglie")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowSmartInbox(true)}>
                        <Inbox className="h-4 w-4 mr-2" />
                        {t("Inbox documenti AI")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowComputoModal(true)}>
                        <FileUp className="h-4 w-4 mr-2" />
                        {t("Computo metrico")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowFotoModal(true)}>
                        <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                        {t("Foto, schizzi o audio (AI)")}
                        <span className="ml-auto text-[10px] text-orange-600">{t("Smart")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>}

                  {listiniModuli.length > 0 && !isMobile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-10 sm:h-9 flex-1 sm:flex-initial" aria-label={t("Listini lavorazioni")} title={t("Listini lavorazioni")}>
                          <Library className="h-4 w-4 xl:mr-2" />
                          <span className="hidden xl:inline">{t("Listini")}</span>
                          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>{t("Listini lavorazioni")}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {renderListiniItems()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {puoCreare && <NewQuoteDialog open={quoteDialogOpen} onOpenChange={handleQuoteDialog} params={searchParams}
                    trigger={<Button size="sm" className="h-11 sm:h-10"><Plus className="mr-1.5 h-4 w-4" />{t("Nuovo preventivo")}</Button>} />}
                </>
              }
            />
          )}

          {/* I computi salvati sono righe dell'elenco (tipo «Computo»), tra le bozze: non più un riquadro in cima. */}
          <UnifiedPreventiviList onApriCestino={() => setCestinoOpen(true)} />
          {cestinoOpen && <PreventiviCestinoDialog open onOpenChange={setCestinoOpen} companyId={companyId ?? null} />}
        </>
      )}

      <Suspense fallback={<p role="status" className="py-8 text-sm text-muted-foreground">{t("Caricamento della scheda…")}</p>}>
        {activeTab === "approvazioni" && canSeeApprovazioni && <QuoteApprovals />}
        {activeTab === "analisi" && canSeeAnalisi && <AnalisiPreventivi />}
      </Suspense>

      {/* Modal AI: Computo metrico → Preventivo */}
      {showComputoModal !== null && (
        <Suspense fallback={<AttesaImportazione open={showComputoModal} onOpenChange={handleComputoModalOpenChange} titolo={t("Importa computo metrico")} />}>
          <ComputoUploadModal
            open={showComputoModal}
            onOpenChange={handleComputoModalOpenChange}
            initialComputoId={smartComputoId}
            onComplete={(quoteId) => navigate(`${routePrefix}/preventivi/${quoteId}`)}
          />
        </Suspense>
      )}

      {/* Modal AI: Foto/audio/testo → Preventivo (multi-foto, audio 3min) */}
      {showFotoModal !== null && (
        <Suspense fallback={<AttesaImportazione open={showFotoModal} onOpenChange={setShowFotoModal} titolo={t("Importa foto, schizzi o audio")} />}>
          <QuoteFromCaptureDialog
            open={showFotoModal}
            onOpenChange={setShowFotoModal}
            onQuoteCreated={(quoteId) => navigate(`${routePrefix}/preventivi/${quoteId}`)}
          />
        </Suspense>
      )}

      {/* Storico operativo degli import AI: riprende computi/listini/fatture senza perderli. */}
      {showSmartInbox !== null && (
        <Suspense fallback={<AttesaImportazione open={showSmartInbox} onOpenChange={setShowSmartInbox} titolo={t("Importazioni recenti")} />}>
          <SmartDocumentInboxDialog
            open={showSmartInbox}
            onOpenChange={setShowSmartInbox}
            onImportNew={() => setShowSmartImportModal(true)}
            onComputoReady={(computoId) => {
              setSmartComputoId(computoId);
              setShowComputoModal(true);
            }}
          />
        </Suspense>
      )}

      {/* Smart Document Router — AI classifica e smista al modulo giusto */}
      {showSmartImportModal !== null && (
        <Suspense fallback={<AttesaImportazione open={showSmartImportModal} onOpenChange={setShowSmartImportModal} titolo={t("Importa documento")} />}>
          <SmartDocumentImportModal
            open={showSmartImportModal}
            onOpenChange={setShowSmartImportModal}
            onComputoReady={(computoId) => {
              setSmartComputoId(computoId);
              setShowComputoModal(true);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
