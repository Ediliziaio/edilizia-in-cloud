/**
 * Aggiungere voci al computo di tetti: la schermata è quella comune (`ScegliVociListino`), qui ci sono
 * solo le fonti di questo preventivatore.
 */
import { ScegliVociListino, type FontiModulo, type VoceScelta } from "@/components/moduli/ScegliVociListino";
import {
  useListinoCapitoli,
  useListinoVociSearch,
  usePrefillFromArticolo,
  mapUnitaMisura,
} from "@/hooks/useTettiListino";
import type { PickedVoce } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (voci: PickedVoce[]) => void;
  /** Capitolo in cui vanno le voci. */
  targetCapitolo?: string;
  /** Le voci già nel computo, per dirlo sulla riga. */
  vociPresenti?: readonly string[];
}

const FONTI = {
  verticale: "tetti",
  useCapitoli: useListinoCapitoli,
  useVoci: useListinoVociSearch,
  useArticoli: usePrefillFromArticolo,
  mapUnita: mapUnitaMisura,
} as unknown as FontiModulo;

export default function AddVocePicker({ onPick, ...resto }: Props) {
  return <ScegliVociListino {...resto} onPick={(voci: VoceScelta[]) => onPick(voci as unknown as PickedVoce[])} fonti={FONTI} />;
}
