/**
 * Aggiungere voci al computo di bagni: la schermata è quella comune (`ScegliVociListino`), qui ci sono
 * solo le fonti di questo preventivatore.
 */
import { ScegliVociListino, type FontiModulo, type VoceScelta } from "@/components/moduli/ScegliVociListino";
import {
  useListinoCapitoli,
  useListinoVociSearch,
  usePrefillFromArticolo,
  mapUnitaMisura,
} from "@/hooks/useBagniListino";
import { useComputoReview } from "./ComputoReviewContext";
import { nativeBagniUnit } from "@/lib/preventivi/quoteBagniBridge";
import { toast } from "sonner";
import type { PickedVoce } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `false`: le voci non vanno bene, il popup resta aperto. */
  onPick: (voci: PickedVoce[]) => void | false;
  /** Capitolo in cui vanno le voci. */
  targetCapitolo?: string;
  /** Le voci già nel computo, per dirlo sulla riga. */
  vociPresenti?: readonly string[];
}

const FONTI = {
  verticale: "bagno",
  useCapitoli: useListinoCapitoli,
  useVoci: useListinoVociSearch,
  useArticoli: usePrefillFromArticolo,
  mapUnita: mapUnitaMisura,
} as unknown as FontiModulo;

export default function AddVocePicker({ onPick, ...resto }: Props) {
  const review = useComputoReview();
  const scegli = (scelte: VoceScelta[]) => {
    const voci = scelte as unknown as (PickedVoce & { sourceUnit?: string | null })[];
    if (review) {
      const senzaUnita = voci.find((v) => v.sourceUnit !== undefined && !nativeBagniUnit(v.sourceUnit ?? ""));
      if (senzaUnita) { toast.error("Unità non supportata dal computo Bagni: scegli il riferimento in chat senza convertirla."); return false; }
    }
    return onPick(voci.map((v) => (review && v.sourceUnit !== undefined ? { ...v, unita_misura: nativeBagniUnit(v.sourceUnit ?? "")! } : v)));
  };
  return <ScegliVociListino {...resto} onPick={scegli} fonti={FONTI} />;
}
