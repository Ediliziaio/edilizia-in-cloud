/**
 * Da dove arriva un contatto, come lo mostra il registro attività: fonte e,
 * per i lead Meta, piattaforma, campagna e inserzione.
 */
const PIATTAFORME_META: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
};

/** Testo dell'evento di ingresso: una riga per ogni dato d'origine presente. */
export function righeOrigine(o: { fonte?: string | null; piattaforma?: string | null; campagna?: string | null; inserzione?: string | null }): string | null {
  const righe: string[] = [];
  if (o.fonte) righe.push(`Fonte: ${o.fonte}`);
  if (o.piattaforma) righe.push(`Piattaforma: ${PIATTAFORME_META[o.piattaforma] ?? o.piattaforma}`);
  if (o.campagna) righe.push(`Campagna: ${o.campagna}`);
  if (o.inserzione) righe.push(`Inserzione: ${o.inserzione}`);
  return righe.length ? righe.join("\n") : null;
}
