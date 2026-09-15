/**
 * Impostazioni dei preventivi raggruppate.
 *
 * Il menu «Preventivi & Listino» aveva undici voci, alcune sullo stesso
 * argomento in due posti (margini e sconti, condizioni e firma elettronica) e
 * altre che coi preventivi non c'entravano. Qui le pagine restano quelle di
 * sempre, con gli stessi indirizzi: cambia che nel menu compare una voce per
 * argomento e, dentro, le schede per passare da una pagina all'altra.
 */

export type PermessoImpostazione =
  | "canViewSettingsPricing"
  | "canViewSettingsBundle"
  | "canViewCosts"
  | "canViewSettingsScontistica"
  | "canViewSettingsIntegrations";

export interface SchedaImpostazione {
  /** Segmento dell'indirizzo dopo /azienda/impostazioni/ */
  sezione: string;
  /** Altri segmenti che aprono la stessa pagina */
  alias?: string[];
  etichetta: string;
  to: string;
  permesso: PermessoImpostazione;
}

export interface GruppoImpostazioni {
  id: "listino" | "margini" | "firma";
  titolo: string;
  descrizione: string;
  schede: SchedaImpostazione[];
}

const BASE = "/azienda/impostazioni";

export const GRUPPI_IMPOSTAZIONI: GruppoImpostazioni[] = [
  {
    id: "listino",
    titolo: "Listino",
    descrizione: "Prodotti, manodopera e servizi, kit: quello che si sceglie facendo un preventivo",
    schede: [
      { sezione: "listino", etichetta: "Prodotti", to: `${BASE}/listino`, permesso: "canViewSettingsPricing" },
      {
        sezione: "tariffe",
        alias: ["listino-manutenzione"],
        etichetta: "Manodopera e servizi",
        to: `${BASE}/tariffe`,
        permesso: "canViewSettingsPricing",
      },
      {
        sezione: "bundle",
        alias: ["bundle-serramentista"],
        etichetta: "Kit e pacchetti",
        to: `${BASE}/bundle`,
        permesso: "canViewSettingsBundle",
      },
    ],
  },
  {
    id: "margini",
    titolo: "Margini e sconti",
    descrizione: "Margine minimo e target, spese generali, numerazione e limiti di sconto dei preventivi",
    schede: [
      { sezione: "margini", etichetta: "Margini", to: `${BASE}/margini`, permesso: "canViewCosts" },
      { sezione: "scontistica", etichetta: "Sconti", to: `${BASE}/scontistica`, permesso: "canViewSettingsScontistica" },
    ],
  },
  {
    id: "firma",
    titolo: "Firma e condizioni",
    descrizione: "Le clausole che il cliente accetta e come firma i preventivi",
    schede: [
      { sezione: "condizioni-firma", etichetta: "Condizioni", to: `${BASE}/condizioni-firma`, permesso: "canViewSettingsPricing" },
      {
        sezione: "firma-elettronica",
        etichetta: "Firma elettronica",
        to: `${BASE}/firma-elettronica`,
        permesso: "canViewSettingsIntegrations",
      },
    ],
  },
];

/** «/azienda/impostazioni/tariffe?tab=x» → «tariffe» */
export function sezioneDaPercorso(pathname: string): string | null {
  const m = pathname.match(/\/impostazioni\/([^/?#]+)/);
  return m ? m[1] : null;
}

function appartiene(scheda: SchedaImpostazione, sezione: string): boolean {
  return scheda.sezione === sezione || (scheda.alias ?? []).includes(sezione);
}

export function gruppoDellaSezione(sezione: string | null | undefined): GruppoImpostazioni | null {
  if (!sezione) return null;
  return GRUPPI_IMPOSTAZIONI.find((g) => g.schede.some((s) => appartiene(s, sezione))) ?? null;
}

export function schedaDellaSezione(
  gruppo: GruppoImpostazioni,
  sezione: string | null | undefined,
): SchedaImpostazione | null {
  if (!sezione) return null;
  return gruppo.schede.find((s) => appartiene(s, sezione)) ?? null;
}

export type PermessiImpostazioni = Partial<Record<PermessoImpostazione, boolean>>;

/** Le schede che l'utente può aprire, nell'ordine del gruppo. */
export function schedeVisibili(
  gruppo: GruppoImpostazioni,
  isAdmin: boolean,
  permessi: PermessiImpostazioni,
): SchedaImpostazione[] {
  return gruppo.schede.filter((s) => isAdmin || Boolean(permessi[s.permesso]));
}

/** Se il percorso appartiene al gruppo: la voce del menu resta accesa su tutte le sue schede. */
export function percorsoNelGruppo(gruppo: GruppoImpostazioni, pathname: string): boolean {
  const sezione = sezioneDaPercorso(pathname);
  return sezione != null && gruppo.schede.some((s) => appartiene(s, sezione));
}
