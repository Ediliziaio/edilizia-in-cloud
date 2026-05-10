/**
 * EmailLayout — Sprint E2
 *
 * 3-pane responsive Gmail-style:
 *   ┌─────────┬─────────────┬──────────────────────┐
 *   │ Sidebar │ Thread list │ Thread viewer        │
 *   │ folders │ scrollable  │ messages + actions   │
 *   │ labels  │ unread bold │ reply/forward (E3)   │
 *   └─────────┴─────────────┴──────────────────────┘
 *
 * Mobile: stack layout, navigazione tra pannelli con pulsanti back.
 */
import React, { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EmailSidebar } from "./components/EmailSidebar";
import { EmailList } from "./components/EmailList";
import { EmailViewer } from "./components/EmailViewer";
import { EmailComposeDialog, type ComposeContext } from "./components/EmailComposeDialog";
import { EmailSearchBar, type SearchQuery } from "./components/EmailSearchBar";
import { Button } from "@/components/ui/button";
import { Mail, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FolderFilter =
  | { type: "system"; key: "inbox" | "sent" | "drafts" | "starred" | "spam" | "trash" | "archive" }
  | { type: "folder"; folderId: string }
  | { type: "label"; labelId: string };

export interface EmailFilter {
  folder: FolderFilter;
  search?: SearchQuery | null;
  accountId?: string; // filtro per oauth_connection_id
}

interface EmailLayoutProps {
  initialFilter?: FolderFilter;
}

export function EmailLayout({ initialFilter }: EmailLayoutProps = {}) {
  const { user, effectiveCompany } = useAuth();
  const [filter, setFilter] = useState<EmailFilter>({
    folder: initialFilter ?? { type: "system", key: "inbox" },
  });
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "list" | "viewer">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });

  const openCompose = useCallback((ctx: ComposeContext) => {
    setComposeContext(ctx);
    setComposeOpen(true);
  }, []);

  const userId = user?.id;
  const companyId = effectiveCompany?.id;

  // Connessioni email dell'utente
  const { data: connections } = useQuery({
    queryKey: ["email-client-connections", userId, companyId],
    enabled: !!userId && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status")
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

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Sidebar — fixed on desktop, sheet on mobile */}
      <aside
        className={cn(
          "border-r bg-muted/20 flex-shrink-0 flex flex-col transition-all",
          // Desktop
          "hidden md:flex md:w-60 lg:w-64",
          // Mobile sheet
          sidebarOpen && "fixed inset-y-0 left-0 z-50 w-72 flex shadow-xl bg-background",
        )}
      >
        <div className="md:hidden p-2 flex justify-end border-b">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <EmailSidebar
          filter={filter}
          onFilterChange={(f) => {
            setFilter(f);
            setSelectedThreadId(null);
            setSidebarOpen(false);
            setMobilePane("list");
          }}
          onCompose={() => openCompose({ mode: "new" })}
          connections={connections ?? []}
        />
      </aside>

      {/* List pane */}
      <section
        className={cn(
          "flex-1 md:flex-none md:w-[360px] lg:w-[420px] border-r flex flex-col min-w-0",
          mobilePane !== "list" && "hidden md:flex",
        )}
      >
        <div className="md:hidden p-2 border-b flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            <FolderTitle filter={filter.folder} />
          </span>
        </div>
        <EmailSearchBar
          onSearch={(q) => setFilter((f) => ({ ...f, search: q }))}
        />
        <EmailList
          filter={filter}
          selectedThreadId={selectedThreadId}
          onSelectThread={handleSelectThread}
        />
      </section>

      {/* Viewer pane */}
      <section
        className={cn(
          "flex-1 flex flex-col min-w-0",
          mobilePane !== "viewer" && "hidden md:flex",
        )}
      >
        {selectedThreadId ? (
          <EmailViewer
            threadId={selectedThreadId}
            onBack={() => setMobilePane("list")}
            onClose={() => setSelectedThreadId(null)}
            onReply={(src, mode) => openCompose({ mode, source: src })}
          />
        ) : (
          <ViewerEmptyState />
        )}
      </section>

      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        context={composeContext}
      />
    </div>
  );
}

function FolderTitle({ filter }: { filter: FolderFilter }) {
  if (filter.type === "system") {
    const labels = {
      inbox: "Inbox",
      sent: "Inviati",
      drafts: "Bozze",
      starred: "Importanti",
      spam: "Spam",
      trash: "Cestino",
      archive: "Archivio",
    } as const;
    return <>{labels[filter.key]}</>;
  }
  return <>Cartella</>;
}

function ViewerEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center bg-muted/10">
      <div className="max-w-sm">
        <div className="mx-auto h-16 w-16 rounded-full bg-violet-100 flex items-center justify-center mb-3">
          <Mail className="h-8 w-8 text-violet-600" />
        </div>
        <h3 className="text-base font-semibold">Seleziona un'email</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Scegli un thread dalla lista per leggerne il contenuto qui.
        </p>
      </div>
    </div>
  );
}
