/**
 * MobileChatTeamButton — Pulsante Chat Team nell'header mobile.
 * Sostituisce SilvioBellPopover su mobile (v8.6.71):
 *   - Icona MessagesSquare con badge numerico per messaggi non letti
 *   - Tap → /azienda/chat
 *   - Solo md:hidden (su desktop la chat è raggiungibile dalla sidebar)
 *
 * Il badge è calcolato sommando i `unread_count` di tutti i canali tramite
 * la RPC `get_internal_chat_sidebar_state`. Realtime sub aggiorna al volo.
 */
import { useNavigate } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInternalChatUnreadTotal } from "@/hooks/useInternalChatUnreadTotal";

export function MobileChatTeamButton() {
  const navigate = useNavigate();
  const unread = useInternalChatUnreadTotal();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 shrink-0 md:hidden"
      onClick={() => navigate("/azienda/chat")}
      aria-label={unread > 0 ? `Chat team — ${unread} messaggi non letti` : "Chat team"}
      title="Chat Team"
    >
      <MessagesSquare className="h-4 w-4" aria-hidden="true" />
      {unread > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold leading-none ring-2 ring-background"
          aria-hidden="true"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );
}
