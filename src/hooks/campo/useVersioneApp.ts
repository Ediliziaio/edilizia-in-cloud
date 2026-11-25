/**
 * Chiede al sito qual è la versione minima buona e la confronta con quella di questo
 * bundle. Il perché, e perché la soglia si alza a mano, stanno in lib/campo/versioneApp.
 */
import { useQuery } from "@tanstack/react-query";
import { appDaAggiornare, BUILD_APP, minimaDa, urlVersioneMinima } from "@/lib/campo/versioneApp";
import { isNative } from "@/lib/mobile";

/** Mezz'ora: l'avviso non deve essere immediato, deve solo arrivare nella giornata. */
const OGNI = 30 * 60 * 1000;

export interface StatoVersioneApp {
  /** Questa app è più vecchia della soglia pubblicata. */
  daAggiornare: boolean;
  /** Data del commit di questo bundle, per il messaggio e per i registri. */
  build: string;
}

export function useVersioneApp(): StatoVersioneApp {
  const { data: minima } = useQuery({
    queryKey: ["versione-minima-app"],
    queryFn: async () => {
      // Mai dalla cache: con la risposta salvata l'avviso non arriverebbe proprio ai
      // telefoni che ne hanno bisogno. Il service worker non intercetta questo indirizzo
      // (le sue regole coprono /campo e /assets-*), ma `no-store` lo mette nero su bianco.
      const risposta = await fetch(`${urlVersioneMinima(isNative)}?t=${Date.now()}`, { cache: "no-store" });
      if (!risposta.ok) return null;
      return minimaDa(await risposta.json());
    },
    // Senza rete non si sa niente, e non sapere non è un motivo per avvisare.
    retry: false,
    staleTime: OGNI,
    refetchInterval: OGNI,
    refetchOnWindowFocus: false,
    // In sviluppo il bundle è sempre «di oggi»: niente chiamata e niente avviso.
    enabled: import.meta.env.PROD && BUILD_APP !== "",
  });

  return { daAggiornare: appDaAggiornare(BUILD_APP, minima), build: BUILD_APP };
}
