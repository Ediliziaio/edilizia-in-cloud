/**
 * La campanella dell'area campo (operai e subappaltatori), 26/09/2026.
 *
 * Fino a oggi in /campo non c'era: gli avvisi (assegnazioni, esito del
 * rapportino, promemoria, menzioni in chat, attività) finivano in una tabella
 * che nessuna pagina del campo leggeva. Stessi dati della campanella
 * dell'ufficio (useNotifications), ma i link vanno nell'area campo
 * (linkPerCampo): quelli dell'ufficio a questi ruoli sono chiusi.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { linkPerCampo } from "@/lib/notifiche/linkCampo";
import { cn } from "@/lib/utils";

export function CampanellaCampo({ className }: { className?: string }) {
  const [aperta, setAperta] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, unreadMessagesCount, markAsRead, markAllAsRead } = useNotifications();

  const apri = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    setAperta(false);
    navigate(linkPerCampo(n.action_url));
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("relative h-9 w-9 shrink-0", className)}
        onClick={() => setAperta(true)}
        aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} da leggere` : "Notifiche"}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <Sheet open={aperta} onOpenChange={setAperta}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3 pr-12">
            <SheetTitle className="text-base">Notifiche</SheetTitle>
            {unreadMessagesCount > 0 && (
              <Button variant="ghost" size="sm" className="tap-compact h-8 text-xs" onClick={() => markAllAsRead()}>
                Segna tutte lette
              </Button>
            )}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nessuna notifica</p>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => apri(n)}
                      className="tap-compact flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted"
                    >
                      <span
                        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-primary")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", !n.is_read && "font-semibold")}>{n.title}</span>
                        {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
