export const supportStatusLabels = {
  open: "Aperto",
  in_progress: "In lavorazione",
  pending: "In attesa",
  resolved: "Risolto",
  closed: "Chiuso",
} as const;

export const supportPriorityLabels = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  urgent: "Urgente",
} as const;

export function isSupportActive(status: string) {
  return status !== "resolved" && status !== "closed";
}

export type SupportTicketMessage = { id: string; message: string; created_at: string };

const ticketHeading = /^#{1,6}[ \t]+🎫[ \t]+Ticket[ \t]+(#[\w-]+)[ \t]+[—–-][ \t]+(.+)$/;

export function supportMessagePreview(message: string) {
  const line = message.trim().split(/\r?\n/, 1)[0] ?? "";
  const ticket = ticketHeading.exec(line);
  if (ticket) return { code: ticket[1], title: ticket[2] };

  return { code: null, title: line.replace(/^#{1,6}\s+/, "") || "Apri conversazione" };
}

export function supportTicketLookupCode(search: string) {
  const value = search.trim();
  if (!/^(?:#[a-z0-9-]{4,40}|[a-f0-9]{8}|[a-z]{2,12}-\d{1,12})$/i.test(value)) return null;
  return value.replace(/^#/, "").toUpperCase();
}

export function supportTicketDetails(message: string) {
  const { code, title } = supportMessagePreview(message);
  if (!code) return null;

  const body = message.trim().split(/\r?\n/).slice(1).join("\n").trim();
  const descriptionHeading = /^### 📝 Descrizione[ \t]*$/m.exec(body);
  if (!descriptionHeading) return { code, title, author: null, description: body, transcript: null };

  const metadata = body.slice(0, descriptionHeading.index);
  const author = /^\*\*Aperto da\*\*:[ \t]*(.+)$/m.exec(metadata)?.[1] ?? null;
  const content = body.slice(descriptionHeading.index + descriptionHeading[0].length).trim();
  const transcriptHeading = /^### 🤖 Conversazione con Silvio Assistente \(per contesto\)[ \t]*$/m.exec(content);
  if (!transcriptHeading) return { code, title, author, description: content, transcript: null };

  const transcript = content
    .slice(transcriptHeading.index + transcriptHeading[0].length)
    .replace(/\n---\n_Ticket aperto via AI Assistant\. Rispondi qui per gestirlo\._$/, "")
    .trim();
  return { code, title, author, description: content.slice(0, transcriptHeading.index).trim(), transcript };
}

export function formatSupportHours(hours: number) {
  const minutes = Math.max(0, Math.floor(hours * 60));
  if (minutes < 60) return minutes + " min";
  if (hours < 24) return Math.floor(hours) + " h";
  return Math.floor(hours / 24) + " g " + Math.floor(hours % 24) + " h";
}
