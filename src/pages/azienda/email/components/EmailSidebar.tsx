/**
 * EmailSidebar — navigazione mailbox personale
 *
 * Ogni cartella contiene le caselle collegate: clic su cartella = tutte le
 * caselle, clic su account = stessa cartella filtrata per account.
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileEdit,
  Inbox,
  Mail,
  PencilLine,
  Send,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { EmailFilter, FolderFilter } from "../EmailLayout";
import type { EmailConnectionSummary } from "../EmailLayout";
import ReconnectMailboxDialog from "./ReconnectMailboxDialog";

type SystemFolderKey = "inbox" | "sent" | "drafts" | "starred" | "spam" | "trash" | "archive";

interface SystemFolder {
  key: SystemFolderKey;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
}

const SYSTEM_FOLDERS: SystemFolder[] = [
  { key: "inbox",   label: "Casella postale", shortLabel: "Posta",   icon: Inbox },
  { key: "starred", label: "Contrassegnata",   shortLabel: "Speciali", icon: Star },
  { key: "drafts",  label: "Bozze",            shortLabel: "Bozze",    icon: FileEdit },
  { key: "sent",    label: "Inviate",          shortLabel: "Inviate",  icon: Send },
  { key: "archive", label: "Archiviate",       shortLabel: "Archivio", icon: Archive },
  { key: "spam",    label: "Spam",             shortLabel: "Spam",     icon: ShieldAlert },
  { key: "trash",   label: "Cestino",          shortLabel: "Cestino",  icon: Trash2 },
];

interface EmailSidebarProps {
  filter: EmailFilter;
  onFilterChange: (filter: EmailFilter) => void;
  onCompose: () => void;
  /**
   * Connessioni email con metadata health. Accettiamo la versione "extended"
   * (EmailConnectionSummary) così possiamo mostrare lo stato sync nella
   * sezione bottom della sidebar senza un secondo fetch.
   */
  connections: Array<EmailConnectionSummary | { id: string; provider: string; email_address: string; status: string }>;
  /** Path impostazioni email — passato dal layout (azienda vs admin). */
  settingsPath?: string;
}

function syncLabelFor(value: string | null | undefined): string {
  if (!value) return "mai";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

interface FolderCount {
  total: number;
  unread: number;
  byAccount: Record<string, { total: number; unread: number }>;
}

type FolderCounts = Record<SystemFolderKey, FolderCount>;

function createEmptyCounts(): FolderCounts {
  return SYSTEM_FOLDERS.reduce((acc, folder) => {
    acc[folder.key] = { total: 0, unread: 0, byAccount: {} };
    return acc;
  }, {} as FolderCounts);
}

function bumpCount(counts: FolderCounts, folder: SystemFolderKey, accountId: string | null, unread = false) {
  counts[folder].total += 1;
  if (unread) counts[folder].unread += 1;
  if (!accountId) return;
  counts[folder].byAccount[accountId] ??= { total: 0, unread: 0 };
  counts[folder].byAccount[accountId].total += 1;
  if (unread) counts[folder].byAccount[accountId].unread += 1;
}

function compactCount(value: number): string {
  if (value > 999) return "999+";
  return String(value);
}

function isSystemFolderKey(value: unknown): value is SystemFolderKey {
  return typeof value === "string" && SYSTEM_FOLDERS.some((folder) => folder.key === value);
}

function isRpcUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return err.code === "PGRST202" || text.includes("could not find the function") || text.includes("schema cache");
}

function applyServerCountRows(counts: FolderCounts, rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    if (!isSystemFolderKey(row.folder_key)) continue;
    const accountId = typeof row.oauth_connection_id === "string" ? row.oauth_connection_id : null;
    const total = Number(row.total ?? 0);
    const unread = Number(row.unread ?? 0);
    if (accountId) {
      counts[row.folder_key].byAccount[accountId] = { total, unread };
    } else {
      counts[row.folder_key].total = total;
      counts[row.folder_key].unread = unread;
    }
  }
}

function accountInitial(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "@";
}

function providerLabel(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized.includes("google") || normalized.includes("gmail")) return "Gmail";
  if (normalized.includes("outlook") || normalized.includes("microsoft")) return "Outlook";
  if (normalized.includes("imap")) return "IMAP";
  return provider || "Email";
}

export function EmailSidebar({ filter, onFilterChange, onCompose, connections, settingsPath = "/azienda/impostazioni/mio-profilo" }: EmailSidebarProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const [openFolders, setOpenFolders] = useState<Record<SystemFolderKey, boolean>>({
    inbox: true,
    starred: false,
    drafts: true,
    sent: false,
    archive: false,
    spam: false,
    trash: false,
  });

  useEffect(() => {
    if (filter.folder.type !== "system") return;
    setOpenFolders((current) => ({ ...current, [filter.folder.key]: true }));
  }, [filter.folder]);

  // Counter sincronizzati per cartella/account. La view è RLS-safe e personale.
	  const { data: counts } = useQuery({
	    queryKey: ["email-folder-counts", userId, connections.map((c) => c.id).join("|")],
	    enabled: !!userId,
	    refetchInterval: 60_000,
	    queryFn: async () => {
	      const next = createEmptyCounts();
	      const accountIds = connections.map((connection) => connection.id);

	      // Percorso production: conteggi aggregati dal database, senza scaricare
	      // migliaia di email nel browser.
	      // eslint-disable-next-line @typescript-eslint/no-explicit-any
	      const { data: rpcRows, error: rpcError } = await (supabase as any).rpc("email_folder_counts", {
	        p_account_ids: accountIds.length > 0 ? accountIds : null,
	      });
	      if (!rpcError && Array.isArray(rpcRows)) {
	        applyServerCountRows(next, rpcRows as Array<Record<string, unknown>>);
	        return next;
	      }
	      if (rpcError && !isRpcUnavailable(rpcError)) {
	        throw rpcError;
	      }

	      // eslint-disable-next-line @typescript-eslint/no-explicit-any
	      const { data: inboxRows } = await (supabase as any)
	        .from("v_my_email_inbox")
        .select("mailbox_folder, oauth_connection_id, is_read, is_starred, is_archived, is_trashed, status")
        .limit(5000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: draftRows } = await (supabase as any)
        .from("email_outbox")
        .select("oauth_connection_id")
        .eq("user_id", userId!)
        .eq("status", "draft");

      for (const row of (inboxRows ?? []) as Array<Record<string, unknown>>) {
        const accountId = typeof row.oauth_connection_id === "string" ? row.oauth_connection_id : null;
        const folder = typeof row.mailbox_folder === "string" ? row.mailbox_folder : "inbox";
        const unread = row.is_read === false;
        const trashed = row.is_trashed === true;
        const archived = row.is_archived === true;
        const status = typeof row.status === "string" ? row.status : null;

        if (row.is_starred === true && !trashed) bumpCount(next, "starred", accountId, unread);
        if (trashed || folder === "trash") {
          bumpCount(next, "trash", accountId, unread);
        } else if (status === "spam" || folder === "spam") {
          bumpCount(next, "spam", accountId, unread);
        } else if (archived || folder === "archive") {
          bumpCount(next, "archive", accountId, unread);
        } else if (folder === "sent") {
          bumpCount(next, "sent", accountId, unread);
        } else {
          bumpCount(next, "inbox", accountId, unread);
        }
      }

      for (const row of (draftRows ?? []) as Array<Record<string, unknown>>) {
        const accountId = typeof row.oauth_connection_id === "string" ? row.oauth_connection_id : null;
        bumpCount(next, "drafts", accountId, false);
      }

      return next;
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
    <ScrollArea className="flex-1 bg-gradient-to-b from-white via-white to-blue-50/40">
      <div className="p-3 space-y-4">
        {/* Sotto i 768px c'e' gia' il bottone tondo «Scrivi» sopra la lista. */}
        <Button
          className="h-11 w-full justify-start gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 max-md:hidden"
          onClick={onCompose}
        >
          <PencilLine className="h-4 w-4" />
          Scrivi
        </Button>

        <div className="rounded-2xl border border-blue-100 bg-white p-2 shadow-sm">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700">
            Caselle sincronizzate
          </p>
          <button
            type="button"
            onClick={() => onFilterChange({ ...filter, accountId: undefined })}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-colors",
              !filter.accountId ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
              EiC
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-semibold">Tutte le caselle</span>
              <span className="block truncate text-[10px] text-slate-500">
                {connections.length > 0 ? `${connections.length} account collegati` : "Nessun account collegato"}
              </span>
            </span>
          </button>
        </div>

        <nav className="space-y-1">
          {SYSTEM_FOLDERS.map((f) => {
            const folder: FolderFilter = { type: "system", key: f.key };
            const folderActive = isActive(folder);
            const activeAllAccounts = folderActive && !filter.accountId;
            const expanded = openFolders[f.key];
            const Icon = f.icon;
            const folderCounts = counts?.[f.key];
            const count = folderCounts?.unread || folderCounts?.total || 0;

            return (
              <div key={f.key} className="space-y-1">
                <div
                  className={cn(
                    "group flex items-center rounded-xl transition-colors",
                    activeAllAccounts ? "bg-blue-600 text-white shadow-sm shadow-blue-100" : "text-slate-700 hover:bg-blue-50/70",
                  )}
                >
                  <button
                    type="button"
                    aria-label={expanded ? `Comprimi ${f.label}` : `Espandi ${f.label}`}
                    onClick={() => setOpenFolders((current) => ({ ...current, [f.key]: !current[f.key] }))}
                    className={cn(
                      "flex h-9 w-7 shrink-0 items-center justify-center rounded-l-xl transition-colors",
                      activeAllAccounts ? "text-white/90" : "text-slate-400 group-hover:text-blue-700",
                    )}
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFilterChange({ ...filter, folder, accountId: undefined })}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-sm transition-colors",
                      activeAllAccounts ? "font-semibold" : "font-medium",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", activeAllAccounts ? "text-white" : "text-slate-500 group-hover:text-blue-700")} />
                    <span className="min-w-0 flex-1 truncate text-left">{f.label}</span>
                    {count > 0 && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-5 min-w-[24px] rounded-full px-1.5 text-[10px]",
                          activeAllAccounts ? "bg-white/20 text-white hover:bg-white/20" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {compactCount(count)}
                      </Badge>
                    )}
                  </button>
                </div>

                {expanded && connections.length > 0 && (
                  <div className="ml-7 space-y-0.5 border-l border-blue-100 pl-2">
                    {connections.map((connection) => {
                      const accountActive = folderActive && filter.accountId === connection.id;
                      const accountCount = folderCounts?.byAccount[connection.id];
                      const accountTotal = accountCount?.unread || accountCount?.total || 0;
                      const connected = connection.status === "active";
                      return (
                        <button
                          key={`${f.key}-${connection.id}`}
                          type="button"
                          onClick={() => onFilterChange({ ...filter, folder, accountId: connection.id })}
                          title={`${f.shortLabel} · ${connection.email_address}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                            accountActive
                              ? "bg-orange-50 text-orange-900 ring-1 ring-orange-100"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                              accountActive
                                ? "border-orange-200 bg-orange-100 text-orange-700"
                                : "border-blue-100 bg-white text-blue-700",
                            )}
                          >
                            {accountInitial(connection.email_address)}
                          </span>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate font-medium">{connection.email_address}</span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
                              {providerLabel(connection.provider)}
                            </span>
                          </span>
                          {accountTotal > 0 && (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                accountActive ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {compactCount(accountTotal)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Stato sync caselle — compatto, in fondo. Solo se l'utente ha
            collegato almeno una casella. Lo mostriamo sempre (anche tutto OK)
            così l'utente vede a colpo d'occhio "Ultimo sync XX min fa"; ma
            la versione con errori è ben visibile (icona rossa + msg). */}
        {connections.length > 0 && (
          <SyncStatusPanel connections={connections} settingsPath={settingsPath} />
        )}

        <Link
          to="/azienda/email/ai"
          className="block rounded-2xl border border-orange-100 bg-orange-50/70 p-3 transition-colors hover:bg-orange-100/70"
          title="Apprendimento e regole di instradamento"
        >
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-orange-900">
                AI email attiva
                <ChevronRight className="h-3.5 w-3.5 text-orange-500" />
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-orange-800/80">
                Classifica lead, preventivi, fatture e priorità. Tocca per regole e apprendimento.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </ScrollArea>
  );
}

/**
 * Su telefono il popup di riconnessione si apre da solo una volta per sessione:
 * a ogni ingresso nell'email era un foglio da chiudere prima di leggere. Il
 * riquadro rosso nel menu resta toccabile. Segna la visita e dice se c'era già.
 */
function riconnessioneGiaMostrataSuMobile(): boolean {
  if (!window.matchMedia("(max-width: 639px)").matches) return false;
  try {
    if (sessionStorage.getItem("email-riconnetti-visto")) return true;
    sessionStorage.setItem("email-riconnetti-visto", "1");
  } catch { /* storage non disponibile: si apre come sul desktop */ }
  return false;
}

/**
 * SyncStatusPanel — pannello compatto sync caselle, in fondo alla sidebar.
 *
 * Mostra in 1 riga: stato salute (CheckCircle verde o AlertTriangle ambra),
 * conteggio caselle attive su totale, e "ultimo sync XX min fa".
 * In caso di errori (status != active, consecutive_errors, last_sync_error)
 * mostra la riga in tono ambra/rosso + un link "Risolvi" verso le impostazioni.
 *
 * Nessun fetch aggiuntivo: usa i dati già passati come prop dal layout.
 */
function SyncStatusPanel({
  connections,
  settingsPath,
}: {
  connections: EmailSidebarProps["connections"];
  settingsPath: string;
}) {
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const autoOpenedRef = useRef(false);
  const extendedConnections = connections as EmailConnectionSummary[];
  const active = extendedConnections.filter((c) => c.status === "active").length;
  const unhealthy = extendedConnections.filter((c) =>
    c.status !== "active"
    || (c.consecutive_errors ?? 0) > 0
    || Boolean(c.last_sync_error)
    || c.poll_enabled === false,
  );
  const hasError = unhealthy.length > 0;
  // "Ultimo sync" = il più recente fra le caselle
  const lastSyncAt = extendedConnections
    .map((c) => c.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const lastSyncLabel = syncLabelFor(lastSyncAt);

  // Auto-apertura: appena si rilevano caselle in errore (connessioni caricate in
  // modo asincrono) il popup si apre da solo, una volta per ingresso nel client.
  // Rientrando nell'email col problema ancora presente → popup già aperto.
  // Resta richiudibile; se gli errori si risolvono, il guard si resetta.
  useEffect(() => {
    if (!hasError) {
      autoOpenedRef.current = false;
      return;
    }
    if (!autoOpenedRef.current && !riconnessioneGiaMostrataSuMobile()) {
      autoOpenedRef.current = true;
      setReconnectOpen(true);
    }
  }, [hasError]);

  const panelClass = cn(
    "block w-full text-left rounded-2xl border p-3 transition-colors",
    hasError
      ? "border-rose-200 bg-rose-50 hover:bg-rose-100/70"
      : "border-emerald-100 bg-emerald-50/70 hover:bg-emerald-100/70",
  );

  const content = (
    <div className="flex items-start gap-2">
      {hasError ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-xs font-semibold",
          hasError ? "text-rose-900" : "text-emerald-900",
        )}>
          {hasError
            ? `${unhealthy.length} ${unhealthy.length === 1 ? "casella" : "caselle"} con problemi`
            : `${active}/${extendedConnections.length} ${extendedConnections.length === 1 ? "casella attiva" : "caselle attive"}`}
        </p>
        <p className={cn(
          "mt-0.5 truncate text-[11px] leading-snug",
          hasError ? "text-rose-700" : "text-emerald-800/80",
        )}>
          {hasError
            ? "Riconnetti la casella in errore"
            : `Ultimo controllo ${lastSyncLabel}`}
        </p>
      </div>
    </div>
  );

  // In errore: il banner apre il popup mirato di riconnessione (non più un link
  // generico). Senza errori: link allo stato sync / impostazioni.
  if (hasError) {
    return (
      <>
        <button
          type="button"
          onClick={() => setReconnectOpen(true)}
          className={panelClass}
          title="Una o più caselle hanno problemi — clicca per riconnetterle"
        >
          {content}
        </button>
        <ReconnectMailboxDialog
          open={reconnectOpen}
          onOpenChange={setReconnectOpen}
          brokenConnections={unhealthy}
          settingsPath={settingsPath}
        />
      </>
    );
  }

  return (
    <Link to={settingsPath} className={panelClass} title="Stato sync caselle — clicca per impostazioni">
      {content}
    </Link>
  );
}
