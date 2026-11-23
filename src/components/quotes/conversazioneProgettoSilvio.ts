import { createContext, type Dispatch, type SetStateAction } from "react";
import type { LocalChatMessage } from "@/lib/preventivi/localQuoteMemory";
import type { OrigineComputoPianta } from "@/lib/computo/computoDallaPianta";

export type MessaggioSilvio = LocalChatMessage & { replyKey?: string };
export const riferimentoProgettoSilvio = (origine: OrigineComputoPianta) =>
  JSON.stringify([origine.id, origine.livelloId, origine.propostaId ?? null, origine.versione]);

// L'istanza vive nella finestra del singolo computo, anche quando la chat è nascosta.
export const ConversazioneProgettoSilvio = createContext<{
  messaggi: MessaggioSilvio[];
  setMessaggi: Dispatch<SetStateAction<MessaggioSilvio[]>>;
} | null>(null);
