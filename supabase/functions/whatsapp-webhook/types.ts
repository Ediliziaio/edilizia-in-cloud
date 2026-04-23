// MP01 — Tipi condivisi fra index.ts, router.ts e handlers/*.

export type Purpose =
  | "bot_operativo"
  | "assistenza"
  | "lead"
  | "marketing"
  | "notifiche";

export interface WANumber {
  id: string;
  company_id: string;
  purpose: Purpose;
  agent_id: string | null;
  stato: string | null;
  display_name: string | null;
}

export interface IncomingWhatsAppMessage {
  id?: string;
  from: string;
  type?: string;
  caption?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  audio?: { id?: string; voice?: boolean };
  document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  sticker?: { id?: string };
  reaction?: { emoji?: string; message_id?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { text?: string; payload?: string };
  timestamp?: string;
}

export interface ExtractedMessage {
  content: string;
  messageType: string;
  mediaId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface InboundContext {
  waNumber: WANumber;
  phoneNumberId: string;
  msg: IncomingWhatsAppMessage;
  extracted: ExtractedMessage;
  senderPhone: string;
  senderName: string;
}
