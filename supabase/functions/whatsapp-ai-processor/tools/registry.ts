// MP02 — Tool Registry centrale.
// Filter per role_grants + conversione a spec OpenAI + lookup per name.

import { errResult, type ToolDef } from "./shared/types.ts";

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
import { caricaScontrino, caricaScontrinoDef } from "./operaio/carica_scontrino.ts";

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

// Ufficio e amministratore
import { inviaPdfPreventivo, inviaPdfPreventivoDef } from "./ufficio/invia_pdf_preventivo.ts";
import { inviaPreventivoBagno, inviaPreventivoBagnoDef } from "./ufficio/invia_preventivo_bagno.ts";
import { creaPreventivoAi, creaPreventivoAiDef } from "./ufficio/crea_preventivo_ai.ts";
import { salvaPreventivoBozza, salvaPreventivoBozzaDef } from "./ufficio/salva_preventivo_bozza.ts";
import { verificaModelloPreventivo, verificaModelloPreventivoDef } from "./ufficio/verifica_modello_preventivo.ts";
import { generaPdfModelloBagno, generaPdfModelloBagnoDef } from "./ufficio/genera_pdf_modello_bagno.ts";
import { inviaPdfModelloBagno, inviaPdfModelloBagnoDef } from "./ufficio/invia_pdf_modello_bagno.ts";
import { preparaPreventivoModello, preparaPreventivoModelloDef } from "./ufficio/prepara_preventivo_modello.ts";

// Shared (cross-ruolo)
import { chiediConferma, chiediConfermaDef } from "./shared/chiedi_conferma.ts";

export const TOOLS_REGISTRY: ToolDef[] = [
  // Shared (tutti i ruoli) — requires_grants: []
  { ...chiediConfermaDef, handler: chiediConferma as ToolDef["handler"] },

  // Operaio (8)
  { ...creaRapportinoDef, handler: creaRapportino as ToolDef["handler"] },
  { ...aggiungiAttivitaRapportinoDef, handler: aggiungiAttivitaRapportino as ToolDef["handler"] },
  { ...caricaDDTDef, handler: async (ctx, args) => {
    if (typeof args.numero_ddt !== "string" || typeof args.fornitore !== "string") return errResult("invalid_args", "Indica numero DDT e fornitore.");
    return await caricaDDT(ctx, { ...args, numero_ddt: args.numero_ddt, fornitore: args.fornitore });
  } },
  { ...caricaFotoCantiereDef, handler: caricaFotoCantiere as ToolDef["handler"] },
  { ...registraPresenzaDef, handler: async (ctx, args) => {
    const tipo = args.tipo;
    if (tipo !== "entrata" && tipo !== "uscita" && tipo !== "inizio_pausa" && tipo !== "fine_pausa") return errResult("invalid_args", "Indica entrata, uscita o pausa.");
    return await registraPresenza(ctx, { ...args, tipo });
  } },
  { ...creaSegnalazioneDef, handler: async (ctx, args) => {
    if (typeof args.descrizione !== "string") return errResult("invalid_args", "Descrivi il problema.");
    return await creaSegnalazione(ctx, { ...args, descrizione: args.descrizione });
  } },
  { ...elencaMieiCantieriOggiDef, handler: elencaMieiCantieriOggi as ToolDef["handler"] },
  { ...impostaCantiereCorrenteDef, handler: impostaCantiereCorrente as ToolDef["handler"] },
  { ...caricaScontrinoDef, handler: caricaScontrino as ToolDef["handler"] },

  // Titolare (7)
  { ...statoCantiereDef, handler: statoCantiere as ToolDef["handler"] },
  { ...marginalitaCantiereDef, handler: marginalitaCantiere as ToolDef["handler"] },
  { ...scadenzeFattureDef, handler: scadenzeFatture as ToolDef["handler"] },
  { ...costiMeseDef, handler: costiMese as ToolDef["handler"] },
  { ...listaApprovazioniDef, handler: listaApprovazioni as ToolDef["handler"] },
  { ...approvaRichiestaDef, handler: async (ctx, args) => {
    const esito = args.esito;
    if (typeof args.richiesta_id !== "string" || (esito !== "approvata" && esito !== "rifiutata")) return errResult("invalid_args", "Indica la richiesta e se approvarla o rifiutarla.");
    return await approvaRichiesta(ctx, { ...args, richiesta_id: args.richiesta_id, esito });
  } },
  { ...scostamentiCommesseDef, handler: scostamentiCommesse as ToolDef["handler"] },

  // Ufficio e amministratore (3)
  { ...inviaPdfPreventivoDef, handler: inviaPdfPreventivo as ToolDef["handler"] },
  { ...inviaPreventivoBagnoDef, handler: inviaPreventivoBagno as ToolDef["handler"] },
  { ...creaPreventivoAiDef, handler: creaPreventivoAi as ToolDef["handler"] },
  { ...salvaPreventivoBozzaDef, handler: salvaPreventivoBozza },
  { ...verificaModelloPreventivoDef, handler: verificaModelloPreventivo },
  { ...generaPdfModelloBagnoDef, handler: generaPdfModelloBagno },
  { ...inviaPdfModelloBagnoDef, handler: inviaPdfModelloBagno },
  { ...preparaPreventivoModelloDef, handler: preparaPreventivoModello },
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
