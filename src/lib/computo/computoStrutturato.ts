/** Formato comune del computo (PDF PriMus, XPWE) e controllo dei totali: condiviso con la edge function. */
export {
  arrotonda, computoComeEstrazione, controllaTotali, eSicurezza, estraiFormule, numeroComputo, valutaFormula,
  type ComputoLivello, type ComputoMisura, type ComputoRigaRiepilogo, type ComputoStrutturato, type ComputoVoceStrutturata,
  type ControlloCapitolo, type ControlloTotali, type ControlloVoce,
} from "../../../supabase/functions/_shared/computoStrutturato";
