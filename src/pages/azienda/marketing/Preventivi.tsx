/**
 * Preventivi — hub principale dei preventivi.
 *
 * Layout a tab:
 *  - "lista"        → vista unificata cross-modulo (UnifiedPreventiviList)
 *                     Classico + Serramenti + Fotovoltaico in unica tabella
 *                     con KPI hero, grafici, filtri Sheet, export Excel.
 *  - "moduli"       → card dei preventivatori verticali (ModuliVendutaTab)
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
  ShoppingBag,
  Percent,
  BrainCircuit,
  ChevronDown,
  Sparkles,
  FileUp,
  Inbox,
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
import { ModuliVendutaTab } from "@/components/marketing/preventivi/moduli/ModuliVendutaTab";
import { NewPreventivoMenu } from "@/components/marketing/preventivi/NewPreventivoMenu";
import { UnifiedPreventiviList } from "@/components/marketing/preventivi/UnifiedPreventiviList";

import AnalisiPreventivi from "./AnalisiPreventivi";
import QuoteApprovals from "./QuoteApprovals";

const ALLOWED_USER_TABS = new Set(["lista", "moduli"]);

export default function Preventivi() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const hubTabs: HubTab[] = [
    { key: "lista", label: "Lista Preventivi", icon: <FileSignature className="h-4 w-4" /> },
    { key: "moduli", label: "Moduli Vendita", icon: <ShoppingBag className="h-4 w-4" /> },
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
    ...(canSeeAnalisi
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
    <div className="space-y-6 pb-20 md:pb-0">
      <QuoteHubTabs tabs={hubTabs} active={activeTab} onSelect={handleTabChange} />

      {activeTab === "lista" && (
        <>
          <QuotePageHeader
            title="Preventivi"
            subtitle="Vista unificata cross-modulo · classici + serramenti + fotovoltaico"
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

                {/* "Nuovo preventivo" — dropdown con moduli sbloccati dal super admin
                    via feature flag. Se nessun modulo è attivo, è un bottone diretto.
                    onCreaConAI apre il dialog foto/vocale/testo montato qui sotto. */}
                <NewPreventivoMenu size="sm" onCreaConAI={() => setShowFotoModal(true)} />
              </>
            }
          />

          <UnifiedPreventiviList />
        </>
      )}

      {activeTab === "moduli" && <ModuliVendutaTab />}
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
