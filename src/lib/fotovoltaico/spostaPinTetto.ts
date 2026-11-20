import { leggiDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";

/** Il pin è l’origine delle falde: cambia la posizione, conservando misure e posa. */
export function spostaPinTettoFv(
  data: WizardData,
  riferimento: WizardData["riferimento_tetto"],
): WizardData {
  const base = {
    ...data,
    riferimento_tetto: riferimento,
    ore_sole_annue: null,
    qualita_dati_tetto: null,
    imagery_date: null,
  };
  const piano = leggiDisegnoCommerciale(data.layout_overlay);
  if (riferimento && piano?.mappa) {
    const mappa = {
      ...piano.mappa,
      origine: riferimento.posizione,
      ricerca: riferimento.ricerca,
    };
    // La resa solare dipende dalla posizione e va letta nuovamente.
    delete mappa.solare;
    return { ...base, layout_overlay: { ...piano, mappa } };
  }
  return {
    ...base,
    layout_overlay: null,
    layout_tetto: null,
    numero_pannelli_scelti: 0,
    potenza_kwp: 0,
    superficie_tetto_disponibile_mq: null,
    numero_pannelli_max: null,
    potenza_max_kwp: null,
  };
}
