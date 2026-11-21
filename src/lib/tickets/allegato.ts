export const TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";

export function allegatoTicket(valore: string, ticketId: string) {
  let path = valore;
  if (/^https?:\/\//i.test(valore) || valore.startsWith("/storage/v1/")) {
    try {
      const { pathname } = new URL(valore, "https://localhost");
      const match = pathname.match(/^\/storage\/v1\/object\/(?:sign\/|public\/|authenticated\/)?ticket-attachments\/(.+)$/);
      path = match ? decodeURIComponent(match[1]) : "";
    } catch {
      path = "";
    }
  }
  const parti = path.split("/");
  const interno = parti.length > 1 && parti[0] === ticketId
    && parti.every((parte) => parte && parte !== "." && parte !== ".." && !parte.includes("\\"));
  const nomeConId = parti.at(-1) || "Allegato";
  const nome = nomeConId.replace(/^[0-9a-f-]{36}[-_]/i, "");
  return { path: interno ? path : null, nome, immagine: /\.(jpe?g|png|gif|webp|bmp)$/i.test(nome) };
}
