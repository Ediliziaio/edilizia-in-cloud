/**
 * Dalla commessa alla fattura: ufficio destinatario e riferimenti PA (lotto 4, 15/11/2026).
 *
 * Una regola sola per «Crea fattura» dalla commessa e per l'editor del modulo Fatturazione
 * quando si collega una commessa. Deterministica, niente AI:
 * - riferimenti: le righe di order_riferimenti_pa; se non ce ne sono, CIG/CUP del contratto
 *   della commessa generale e del computo; se non ci sono nemmeno quelli, CIG/CUP
 *   dell'anagrafica del cliente (proponiDallaCommessa);
 * - ufficio (solo PA): quello scelto a mano sulla fattura; se no quello indicato sulla commessa,
 *   se è un ufficio attivo di questo ente; se no il predefinito dell'ente; se no il vecchio
 *   codice dell'anagrafica (codice_sdi di 6 caratteri). Il suo codice diventa CodiceDestinatario.
 * Niente di quello che si sceglie qui torna sulla commessa o sull'anagrafica.
 */
import type { ClienteSnapshot, UfficioPaFattura } from "@/types/fatturazione";
import {
  codice, codiceUfficioValido, colonneCompatibili, proponiDallaCommessa, ufficioDallaCommessa,
  type FonteVecchia, type RiferimentoPaFattura, type RigaRiferimentoCommessa,
} from "../../../supabase/functions/_shared/riferimentiPaFattura";

export interface UfficioDisponibile {
  id: string;
  anagrafica_id: string;
  codice_univoco_ufficio: string;
  descrizione: string | null;
  predefinito: boolean;
  attivo: boolean;
}

export interface InputFatturaPa {
  commessa: { id: string; codice?: string | null };
  anagrafica: { id?: string | null; cig?: string | null; cup?: string | null; codice_sdi?: string | null } | null;
  tipoCliente: ClienteSnapshot["tipo_cliente"];
  righeCommessa: RigaRiferimentoCommessa[];
  fonti?: FonteVecchia[];
  /** Uffici dell'ente (anagrafica_uffici_pa del cliente). */
  uffici?: UfficioDisponibile[];
  /** Ufficio scelto a mano sulla fattura (id), se c'è. */
  ufficioScelto?: string | null;
}

export interface DatiPaFattura {
  riferimenti_pa: RiferimentoPaFattura[];
  ufficio: UfficioPaFattura | null;
  ufficio_pa_id: string | null;
  /** Colonne vecchie allineate (cig, cup, codice_commessa_convenzione). */
  compatibili: ReturnType<typeof colonneCompatibili>;
  /** Cose da dire a chi crea la fattura (ufficio della commessa non valido, ecc.). */
  avvisi: string[];
}

const comeUfficio = (u: UfficioDisponibile, origine: UfficioPaFattura["origine"]): UfficioPaFattura => ({
  id: u.id, codice: codice(u.codice_univoco_ufficio), descrizione: u.descrizione, anagrafica_id: u.anagrafica_id, origine,
});

export function scegliUfficio(input: Pick<InputFatturaPa, "anagrafica" | "righeCommessa" | "uffici" | "ufficioScelto" | "tipoCliente">): { ufficio: UfficioPaFattura | null; avvisi: string[] } {
  const avvisi: string[] = [];
  if (input.tipoCliente !== "PA") return { ufficio: null, avvisi };
  const uffici = input.uffici ?? [];
  const attivi = uffici.filter((u) => u.attivo);

  if (input.ufficioScelto) {
    const u = uffici.find((x) => x.id === input.ufficioScelto);
    if (u) return { ufficio: comeUfficio(u, "manuale"), avvisi };
    avvisi.push("L'ufficio scelto non è tra quelli di questo ente: ripropongo quello della commessa o il predefinito.");
  }

  const dallaCommessa = ufficioDallaCommessa(input.righeCommessa);
  if (dallaCommessa) {
    const u = dallaCommessa.id
      ? uffici.find((x) => x.id === dallaCommessa.id)
      : attivi.find((x) => codice(x.codice_univoco_ufficio) === dallaCommessa.codice);
    if (u && u.attivo) return { ufficio: comeUfficio(u, "commessa"), avvisi };
    if (u && !u.attivo) avvisi.push(`L'ufficio indicato sulla commessa («${u.descrizione || u.codice_univoco_ufficio}») è disattivato nella scheda dell'ente: uso il predefinito. Controlla quale ufficio deve ricevere la fattura.`);
    else if (dallaCommessa.id) avvisi.push("L'ufficio indicato sulla commessa non è un ufficio di questo cliente: uso il predefinito dell'ente. Correggi la commessa se il cliente è cambiato.");
    else if (dallaCommessa.codice) {
      // Codice scritto a mano sulla commessa, senza ufficio in anagrafica: vale quello.
      return { ufficio: { id: null, codice: dallaCommessa.codice, descrizione: null, anagrafica_id: input.anagrafica?.id ?? null, origine: "commessa" }, avvisi };
    }
  }

  const predefinito = attivi.find((u) => u.predefinito) ?? (attivi.length === 1 ? attivi[0] : undefined);
  if (predefinito) return { ufficio: comeUfficio(predefinito, "anagrafica"), avvisi };
  const vecchio = codice(input.anagrafica?.codice_sdi);
  if (codiceUfficioValido(vecchio)) {
    return { ufficio: { id: null, codice: vecchio, descrizione: null, anagrafica_id: input.anagrafica?.id ?? null, origine: "anagrafica" }, avvisi };
  }
  if (attivi.length > 1) avvisi.push("L'ente ha più uffici e nessuno è predefinito: scegli quale riceve la fattura.");
  return { ufficio: null, avvisi };
}

export function datiPaFattura(input: InputFatturaPa): DatiPaFattura {
  const riferimenti_pa = proponiDallaCommessa(input.commessa, input.righeCommessa, input.fonti ?? [], input.anagrafica);
  const { ufficio, avvisi } = scegliUfficio(input);
  return {
    riferimenti_pa,
    ufficio,
    ufficio_pa_id: ufficio?.id ?? null,
    compatibili: colonneCompatibili(riferimenti_pa),
    avvisi,
  };
}

/** Il cliente sulla fattura con l'ufficio scelto: per una PA il codice dell'ufficio è il CodiceDestinatario. */
export function snapshotConUfficio(snap: ClienteSnapshot, ufficio: UfficioPaFattura | null): ClienteSnapshot {
  if (snap.tipo_cliente !== "PA") {
    const { ufficio_pa: _tolto, ...resto } = snap;
    return resto;
  }
  if (!ufficio) {
    const { ufficio_pa: _tolto, ...resto } = snap;
    return resto;
  }
  return { ...snap, codice_sdi: ufficio.codice, ufficio_pa: ufficio };
}
