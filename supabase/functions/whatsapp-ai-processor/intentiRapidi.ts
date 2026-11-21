export function cantiereNellaRichiesta(testo: string): string | undefined {
  const luogo = testo.match(/\b(?:cantiere|commessa)\s+([^.,;!?\n]+)/i)?.[1]?.trim();
  if (luogo && !/^(?:da\b|e\b|ha\b|perche\b|perché\b|sta\b|si\b)/i.test(luogo)) return luogo.slice(0, 150);
}

/** Riserva il percorso diretto alle richieste che chiedono esplicitamente una scrittura. */
export function segnalazioneEsplicita(testo: string) {
  const richiesta = testo.trim().match(/^(?:apri|crea|registra|segnala)(?:mi)?\s+(?:(?:un|una)\s+)?(ticket(?:\s+di)?(?:\s+(?:assistenza|manutenzione))?|assistenza|manutenzione|guasto|problema|danno|segnalazione)\b[\s:,-]*(.+)/is);
  if (!richiesta || richiesta[2].trim().length < 5) return null;
  const descrizione = richiesta[2].trim().slice(0, 5000);
  const mezzo = /\b(?:targa|mezzo|veicolo|furgone|camion|auto|gru|escavatore|pala|attrezzatura|trapano|betoniera)\b/i.test(descrizione);
  const tipo = /\b(?:danno|ammaccat\w*|incidente)\b/i.test(richiesta[1]) ? "danno"
    : /\b(?:manutenzione|tagliando|revisione)\b/i.test(richiesta[1]) ? "manutenzione" : "guasto";
  const categoria = /\bmanutenzione\b/i.test(richiesta[1]) ? "manutenzione" : "assistenza";
  const urgenza = /\b(?:urgente|pericol\w*|incidente|infortunio|ferit\w*|lavoro fermo)\b/i.test(descrizione) ? "alta" : "media";
  const targa = descrizione.match(/\b[a-z]{2}\s*\d{3}\s*[a-z]{2}\b/i)?.[0];
  return { descrizione, mezzo, targa, tipo, categoria, urgenza, cantiere: cantiereNellaRichiesta(descrizione) } as const;
}

export function vuolePreventivoInChat(testo: string): boolean {
  const t = testo.toLowerCase();
  if (/\b(?:non|senza)\b.{0,35}\b(?:mand|invi|pdf)/.test(t)) return false;
  return /\b(?:mandami|inviami|mandamelo|mandamela|inviamelo|inviamela)\b.{0,28}\b(?:pdf|qui|su whatsapp)\b/.test(t)
    || /\b(?:mandalo|mandala|invialo|inviala|invia|manda)\b.{0,30}\b(?:qui|a me|su questa chat)\b/.test(t);
}

export function tipoAllegatoDetto(testo: string): "ddt" | "scontrino" | "foto" | null {
  const tipo = testo.trim().match(/^(?:(?:è|quest[oa]\s+è)\s+)?(?:(?:un|una|uno)\s+)?(ddt|bolla|scontrino|ricevuta fiscale|foto di cantiere)\b/i)?.[1]?.toLowerCase();
  if (tipo === "ddt" || tipo === "bolla") return "ddt";
  if (tipo === "scontrino" || tipo === "ricevuta fiscale") return "scontrino";
  return tipo === "foto di cantiere" ? "foto" : null;
}
