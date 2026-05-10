/**
 * EmailSidebar — folders navigation + account list + compose CTA
 *
 * Sezioni:
 *   1. Bottone "Scrivi" (Sprint E3 abilita; ora apre toast "in arrivo")
 *   2. Cartelle di sistema con count non lette (Inbox/Inviati/Bozze/...)
 *   3. Account collegati (se >1 mostra switcher per filtrare per account)
 *   4. Cartelle custom (Sprint E5)
 *   5. Labels (Sprint E5)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Inbox, Send, FileEdit, Star, ShieldAlert, Trash2, Plus, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EmailFilter, FolderFilter } from "../EmailLayout";

interface SystemFolder {
  key: "inbox" | "sent" | "drafts" | "starred" | "spam" | "trash";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SYSTEM_FOLDERS: SystemFolder[] = [
  { key: "inbox",   label: "Inbox",      icon: Inbox },
  { key: "starred", label: "Importanti", icon: Star },
  { key: "sent",    label: "Inviati",    icon: Send },
  { key: "drafts",  label: "Bozze",      icon: FileEdit },
  { key: "spam",    label: "Spam",       icon: ShieldAlert },
  { key: "trash",   label: "Cestino",    icon: Trash2 },
];

interface EmailSidebarProps {
  filter: EmailFilter;
  onFilterChange: (filter: EmailFilter) => void;
  connections: Array<{ id: string; provider: string; email_address: string; status: string }>;
}

export function EmailSidebar({ filter, onFilterChange, connections }: EmailSidebarProps) {
  const { user } = useAuth();
  const userId = user?.id;

  // Counter unread per Inbox
  const { data: counts } = useQuery({
    queryKey: ["email-folder-counts", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: inboxUnread } = await (supabase as any)
        .from("v_my_email_inbox")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("is_archived", false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: starred } = await (supabase as any)
        .from("v_my_email_inbox")
        .select("id", { count: "exact", head: true })
        .eq("is_starred", true);
      return {
        inbox: inboxUnread ?? 0,
        starred: starred ?? 0,
      };
    },
  });

  const isActive = (folder: FolderFilter): boolean => {
    if (filter.folder.type !== folder.type) return false;
    if (folder.type === "system" && filter.folder.type === "system") {
      return folder.key === filter.folder.key;
    }
    return false;
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        <Button
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700 shadow-sm"
          onClick={() =>
            toast.info("Componi email", {
              description: "Disponibile nello Sprint E3 — sto lavorando alla UI compose",
            })
          }
        >
          <Plus className="h-4 w-4" />
          Scrivi
        </Button>

        <nav className="space-y-0.5">
          {SYSTEM_FOLDERS.map((f) => {
            const folder: FolderFilter = { type: "system", key: f.key };
            const active = isActive(folder);
            const Icon = f.icon;
            const count =
              f.key === "inbox" ? counts?.inbox :
              f.key === "starred" ? counts?.starred :
              undefined;

            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange({ folder })}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-violet-100 text-violet-900 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-violet-600")} />
                <span className="flex-1 text-left truncate">{f.label}</span>
                {count !== undefined && count > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-5 min-w-[20px] px-1.5 text-[10px]",
                      active && "bg-violet-200 text-violet-800",
                    )}
                  >
                    {count > 999 ? "999+" : count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {connections.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
              Account
            </p>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onFilterChange({ ...filter, accountId: undefined })}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors",
                  !filter.accountId
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Tutti gli account</span>
              </button>
              {connections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onFilterChange({ ...filter, accountId: c.id })}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors",
                    filter.accountId === c.id
                      ? "bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                  title={c.email_address}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      c.status === "active" ? "bg-emerald-500" : "bg-rose-500",
                    )}
                  />
                  <span className="truncate">{c.email_address}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/70 px-2 pt-2 border-t">
          Sprint E2 attivo. Compose, IMAP, ricerca, AI in arrivo.
        </p>
      </div>
    </ScrollArea>
  );
}
