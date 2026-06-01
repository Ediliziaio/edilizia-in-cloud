// MP02 — Tool Registry centrale.
// Filter per role_grants + conversione a spec OpenAI + lookup per name.

import type { ToolDef } from "./shared/types.ts";

// Operaio
import { creaRapportino, creaRapportinoDef } from "./operaio/crea_rapportino.ts";
import {
  aggiungiAttivitaRapportino,
  aggiungiAttivitaRapportinoDef,
} from "./operaio/aggiungi_attivita_rapportino.ts";
import { caricaDDT, caricaDDTDef } from "./operaio/carica_ddt.ts";
import {
  caricaFotoCantiere,
  caricaFotoCantiereDef,
} from "./operaio/carica_foto_cantiere.ts";
import {
  registraPresenza,
  registraPresenzaDef,
} from "./operaio/registra_presenza.ts";
import {
  creaSegnalazione,
  creaSegnalazioneDef,
} from "./operaio/crea_segnalazione.ts";
import {
  elencaMieiCantieriOggi,
  elencaMieiCantieriOggiDef,
} from "./operaio/elenca_miei_cantieri_oggi.ts";
import {
  impostaCantiereCorrente,
  impostaCantiereCorrenteDef,
} from "./operaio/imposta_cantiere_corrente.ts";

// Titolare
import { statoCantiere, statoCantiereDef } from "./titolare/stato_cantiere.ts";
import {
  marginalitaCantiere,
  marginalitaCantiereDef,
} from "./titolare/marginalita_cantiere.ts";
import {
  scadenzeFatture,
  scadenzeFattureDef,
} from "./titolare/scadenze_fatture.ts";
import { costiMese, costiMeseDef } from "./titolare/costi_mese.ts";
import {
  listaApprovazioni,
  listaApprovazioniDef,
} from "./titolare/lista_approvazioni.ts";
import {
  approvaRichiesta,
  approvaRichiestaDef,
} from "./titolare/approva_richiesta.ts";
import {
  scostamentiCommesse,
  scostamentiCommesseDef,
} from "./titolare/scostamenti_commesse.ts";

// Shared (cross-ruolo)
import { chiediConferma, chiediConfermaDef } from "./shared/chiedi_conferma.ts";

export const TOOLS_REGISTRY: ToolDef[] = [
  // Shared (tutti i ruoli) — requires_grants: []
  { ...chiediConfermaDef, handler: chiediConferma as ToolDef["handler"] },

  // Operaio (8)
  { ...creaRapportinoDef, handler: creaRapportino as ToolDef["handler"] },
  { ...aggiungiAttivitaRapportinoDef, handler: aggiungiAttivitaRapportino as ToolDef["handler"] },
  { ...caricaDDTDef, handler: caricaDDT as ToolDef["handler"] },
  { ...caricaFotoCantiereDef, handler: caricaFotoCantiere as ToolDef["handler"] },
  { ...registraPresenzaDef, handler: registraPresenza as ToolDef["handler"] },
  { ...creaSegnalazioneDef, handler: creaSegnalazione as ToolDef["handler"] },
  { ...elencaMieiCantieriOggiDef, handler: elencaMieiCantieriOggi as ToolDef["handler"] },
  { ...impostaCantiereCorrenteDef, handler: impostaCantiereCorrente as ToolDef["handler"] },

  // Titolare (7)
  { ...statoCantiereDef, handler: statoCantiere as ToolDef["handler"] },
  { ...marginalitaCantiereDef, handler: marginalitaCantiere as ToolDef["handler"] },
  { ...scadenzeFattureDef, handler: scadenzeFatture as ToolDef["handler"] },
  { ...costiMeseDef, handler: costiMese as ToolDef["handler"] },
  { ...listaApprovazioniDef, handler: listaApprovazioni as ToolDef["handler"] },
  { ...approvaRichiestaDef, handler: approvaRichiesta as ToolDef["handler"] },
  { ...scostamentiCommesseDef, handler: scostamentiCommesse as ToolDef["handler"] },
];

/** Filtra tool disponibili in base ai grants dell'utente. */
export function filterToolsByGrants(grants: string[]): ToolDef[] {
  return TOOLS_REGISTRY.filter((t) =>
    t.requires_grants.every((g) => grants.includes(g))
  );
}

/** Converte array ToolDef in formato OpenAI Chat Completion. */
export function toOpenAISpec(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Lookup tool per nome. */
export function findTool(name: string): ToolDef | undefined {
  return TOOLS_REGISTRY.find((t) => t.name === name);
}
