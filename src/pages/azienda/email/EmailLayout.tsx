/**
 * EmailLayout — client email 3-pane
 *
 * 3-pane responsive Gmail-style:
 *   ┌─────────┬─────────────┬──────────────────────┐
 *   │ Sidebar │ Thread list │ Thread viewer        │
 *   │ folders │ scrollable  │ messages + actions   │
 *   │ labels  │ unread bold │ reply/forward        │
 *   └─────────┴─────────────┴──────────────────────┘
 *
 * Mobile: stack layout, navigazione tra pannelli con pulsanti back.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { EmailSidebar } from "./components/EmailSidebar";
import { EmailAiCommandCenter } from "./components/EmailAiCommandCenter";
// EmailConnectionHealthPanel rimosso dalla center column 2026-05-26 → manteniamo
// solo il TIPO `EmailConnectionHealth` perché esteso da EmailConnectionSummary (r.77).
import { type EmailConnectionHealth } from "./components/EmailConnectionHealthPanel";
import { EmailList } from "./components/EmailList";
import { EmailViewer } from "./components/EmailViewer";
import { EmailComposeDialog, type ComposeContext } from "./components/EmailComposeDialog";
import { EmailSearchBar, type SearchQuery } from "./components/EmailSearchBar";
import { Button } from "@/components/ui/button";
// NOTA 2026-05-26: react-resizable-panels v4 ha rinominato gli export (PanelGroup→Group,
// PanelResizeHandle→Separator). Il wrapper shadcn `@/components/ui/resizable` usa la
// vecchia API e quindi rende componenti `undefined` → React crash "Element type is invalid"
// → ErrorBoundary. Sostituito con flex layout statico (la feature drag-to-resize sarà
// riaggiunta in un commit dedicato dopo aver allineato il wrapper alla nuova API).
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  FileText,
  Flame,
  Inbox,
  LifeBuoy,
  Loader2,
  Mail,
  Menu,
  PenLine,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Truck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FolderFilter =
  | { type: "system"; key: "inbox" | "sent" | "drafts" | "starred" | "spam" | "trash" | "archive" }
  | { type: "folder"; folderId: string }
  | { type: "label"; labelId: string };

export type EmailSmartCategory =
  | "priority"
  | "lead"
  | "quote"
  | "customer"
  | "supplier"
  | "invoice"
  | "admin"
  | "support"
  | "spam"
  | "other";

export interface EmailFilter {
  folder: FolderFilter;
  search?: SearchQuery | null;
  accountId?: string; // filtro per oauth_connection_id
  category?: EmailSmartCategory;
  // Filtri rapidi trasversali — combinabili con qualsiasi categoria (AND).
  unreadOnly?: boolean; // mostra solo thread con messaggi da leggere
  priorityOnly?: boolean; // mostra solo thread ad alta priorità
}

export interface EmailConnectionSummary extends EmailConnectionHealth {
  id: string;
  provider: string;
  email_address: string;
  status: string;
}

interface EmailLayoutProps {
  initialFilter?: FolderFilter;
  companyIdOverride?: string | null;
  settingsPath?: string;
  scopedAccountIds?: string[];
}

export function EmailLayout({
  initialFilter,
  companyIdOverride,
  settingsPath = "/azienda/impostazioni/mio-profilo",
  scopedAccountIds,
}: EmailLayoutProps = {}) {
  const { user, effectiveCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const queryThreadId = searchParams.get("thread_id");
  const queryCustomerEmail = searchParams.get("customer_email")?.trim() || "";
  const [filter, setFilter] = useState<EmailFilter>({
    folder: initialFilter ?? { type: "system", key: "inbox" },
    search: queryCustomerEmail ? { raw: queryCustomerEmail, text: queryCustomerEmail } : undefined,
  });
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(queryThreadId);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "list" | "viewer">(queryThreadId ? "viewer" : "list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });

  const openCompose = useCallback((ctx: ComposeContext) => {
    setComposeContext(ctx);
    setComposeOpen(true);
  }, []);

  const applyFilter = useCallback((next: EmailFilter | ((current: EmailFilter) => EmailFilter)) => {
    setFilter((current) => typeof next === "function" ? next(current) : next);
    setSelectedThreadId(null);
    setMobilePane("list");
  }, []);

  const userId = user?.id;
  const companyId = companyIdOverride ?? effectiveCompany?.id;
  const qc = useQueryClient();

  // Manual sync — invoca email-poll-inbox (function pubblica con x-cron-secret)
  // e invalida le query email per refetch immediato.
  const forceSync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-poll-inbox", {
        body: { source: "manual_force_layout" },
      });
      if (error) throw new Error(error.message);
      return data as {
        connections_checked?: number;
        emails_fetched?: number;
        emails_stored?: number;
        reads_reconciled?: number;
        errors?: Array<{ connection_id: string; error: string }>;
      };
    },
    onSuccess: (data) => {
      // Anche un sync parziale può aver scaricato qualcosa → invalida sempre.
      void qc.invalidateQueries({ queryKey: ["email-threads"] });
      void qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
      void qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
      void qc.invalidateQueries({ queryKey: ["email-client-connections"] });

      const stored = data?.emails_stored ?? 0;
      const checked = data?.connections_checked ?? 0;
      const failed = data?.errors ?? [];

      // Caselle in errore: NON fingere "completato" — mostra il motivo reale + come risolvere.
      if (failed.length > 0) {
        toast.error(
          `${failed.length} ${failed.length === 1 ? "casella non sincronizzata" : "caselle non sincronizzate"}`,
          {
            description: `${describeEmailSyncError(failed[0].error)} — verifica o riconnetti l'account in Impostazioni.`,
            duration: 8000,
          },
        );
        return;
      }
      // Nessuna casella processata (tutte disconnesse/revocate).
      if (checked === 0) {
        toast.warning("Nessuna casella da sincronizzare", {
          description: "Le caselle potrebbero essere disconnesse: riconnettile in Impostazioni → Email.",
          duration: 7000,
        });
        return;
      }
      const reconciled = data?.reads_reconciled ?? 0;
      toast.success("Sync completato", {
        description: [
          stored === 0 ? "Nessuna nuova email." : `${stored} nuova email scaricata.`,
          reconciled > 0 ? `${reconciled} segnate come lette (aperte altrove).` : "",
        ].filter(Boolean).join(" "),
      });
    },
    onError: (e) => toast.error("Errore sync", { description: String(e) }),
  });

  useEffect(() => {
    if (queryCustomerEmail) {
      setFilter((current) => {
        if (current.search?.raw === queryCustomerEmail) return current;
        return {
          ...current,
          folder: { type: "system", key: "inbox" },
          search: { raw: queryCustomerEmail, text: queryCustomerEmail },
        };
      });
    }
    if (queryThreadId) {
      setSelectedThreadId(queryThreadId);
      setMobilePane("viewer");
    }
  }, [queryCustomerEmail, queryThreadId]);

  // Realtime: nuova email arrivata → invalidate query + toast.
  // 2026-05-27 (perf fix P1): channel ref-stable.
  // PRIMA: `selectedThreadId` era nelle deps → ogni click su un thread
  // diverso scatenava un cleanup channel + new subscribe (handshake WS
  // round-trip Supabase Realtime, ~200-500ms). Su navigazione veloce
  // tra thread = WS in costante rinegoziazione + memory leak teorico.
  // ORA: channel creato una volta sola per utente. `selectedThreadId`
  // letto via useRef.current dentro l'handler → niente più re-sub.
  // Debounce 800ms preservato.
  const selectedThreadIdRef = useRef(selectedThreadId);
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    if (!userId) return;
    let countersTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleCountersInvalidation = () => {
      if (countersTimer) clearTimeout(countersTimer);
      countersTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["email-threads"] });
        void qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
        void qc.invalidateQueries({ queryKey: ["unread-email-count"] });
      }, 800);
    };
    const channel = supabase
      .channel(`email-inbox-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "email_inbox",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const m = payload.new as any;
          scheduleCountersInvalidation();
          const receivedAt = m?.received_at ? new Date(m.received_at).getTime() : 0;
          const isRecent = receivedAt > Date.now() - 60_000;
          if (isRecent && (m?.from_name || m?.from_email)) {
            toast.message("Nuova email", {
              description: `Da: ${m.from_name || m.from_email}${m.subject ? ` — ${m.subject}` : ""}`,
              duration: 5000,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "email_inbox",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          scheduleCountersInvalidation();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updatedThreadId = (payload.new as any)?.thread_id ?? null;
          // Read da ref → handler funziona senza re-subscribe quando
          // l'utente cambia thread aperto.
          const currentThread = selectedThreadIdRef.current;
          if (currentThread && updatedThreadId === currentThread) {
            void qc.invalidateQueries({ queryKey: ["email-thread-messages", currentThread] });
          }
        },
      )
      .subscribe();
    return () => {
      if (countersTimer) clearTimeout(countersTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  // Connessioni email dell'utente
  const { data: connections } = useQuery({
    queryKey: ["email-client-connections", userId, companyId],
    enabled: !!userId && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, provider_label, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_enabled, poll_interval_minutes, expires_at, last_test_ok, last_test_error")
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      return (data ?? []) as Array<{
        id: string;
        provider: string;
        email_address: string;
        status: string;
      }>;
    },
  });

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setMobilePane("viewer");
    // 2026-05-27 (fix utente "se ci clicco non me la segna come letta"):
    // PRIMA: chiamavamo RPC fire-and-forget senza invalidate → la lista
    // restava graficamente "non letta" anche se il DB era aggiornato,
    // finché refresh ogni 60s non scattava.
    // ORA: optimistic update via invalidate immediato + log eventuali errori.
    void supabase.rpc("email_mark_thread_read", { p_thread_id: threadId })
      .then((res) => {
        if (res.error) {
          console.warn("[email] mark-read RPC failed:", res.error.message);
          return;
        }
        // Refresh liste thread (toglie il dot blu unread) + counters sidebar
        void qc.invalidateQueries({ queryKey: ["email-threads"] });
        void qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
        void qc.invalidateQueries({ queryKey: ["unread-email-count"] });
      });
  };

  // Keyboard shortcuts (Gmail-style)
  // c = compose, r = reply (when viewer aperto), e = archive, /  = focus search
  // j/k = navigate threads (down/up)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignora se l'utente sta scrivendo in un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "c") {
        e.preventDefault();
        openCompose({ mode: "new" });
      } else if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Cerca"]');
        input?.focus();
      } else if (e.key === "Escape" && selectedThreadId) {
        setSelectedThreadId(null);
        setMobilePane("list");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCompose, selectedThreadId]);

  // Contenuto della list pane condiviso tra il render con ResizablePanel
  // (thread selezionato) e quello con <section> normale (nessun thread).
  // Estratto in funzione per evitare duplicazione e mantenere closures stabili.
  const renderListPaneContent = () => (
    <>
      {/* Mobile header — hamburger + folder title + account label + sync */}
      <div className="md:hidden p-2 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Apri caselle">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight truncate">
            <FolderTitle filter={filter.folder} />
          </p>
          {connections && connections.length > 0 && (
            <p className="truncate text-[10px] text-slate-500">
              {filter.accountId
                ? connections.find((c) => c.id === filter.accountId)?.email_address ?? "Tutte le caselle"
                : `${connections.length} ${connections.length === 1 ? "casella" : "caselle"}`}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => forceSync.mutate()}
          disabled={forceSync.isPending}
          aria-label="Sincronizza ora"
        >
          {forceSync.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Desktop header — titolo bold grande + Sync badge + sottotitolo casella, sul modello del mockup demo */}
      <div className="hidden md:flex items-start justify-between gap-3 p-4 border-b border-blue-100 bg-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-bold text-slate-950">
              <FolderTitle filter={filter.folder} />
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                forceSync.isPending
                  ? "bg-blue-50 text-blue-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {forceSync.isPending ? "Sync…" : "Sync"}
            </span>
          </div>
          {connections && connections.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {filter.accountId
                ? connections.find((c) => c.id === filter.accountId)?.email_address ?? "Tutte le caselle"
                : `${connections.length} ${connections.length === 1 ? "casella collegata" : "caselle collegate"}`}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => forceSync.mutate()}
          disabled={forceSync.isPending}
          title="Sincronizza ora le caselle email"
          className="shrink-0 rounded-xl"
        >
          {forceSync.isPending
            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-1" />}
          <span className="hidden lg:inline">Aggiorna</span>
        </Button>
      </div>

      <EmailMailboxToolbar
        filter={filter}
        onFilterChange={applyFilter}
      />
      {/* EmailConnectionHealthPanel rimosso 2026-05-26: lo stato sync è ora
          in fondo alla sidebar (SyncStatusPanel). La diagnostica completa
          resta accessibile via Impostazioni → Mio profilo → Email. */}
      <EmailAiCommandCenter
        companyIdOverride={companyId}
        onSelectThread={handleSelectThread}
        onFilterCategory={(category) => applyFilter((current) => ({
          ...current,
          category,
          folder: { type: "system", key: "inbox" },
        }))}
      />
      <EmailSearchBar
        initialValue={queryCustomerEmail}
        onSearch={(q) => setFilter((f) => ({ ...f, search: q }))}
      />
      <EmailList
        filter={filter}
        scopedAccountIds={scopedAccountIds ?? (companyIdOverride ? (connections ?? []).map((connection) => connection.id) : undefined)}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
      />
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* Backdrop mobile — chiude sidebar al click esterno */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Chiudi sidebar"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar — fixed on desktop, sheet on mobile */}
      <aside
        className={cn(
          "border-r border-blue-100 bg-white flex-shrink-0 flex flex-col transition-all",
          // Desktop
          "hidden md:flex md:w-72 lg:w-80",
          // Mobile sheet
          sidebarOpen && "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs flex shadow-xl bg-white",
        )}
      >
        <div className="md:hidden p-2 flex justify-end border-b">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} aria-label="Chiudi">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <EmailSidebar
          filter={filter}
          onFilterChange={(f) => {
            applyFilter(f);
            setSidebarOpen(false);
          }}
          onCompose={() => openCompose({ mode: "new" })}
          connections={connections ?? []}
          settingsPath={settingsPath}
        />
      </aside>

      {/* Fix 2026-05-26: il wrapper @/components/ui/resizable usa la vecchia API di
          react-resizable-panels (PanelGroup/PanelResizeHandle), ma la v4 installata
          esporta solo Group/Separator. Risultato: ResizablePrimitive.PanelGroup === undefined
          → React lancia "Element type is invalid" → ErrorBoundary → "Errore nel caricamento
          della pagina". Soluzione definitiva: flex layout statico, niente drag-to-resize.
          La feature draggable verrà ripristinata in un commit dedicato dopo aver migrato
          il wrapper alla nuova API. */}
      {selectedThreadId ? (
        <div className="flex-1 flex min-w-0">
          <section
            className={cn(
              "bg-white border-r border-blue-100 flex flex-col min-w-0",
              "md:w-[38%] md:max-w-[640px]",
              mobilePane === "list" ? "flex-1" : "hidden md:flex",
            )}
          >
            {renderListPaneContent()}
          </section>
          <section
            className={cn(
              "flex-1 flex flex-col min-w-0 bg-white",
              mobilePane !== "viewer" && "hidden md:flex",
            )}
          >
            <EmailViewer
              threadId={selectedThreadId}
              onBack={() => setMobilePane("list")}
              onClose={() => {
                setSelectedThreadId(null);
                setMobilePane("list");
              }}
              onReply={(src, mode) => openCompose({ mode, source: src })}
              onAiDraftReady={(src, draft) =>
                openCompose({
                  mode: "reply",
                  source: src,
                  initialSubject: draft.oggetto,
                  initialBody: draft.corpo,
                })
              }
            />
          </section>
        </div>
      ) : (
        // Nessun thread selezionato → list pane occupa tutta la larghezza.
        <section className={cn(
          "flex-1 bg-white flex flex-col min-w-0",
          mobilePane !== "list" && "hidden md:flex",
        )}>
          {renderListPaneContent()}
        </section>
      )}

      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        context={composeContext}
        companyIdOverride={companyId}
      />

      {/* FAB compose — visibile solo su mobile e solo quando l'utente è nella lista, rispetta safe area */}
      {mobilePane === "list" && !composeOpen && (
        <Button
          onClick={() => openCompose({ mode: "new" })}
          aria-label="Scrivi nuova email"
          className="md:hidden fixed right-5 z-30 h-14 w-14 rounded-full p-0 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200"
          // Sopra la bottom-nav flottante (64px pillola + 8px margine + gap),
          // mai sovrapposta al menu (richiesta utente).
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
        >
          <PenLine className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}

const CATEGORY_FILTERS: Array<{
  key: "all" | EmailSmartCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "all", label: "Tutte", icon: Inbox },
  { key: "priority", label: "Da fare", icon: AlertTriangle },
  { key: "lead", label: "Lead", icon: Sparkles },
  { key: "quote", label: "Preventivi", icon: FileText },
  { key: "customer", label: "Clienti", icon: Users },
  { key: "supplier", label: "Fornitori", icon: Truck },
  { key: "invoice", label: "Fatture", icon: ReceiptText },
  { key: "admin", label: "Pratiche", icon: Building2 },
  { key: "support", label: "Supporto", icon: LifeBuoy },
  { key: "spam", label: "Spam", icon: ShieldAlert },
];

function EmailMailboxToolbar({
  filter,
  onFilterChange,
}: {
  filter: EmailFilter;
  onFilterChange: (filter: EmailFilter | ((current: EmailFilter) => EmailFilter)) => void;
}) {
  // 2026-05-28: header secondario rimosso (era ridondante con header principale + folder title).
  // Manteniamo solo le pillole categoria, allineate al mockup "Demo casella email operativa".
  // 2026-06-01 (richiesta utente): aggiunta riga "Filtri rapidi" sopra le categorie con
  // toggle "Non lette" e "Prioritarie" — ispirati ai client email moderni (Gmail/Outlook).
  // Sono toggle TRASVERSALI: si combinano (AND) con qualsiasi categoria selezionata sotto.
  const anyQuickActive = !!filter.unreadOnly || !!filter.priorityOnly;
  return (
    <div className="space-y-2 border-b border-blue-100 bg-gradient-to-r from-white via-blue-50/40 to-orange-50/30 px-3 py-2 sm:px-4 sm:py-3">
      {/* Filtri rapidi — toggle indipendenti, combinabili con le categorie */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Filtri rapidi
        </span>
        <button
          type="button"
          aria-pressed={!!filter.unreadOnly}
          title="Mostra solo le email da leggere"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
            filter.unreadOnly
              ? "border-blue-600 bg-blue-600 font-semibold text-white shadow-sm shadow-blue-200"
              : "border-blue-200 bg-white/80 text-blue-700 hover:bg-blue-50",
          )}
          onClick={() => onFilterChange((current) => ({
            ...current,
            unreadOnly: current.unreadOnly ? undefined : true,
          }))}
        >
          <Mail className="h-3.5 w-3.5" />
          Non lette
        </button>
        <button
          type="button"
          aria-pressed={!!filter.priorityOnly}
          title="Mostra solo le email ad alta priorità"
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
            filter.priorityOnly
              ? "border-orange-500 bg-orange-500 font-semibold text-white shadow-sm shadow-orange-200"
              : "border-orange-200 bg-white/80 text-orange-700 hover:bg-orange-50",
          )}
          onClick={() => onFilterChange((current) => ({
            ...current,
            priorityOnly: current.priorityOnly ? undefined : true,
          }))}
        >
          <Flame className="h-3.5 w-3.5" />
          Prioritarie
        </button>
        {anyQuickActive && (
          <button
            type="button"
            title="Azzera i filtri rapidi"
            className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-700"
            onClick={() => onFilterChange((current) => ({
              ...current,
              unreadOnly: undefined,
              priorityOnly: undefined,
            }))}
          >
            <X className="h-3.5 w-3.5" />
            Azzera
          </button>
        )}
      </div>

      {/* Categorie (invariata) */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_FILTERS.map((category) => {
          const active = category.key === "all" ? !filter.category : filter.category === category.key;
          const Icon = category.icon;
          return (
            <button
              key={category.key}
              type="button"
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                active
                  ? "bg-blue-600 font-semibold text-white shadow-sm shadow-blue-200"
                  : "bg-white/70 text-slate-600 hover:bg-white hover:text-slate-900",
              )}
              onClick={() => onFilterChange((current) => ({
                ...current,
                category: category.key === "all" ? undefined : category.key,
              }))}
            >
              <Icon className="h-3.5 w-3.5" />
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Traduce gli errori tecnici di sync email in un messaggio comprensibile per l'utente. */
function describeEmailSyncError(raw: string): string {
  const e = (raw || "").toLowerCase();
  if (e.includes("refresh_token_missing") || e.includes("invalid_grant")) {
    return "Accesso a Google scaduto o revocato";
  }
  if (e.includes("token_refresh_failed")) {
    return "Impossibile rinnovare l'accesso alla casella";
  }
  if (e.includes("tokens_not_found")) {
    return "Credenziali della casella non disponibili";
  }
  if (e.includes("429") || e.includes("rate") || e.includes("quota")) {
    return "Troppe richieste a Google: riprova tra qualche minuto";
  }
  if (e.includes("gmail_list") || e.includes("gmail_get")) {
    return "Gmail ha rifiutato la richiesta";
  }
  return "Errore di sincronizzazione";
}

function folderTitleText(filter: FolderFilter): string {
  if (filter.type === "system") {
    const labels = {
      inbox: "Casella postale",
      sent: "Inviati",
      drafts: "Bozze",
      starred: "Contrassegnata",
      spam: "Spam",
      trash: "Cestino",
      archive: "Archiviate",
    } as const;
    return labels[filter.key];
  }
  return "Cartella";
}

function FolderTitle({ filter }: { filter: FolderFilter }) {
  return <>{folderTitleText(filter)}</>;
}
