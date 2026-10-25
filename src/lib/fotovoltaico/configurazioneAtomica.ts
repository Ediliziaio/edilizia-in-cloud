import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { configuredQuoteEndpoint } from '@/lib/preventivi/quoteTransportEndpoint';
import {
  righeComponentiFv,
  type ListinoComponentiFv,
} from "./componentiConfigurazione";
import {
  problemiConfigurazioneFv,
  tipoServizioFv,
} from "./configurazioneValidation";

export function fvConfigurationPayload(
  data: WizardData,
  catalogue: ListinoComponentiFv,
  identity: { companyId: string; projectId: string; updatedAt: string },
) {
  const issues = problemiConfigurazioneFv(data, catalogue);
  if (issues.length) throw new Error(issues.join(". "));
  if (
    !identity.companyId ||
    !identity.projectId ||
    !identity.updatedAt ||
    !Number.isFinite(Date.parse(identity.updatedAt))
  )
    throw new Error("Ricarica il progetto prima di salvare.");
  return {
    p_company_id: identity.companyId,
    p_project_id: identity.projectId,
    p_expected_updated_at: identity.updatedAt,
    p_project: {
      numero_pannelli_scelti: data.numero_pannelli_scelti,
      potenza_kwp: data.potenza_kwp,
      con_accumulo: data.con_accumulo,
      capacita_accumulo_kwh: data.capacita_accumulo_kwh,
      con_wallbox: data.con_wallbox,
      con_ottimizzatori: data.con_ottimizzatori,
      kit_bundle_id: data.kit_bundle_id,
      kit_nome: data.kit_nome,
      kit_prezzo: data.kit_prezzo,
      prezzo_vendita_manuale: data.kit_bundle_id
        ? null
        : data.prezzo_vendita_manuale,
      iva_aliquota: data.iva_aliquota,
      layout_overlay: data.layout_overlay,
    },
    p_components: righeComponentiFv(data, catalogue),
    p_labour: data.manodopera_righe.map((r, i) => ({
      tariffa_id: r.tariffa_id,
      descrizione: r.descrizione,
      ore: r.ore,
      tariffa_oraria_netta: r.tariffa_oraria_netta,
      tariffa_oraria_vendita: r.tariffa_oraria_vendita,
      ordinamento: i + 1,
      margine_pct:
        r.tariffa_oraria_vendita > 0
          ? (r.tariffa_oraria_vendita - r.tariffa_oraria_netta) /
            r.tariffa_oraria_vendita
          : 0,
    })),
    p_services: data.servizi_righe.map((r, i) => ({
      tipo: tipoServizioFv(r.tipo),
      descrizione: r.descrizione,
      quantita: r.quantita,
      prezzo_netto: r.prezzo_netto,
      prezzo_vendita: r.prezzo_vendita,
      note_operative: r.note_operative,
      ordinamento: i + 1,
    })),
  };
}
export type FvConfigurationPayload = ReturnType<typeof fvConfigurationPayload>;
export type AtomicRpc = (
  name: string,
  args: FvConfigurationPayload,
) => PromiseLike<{
  data: unknown;
  error: { code?: string; message: string } | null;
}>;
export function isLocalFvBackend(backendUrl: string): boolean {
  try {
    const url = new URL(backendUrl);
    return (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
/** Native atomic RPC only. Never fall back to per-table delete/insert. */
export async function saveLocalFvConfiguration(
  rpc: AtomicRpc,
  payload: FvConfigurationPayload,
  backendUrl: string,
) {
  configuredQuoteEndpoint(backendUrl);
  const { data, error } = await rpc("fv_save_configuration_atomic", payload);
  if (error)
    throw new Error(
      error.code === "40001"
        ? "Il preventivo è cambiato altrove. Ricaricalo prima di applicare le modifiche."
        : error.code === "PGRST202" || error.code === "42883"
          ? "Funzione atomica non installata nel database. Nessuna scrittura parziale eseguita."
          : error.message,
    );
  const result = data as {
    projectId?: string;
    updatedAt?: string;
    replayed?: boolean;
  } | null;
  if (
    !result ||
    result.projectId !== payload.p_project_id ||
    typeof result.updatedAt !== "string" ||
    typeof result.replayed !== "boolean"
  )
    throw new Error(
      "Esito del salvataggio non verificabile. La richiesta non viene ripetuta automaticamente.",
    );
  return result;
}
