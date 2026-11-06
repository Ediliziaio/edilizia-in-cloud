/**
 * Cosa vede davvero una persona (03/11/2026).
 *
 * Alcune aree si aprono da più permessi: spegnere «Controllo di Gestione» non basta se resta
 * acceso «Costi». Qui ci sono gli stessi elenchi delle regole del database (puo_vedere_finanza,
 * _cg_assert_lettura, permessi_area): accessiEffettivi.test.ts fallisce se divergono.
 */
export type ChiavePermesso = string;

export interface AreaSensibile {
  id: string;
  etichetta: string;
  descrizione: string;
  /** Basta uno di questi per aprire l'area. */
  aperturaDa: readonly ChiavePermesso[];
}

export const AREE_SENSIBILI: readonly AreaSensibile[] = [
  {
    id: "finanza",
    etichetta: "Banca, cassa e finanziamenti",
    descrizione: "Riconciliazioni, movimenti di cassa, prestiti, budget, patrimonio e cespiti.",
    aperturaDa: [
      "can_view_controllo_gestione", "can_view_cruscotto", "can_view_billing", "can_view_costs",
      "can_view_financial_reports", "can_view_prima_nota", "can_view_tesoreria",
      "can_view_scadenzario", "can_manage_payments", "can_view_forecast",
    ],
  },
  {
    id: "controllo_gestione",
    etichetta: "Margini e rating",
    descrizione: "Controllo di gestione: margini delle commesse, conto economico e rating.",
    aperturaDa: [
      "can_view_controllo_gestione", "can_view_cruscotto", "can_view_billing", "can_view_costs",
      "can_view_financial_reports",
    ],
  },
  {
    id: "acquisti",
    etichetta: "Ordini ai fornitori",
    descrizione: "Ordini d'acquisto con prezzi e fornitori.",
    aperturaDa: [
      "can_view_orders", "can_edit_orders", "can_view_warehouse", "can_edit_warehouse",
      "can_manage_suppliers", "can_manage_purchasing", "can_validate_bom", "can_view_costs",
      "can_view_billing", "can_view_financial_reports", "can_view_scadenzario", "can_view_tickets",
      "can_view_dashboard", "can_view_cruscotto", "can_view_settings_suppliers", "can_view_forecast",
      "can_view_tesoreria", "can_edit_tickets", "can_view_calendar", "can_view_subappaltatori",
    ],
  },
  {
    id: "whatsapp",
    etichetta: "Messaggi WhatsApp",
    descrizione: "Le conversazioni WhatsApp con clienti e contatti.",
    aperturaDa: [
      "can_view_marketing_whatsapp", "can_view_marketing", "can_view_marketing_contacts",
      "can_view_marketing_opportunities", "can_view_marketing_activities", "can_view_customers",
      "can_view_settings_integrations", "can_view_tickets", "can_view_manutenzione",
      "can_view_subappaltatori",
    ],
  },
  {
    id: "registri",
    etichetta: "Registro delle attività",
    descrizione: "Chi ha fatto cosa nell'azienda.",
    aperturaDa: ["can_view_settings_security"],
  },
];

export interface AccessoEffettivo {
  area: AreaSensibile;
  aperta: boolean;
  /** I permessi accesi che la aprono. */
  apertaDa: ChiavePermesso[];
}

/** Al Call Center questi due permessi non aprono gli ordini ai fornitori: sono di altre pagine. */
const NON_APRONO_ORDINI_AL_CALL_CENTER: readonly ChiavePermesso[] = ["can_view_dashboard", "can_view_calendar"];

export function accessiEffettivi(permessi: Record<string, unknown>, ruolo?: string): AccessoEffettivo[] {
  return AREE_SENSIBILI.map((area) => {
    const apertaDa = area.aperturaDa.filter((chiave) =>
      permessi[chiave] === true
      && !(area.id === "acquisti" && ruolo === "call_center" && NON_APRONO_ORDINI_AL_CALL_CENTER.includes(chiave)));
    return { area, aperta: apertaDa.length > 0, apertaDa };
  });
}

export interface VoceArea {
  label: string;
  viewKey: string;
  editKey?: string;
}

export interface AreaRiepilogo {
  id: string;
  label: string;
  modules: readonly VoceArea[];
}

/** Le voci accese di ogni gruppo; i gruppi vuoti non si mostrano. */
export function vociAccesePerArea(
  aree: readonly AreaRiepilogo[],
  permessi: Record<string, unknown>,
): { id: string; label: string; voci: string[] }[] {
  return aree
    .map((area) => ({
      id: area.id,
      label: area.label,
      voci: area.modules.filter((m) => permessi[m.viewKey] === true).map((m) => m.label),
    }))
    .filter((area) => area.voci.length > 0);
}

/** Nome leggibile di un permesso: l'etichetta dell'editor, anche per il «modifica» di una voce. */
export function nomePermesso(chiave: string, aree: readonly AreaRiepilogo[]): string {
  const vista = chiave.replace(/^can_edit_/, "can_view_");
  for (const area of aree) {
    const voce = area.modules.find((m) => m.viewKey === chiave || m.editKey === chiave || m.viewKey === vista);
    if (voce) return voce.label;
  }
  // Permessi storici che possono aprire le aree anche quando l'editor
  // espone soltanto i moduli granulari: non mostrare i nomi inglesi.
  const nomiStorici: Record<string, string> = {
    can_view_orders: "Ordini e Commesse",
    can_view_warehouse: "Magazzino",
    can_view_tickets: "Ticket Assistenza",
  };
  return nomiStorici[vista] ?? chiave.replace(/^can_(view_|edit_|manage_)?/, "").replace(/_/g, " ");
}

/** I nomi di chi apre un'area, senza doppioni: «vede» e «modifica» della stessa voce sono uno. */
export function nomiPermessi(chiavi: readonly string[], aree: readonly AreaRiepilogo[]): string[] {
  return [...new Set(chiavi.map((chiave) => nomePermesso(chiave, aree)))];
}
