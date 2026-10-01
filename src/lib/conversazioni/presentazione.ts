/**
 * Come si presentano i messaggi di una conversazione: canale, da dove sono
 * partiti e a chi sono arrivati.
 *
 * WhatsApp ed email erano entrambe bolle verdi con una sigla minuscola: non si
 * capiva quale fosse quale, né da quale numero o casella fosse partito il
 * messaggio. Qui la parte senza interfaccia: formattazione dei numeri e riga
 * «da → a» uguale per la chat delle Conversazioni e per la scheda contatto.
 */

export interface DettaglioInvio {
  ref_tabella: string;
  ref_id: string;
  da: string | null;
  a: string | null;
  via: string | null;
}

export const chiaveDettaglio = (tabella: string, id: string) => `${tabella}:${id}`;

/** «393479047790» → «+39 347 9047790»; un indirizzo email resta com'è. */
export function formattaContatto(valore: string | null | undefined): string {
  const v = (valore ?? "").trim();
  if (!v) return "";
  if (v.includes("@")) return v;
  const cifre = v.replace(/[^0-9]/g, "");
  if (cifre.length < 8) return v;
  if (cifre.startsWith("39") && cifre.length >= 11 && cifre.length <= 13) {
    const nazionale = cifre.slice(2);
    return `+39 ${nazionale.slice(0, 3)} ${nazionale.slice(3)}`;
  }
  return `+${cifre}`;
}

export interface PercorsoMessaggio {
  da: string;
  a: string;
  /** Con quale numero/casella: «Il Bagno Group», «Casella collegata»… */
  via: string;
}

export function percorsoMessaggio(d: Pick<DettaglioInvio, "da" | "a" | "via"> | null | undefined): PercorsoMessaggio | null {
  if (!d) return null;
  const da = formattaContatto(d.da);
  const a = formattaContatto(d.a);
  if (!da && !a) return null;
  return { da, a, via: (d.via ?? "").trim() };
}

/** Riga unica per le bolle WhatsApp: «+39 331 953 6197 (Il Bagno Group) → +39 347 9047790». */
export function rigaPercorsoWhatsApp(p: PercorsoMessaggio | null): string {
  if (!p) return "";
  const mittente = p.via && p.da && !p.da.includes("@") ? `${p.da} (${p.via})` : p.da || p.via;
  return [mittente, p.a].filter(Boolean).join(" → ");
}

export type FiltroCanale = "tutti" | "whatsapp" | "email" | "sms";

export const FILTRI_CANALE: { chiave: FiltroCanale; etichetta: string }[] = [
  { chiave: "tutti", etichetta: "Tutto" },
  { chiave: "whatsapp", etichetta: "WhatsApp" },
  { chiave: "email", etichetta: "Email" },
  { chiave: "sms", etichetta: "SMS" },
];

/** Conta i messaggi per canale (solo quelli del filtro: nota, social ecc. stanno in «Tutto»). */
export function contaPerCanale(messaggi: { canale: string }[]): Record<FiltroCanale, number> {
  const c: Record<FiltroCanale, number> = { tutti: messaggi.length, whatsapp: 0, email: 0, sms: 0 };
  for (const m of messaggi) {
    if (m.canale === "whatsapp") c.whatsapp++;
    else if (m.canale === "email") c.email++;
    else if (m.canale === "sms") c.sms++;
  }
  return c;
}
