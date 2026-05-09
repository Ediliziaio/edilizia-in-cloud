/**
 * PublicChatWidgetPage — pagina pubblica /widget?token=UUID
 *
 * Renderizza solo il <PublicChatWidget> a schermo intero, trasparente.
 * Usata dentro <iframe> dal loader embed.js per integrazione siti esterni.
 *
 * NO LAYOUT, NO HEADER, NO LOGIN — completamente standalone.
 *
 * Query params:
 *   token  = UUID widget (obbligatorio, da public_chatbot_settings.public_widget_token)
 *   pos    = bottom-right (default) | bottom-left
 *   open   = 1 per aprire automaticamente al mount (per debug/testing)
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PublicChatWidget } from "@/components/public-chat/PublicChatWidget";

export default function PublicChatWidgetPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const position =
    (searchParams.get("pos") as "bottom-right" | "bottom-left") ?? "bottom-right";
  const defaultOpen = searchParams.get("open") === "1";

  // Body trasparente per non coprire il sito host
  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  // Notifica al parent (iframe → host) eventi importanti per resize
  useEffect(() => {
    function notify(event: string, data?: Record<string, unknown>) {
      try {
        window.parent.postMessage({ source: "eic-public-chat", event, ...data }, "*");
      } catch {
        /* skip */
      }
    }
    notify("ready");
    return () => notify("unmounted");
  }, []);

  if (!token) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ color: "#dc2626", fontSize: 18 }}>Widget token mancante</h1>
        <p style={{ color: "#666", fontSize: 14 }}>
          Aggiungi <code>?token=UUID</code> alla URL.
        </p>
      </div>
    );
  }

  return (
    <PublicChatWidget
      widgetToken={token}
      position={position}
      defaultOpen={defaultOpen}
      onQualified={(data) => {
        // Notifica al parent quando lead qualificato (utile per analytics)
        try {
          window.parent.postMessage(
            { source: "eic-public-chat", event: "qualified", session_id: data.sessionId },
            "*",
          );
        } catch {
          /* skip */
        }
      }}
    />
  );
}
