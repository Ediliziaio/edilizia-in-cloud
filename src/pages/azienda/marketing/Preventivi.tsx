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
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
} from "lucide-react";

import {
  QuoteHubTabs,
  QuotePageHeader,
  type HubTab,
} from "@/components/marketing/preventivi/ui/builderUI";
import { ComputoUploadModal } from "@/components/computo/ComputoUploadModal";
import { QuoteFromCaptureDialog } from "@/components/quotes/QuoteFromCaptureDialog";
import { SmartDocumentInboxDialog } from "@/components/documenti/SmartDocumentInboxDialog";
import { SmartDocumentImportModal } from "@/components/documenti/SmartDocumentImportModal";
import { NewQuoteDialog } from "@/components/marketing/preventivi/moduli/NewQuoteDialog";
import { UnifiedPreventiviList } from "@/components/marketing/preventivi/UnifiedPreventiviList";

import AnalisiPreventivi from "./AnalisiPreventivi";
import QuoteApprovals from "./QuoteApprovals";

const ALLOWED_USER_TABS = new Set(["lista"]);

export default function Preventivi() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewQuote, setShowNewQuote] = useState(false);
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
  const [showComputoModal, setShowComputoModal] = useState(false);
  const [showFotoModal, setShowFotoModal] = useState(false);
  const [showSmartInbox, setShowSmartInbox] = useState(false);
  const [showSmartImportModal, setShowSmartImportModal] = useState(false);
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
  const hubTabs: HubTab[] = [
    { key: "lista", label: "Lista Preventivi", icon: <FileSignature className="h-4 w-4" /> },
    ...(canSeeApprovazioni
      ? [
          {
            key: "approvazioni",
            label: "Approvazioni sconto",
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
            label: "Analisi AI",
            icon: <BrainCircuit className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-0 max-sm:space-y-3 max-sm:pb-0">
      {/* Telefono: con la sola lista la barra delle schede non serve. */}
      <QuoteHubTabs tabs={hubTabs} active={activeTab} onSelect={handleTabChange} className={hubTabs.length < 2 ? "max-sm:hidden" : undefined} />

      {activeTab === "lista" && (
        <>
          {/* Telefono: titolo e «Nuovo» su una riga; «Crea da» a icona con le due
              strade che servono fuori ufficio (foto o vocale, documento). Il
              popup del nuovo preventivo è lo stesso della testata del computer. */}
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <h1 className="text-lg font-bold text-slate-900">Preventivi</h1>
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="tap-compact h-8 w-8" aria-label="Crea preventivo da foto, audio o documento">
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => setShowFotoModal(true)}>
                    <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                    Da foto, schizzi o audio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSmartImportModal(true)}>
                    <FileUp className="h-4 w-4 mr-2" />
                    Da un documento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {(permissions.canEditPreventivi || permissions.canEditMarketingOpportunities) && (
                <Button size="sm" className="tap-compact h-8 px-3 text-xs" onClick={() => setShowNewQuote(true)}>
                  <Plus className="mr-1 h-4 w-4" />Nuovo
                </Button>
              )}
            </div>
          </div>
          <QuotePageHeader
            className="max-sm:hidden"
            title="Preventivi"
            subtitle="Tutte le offerte della tua azienda, dal primo contatto alla conferma."
            icon={<FileSignature className="h-5 w-5" />}
            actions={
              <>
                {/* "Crea da..." — entry points AI (smart import, computo, foto/audio). */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 sm:h-9 flex-1 sm:flex-initial" aria-label="Crea preventivo da fonte">
                      <Sparkles className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Crea da...</span>
                      <span className="sm:hidden ml-1.5 text-xs">Crea da</span>
                      <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      onClick={() => setShowSmartImportModal(true)}
                      className="font-semibold"
                    >
                      <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                      Documento intelligente
                      <span className="ml-auto text-[10px] text-orange-600">AI sceglie</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowSmartInbox(true)}>
                      <Inbox className="h-4 w-4 mr-2" />
                      Inbox documenti AI
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowComputoModal(true)}>
                      <FileUp className="h-4 w-4 mr-2" />
                      Computo metrico
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowFotoModal(true)}>
                      <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                      Foto, schizzi o audio (AI)
                      <span className="ml-auto text-[10px] text-orange-600">Smart</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {(permissions.canEditPreventivi || permissions.canEditMarketingOpportunities) && <NewQuoteDialog open={quoteDialogOpen} onOpenChange={handleQuoteDialog} params={searchParams}
                  trigger={<Button size="sm" className="h-11 sm:h-10"><Plus className="mr-1.5 h-4 w-4" />Nuovo preventivo</Button>} />}
              </>
            }
          />

          <UnifiedPreventiviList />
        </>
      )}

      {activeTab === "approvazioni" && canSeeApprovazioni && <QuoteApprovals />}
      {activeTab === "analisi" && canSeeAnalisi && <AnalisiPreventivi />}

      {/* Modal AI: Computo metrico → Preventivo */}
      <ComputoUploadModal
        open={showComputoModal}
        onOpenChange={handleComputoModalOpenChange}
        initialComputoId={smartComputoId}
        onComplete={(quoteId) => navigate(`/azienda/marketing/preventivi/${quoteId}`)}
      />

      {/* Modal AI: Foto/audio/testo → Preventivo (multi-foto, audio 3min) */}
      <QuoteFromCaptureDialog
        open={showFotoModal}
        onOpenChange={setShowFotoModal}
        onQuoteCreated={(quoteId) => navigate(`/azienda/marketing/preventivi/${quoteId}`)}
      />

      {/* Storico operativo degli import AI: riprende computi/listini/fatture senza perderli. */}
      <SmartDocumentInboxDialog
        open={showSmartInbox}
        onOpenChange={setShowSmartInbox}
        onImportNew={() => setShowSmartImportModal(true)}
        onComputoReady={(computoId) => {
          setSmartComputoId(computoId);
          setShowComputoModal(true);
        }}
      />

      {/* Smart Document Router — AI classifica e smista al modulo giusto */}
      <SmartDocumentImportModal
        open={showSmartImportModal}
        onOpenChange={setShowSmartImportModal}
        onComputoReady={(computoId) => {
          setSmartComputoId(computoId);
          setShowComputoModal(true);
        }}
      />
    </div>
  );
}
