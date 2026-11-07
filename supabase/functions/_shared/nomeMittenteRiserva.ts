/**
 * Il nome del mittente quando l'email parte dal sottodominio della piattaforma
 * (passo 5 di resolveSender), pura: provata in
 * src/test/logic/mittenteServizioSenzaVia.test.ts.
 *
 * 07/11/2026: il «via EdiliziaInCloud» resta solo sulle campagne. Le email di
 * servizio (nuova password, firme, appuntamenti) arrivano col solo nome
 * dell'azienda: «Innovasol srl <no-reply@notifiche.ediliziaincloud.it>».
 */

export type CanaleMittente = "marketing" | "transactional";

export const SUFFISSO_PIATTAFORMA_PREDEFINITO = " via EdiliziaInCloud";

export function nomeMittenteDiRiserva(args: {
  nome: string;
  canale: CanaleMittente;
  /** platform_settings email_{canale}_fallback_from_suffix; vuoto = quello predefinito. */
  suffisso?: string | null;
  /** Email di servizio spedite dal provider del marketing: niente suffisso anche lì. */
  senzaSuffisso?: boolean;
}): string {
  if (args.canale === "transactional" || args.senzaSuffisso) return args.nome;
  const suffisso = args.suffisso || SUFFISSO_PIATTAFORMA_PREDEFINITO;
  // "EdiliziaInCloud via EdiliziaInCloud": quando il mittente è già la
  // piattaforma, ripetere il suffisso fa solo una brutta figura.
  const soloLettere = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const piattaforma = soloLettere(suffisso.replace(/^\s*via\s*/i, ""));
  return soloLettere(args.nome) === piattaforma ? args.nome : `${args.nome}${suffisso}`;
}
