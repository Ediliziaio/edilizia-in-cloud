// MP01 — Parser contenuto messaggio Meta → shape normalizzata.
// Estratto dal vecchio index.ts (invariato come logica).

import type { ExtractedMessage, IncomingWhatsAppMessage } from "./types.ts";

export function extractMessageContent(
  msg: IncomingWhatsAppMessage,
): ExtractedMessage {
  const type = msg.type ?? "unknown";
  switch (type) {
    case "text":
      return {
        content: msg.text?.body ?? "",
        messageType: "text",
        mediaId: null,
        metadata: null,
      };
    case "image":
      return {
        content: msg.image?.caption || "[Immagine]",
        messageType: "image",
        mediaId: msg.image?.id ?? null,
        metadata: msg.image?.caption ? { caption: msg.image.caption } : null,
      };
    case "video":
      return {
        content: msg.video?.caption || "[Video]",
        messageType: "video",
        mediaId: msg.video?.id ?? null,
        metadata: msg.video?.caption ? { caption: msg.video.caption } : null,
      };
    case "audio":
      return {
        content: "[Audio]",
        messageType: "audio",
        mediaId: msg.audio?.id ?? null,
        metadata: { voice: msg.audio?.voice ?? false },
      };
    case "document":
      return {
        content: msg.document?.caption || msg.document?.filename || "[Documento]",
        messageType: "document",
        mediaId: msg.document?.id ?? null,
        metadata: {
          filename: msg.document?.filename,
          mime_type: msg.document?.mime_type,
        },
      };
    case "location": {
      const loc = msg.location ?? {};
      const label =
        loc.name ?? loc.address ?? `${loc.latitude ?? ""},${loc.longitude ?? ""}`;
      return {
        content: `[Posizione] ${label}`,
        messageType: "location",
        mediaId: null,
        metadata: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          name: loc.name,
          address: loc.address,
        },
      };
    }
    case "contacts": {
      const list = msg.contacts ?? [];
      const names = list
        .map((c) => c.name?.formatted_name ?? "Contatto")
        .slice(0, 3)
        .join(", ");
      return {
        content: `[Contatti] ${names || "condivisi"}`,
        messageType: "contacts",
        mediaId: null,
        metadata: { contacts: list },
      };
    }
    case "sticker":
      return {
        content: "[Sticker]",
        messageType: "sticker",
        mediaId: msg.sticker?.id ?? null,
        metadata: null,
      };
    case "reaction":
      return {
        content: `[Reazione ${msg.reaction?.emoji ?? ""}]`.trim(),
        messageType: "reaction",
        mediaId: null,
        metadata: {
          emoji: msg.reaction?.emoji,
          to_message_id: msg.reaction?.message_id,
        },
      };
    case "interactive": {
      const ir = msg.interactive?.button_reply || msg.interactive?.list_reply;
      return {
        content: ir?.title || "[Risposta interattiva]",
        messageType: "interactive",
        mediaId: null,
        metadata: { interactive: msg.interactive },
      };
    }
    case "button":
      return {
        content: msg.button?.text || "[Pulsante]",
        messageType: "button",
        mediaId: null,
        metadata: { payload: msg.button?.payload },
      };
    default:
      return {
        content: `[Messaggio ${type}]`,
        messageType: "unknown",
        mediaId: null,
        metadata: { raw_type: type },
      };
  }
}
