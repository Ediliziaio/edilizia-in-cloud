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
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { EmailSidebar } from "./components/EmailSidebar";
import { EmailAiCommandCenter } from "./components/EmailAiCommandCenter";
import { EmailConnectionHealthPanel, type EmailConnectionHealth } from "./components/EmailConnectionHealthPanel";
import { EmailList } from "./components/EmailList";
import { EmailViewer } from "./components/EmailViewer";
import { EmailComposeDialog, type ComposeContext } from "./components/EmailComposeDialog";
import { EmailSearchBar, type SearchQuery } from "./components/EmailSearchBar";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  FileText,
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
      return data as { connections_checked?: number; emails_fetched?: number; emails_stored?: number };
    },
    onSuccess: (data) => {
      const stored = data?.emails_stored ?? 0;
      toast.success("Sync completato", {
        description: stored === 0
          ? "Nessuna nuova email."
          : `${stored} nuova email scaricata.`,
      });
      void qc.invalidateQueries({ queryKey: ["email-threads"] });
      void qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
      void qc.invalidateQueries({ queryKey: ["email-oauth-connections"] });
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

  // Realtime: nuova email arrivata → invalidate query + toast
  useEffect(() => {
    if (!userId) return;
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
          qc.invalidateQueries({ queryKey: ["email-threads"] });
          qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
          if (m?.from_name || m?.from_email) {
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
        () => {
          qc.invalidateQueries({ queryKey: ["email-threads"] });
          qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
          qc.invalidateQueries({ queryKey: ["email-thread-messages"] });
        },
      )
      .subscribe();
    return () => {
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
    // Mark thread as read
    void supabase.rpc("email_mark_thread_read", { p_thread_id: threadId });
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

      {/* Desktop header — titolo + N collegate badge + bottone Sync */}
      <div className="hidden md:flex items-center justify-between gap-2 p-3 border-b border-blue-100 bg-white">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-blue-600 shrink-0" />
            <FolderTitle filter={filter.folder} />
          </h2>
          {connections && connections.length > 0 && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
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
          className="shrink-0"
        >
          {forceSync.isPending
            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-1" />}
          <span className="hidden lg:inline">Sync</span>
        </Button>
      </div>

      <EmailMailboxToolbar
        filter={filter}
        onFilterChange={applyFilter}
        connections={connections ?? []}
      />
      <EmailConnectionHealthPanel
        connections={connections ?? []}
        companyIdOverride={companyId}
        settingsPath={settingsPath}
        variant="compact"
      />
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
        />
      </aside>

      {/* Fix 2026-05-27: ResizablePanelGroup crashava ("Total weight must be 100")
          quando il numero di figli cambiava dinamicamente 1→2 (selectedThreadId).
          Soluzione: rendering condizionale completo. Quando no thread, layout flex
          semplice. Quando thread selezionato, ResizablePanelGroup attivo con 2 pannelli. */}
      {selectedThreadId ? (
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 flex"
          autoSaveId="email-layout-panels-with-viewer"
        >
          <ResizablePanel
            defaultSize={38}
            minSize={25}
            maxSize={65}
            className={cn(
              "bg-white border-r border-blue-100 flex flex-col min-w-0",
              mobilePane !== "list" && "hidden md:flex",
            )}
          >
            {renderListPaneContent()}
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel
            defaultSize={62}
            minSize={35}
            className={cn(
              "flex flex-col min-w-0 bg-white",
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
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // Nessun thread selezionato → list pane occupa tutta la larghezza, senza Resizable wrapper.
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
          style={{ bottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
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
  connections,
}: {
  filter: EmailFilter;
  onFilterChange: (filter: EmailFilter | ((current: EmailFilter) => EmailFilter)) => void;
  connections: EmailConnectionSummary[];
}) {
  const activeAccount = connections.find((connection) => connection.id === filter.accountId);
  const accountLabel = activeAccount?.email_address ?? "Tutte le caselle";
  const folderLabel = folderTitleText(filter.folder);

  return (
    <div className="border-b border-blue-100 bg-gradient-to-r from-white via-blue-50/40 to-orange-50/30 px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
      {/* Header desktop con icon + folder label + account: ridondante su mobile dove già c'è hamburger row */}
      <div className="hidden md:flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-100">
              <Mail className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-slate-900">{folderLabel}</p>
              <p className="truncate text-xs text-slate-500">{accountLabel}</p>
            </div>
          </div>
        </div>
        {connections.length > 1 && (
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
            {connections.length} collegate
          </span>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_FILTERS.map((category) => {
          const active = category.key === "all" ? !filter.category : filter.category === category.key;
          const Icon = category.icon;
          return (
            <Button
              key={category.key}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs",
                active
                  ? "border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100"
                  : "border-transparent bg-white/70 text-slate-600 hover:bg-white hover:text-slate-900",
              )}
              onClick={() => onFilterChange((current) => ({
                ...current,
                category: category.key === "all" ? undefined : category.key,
              }))}
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {category.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
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
