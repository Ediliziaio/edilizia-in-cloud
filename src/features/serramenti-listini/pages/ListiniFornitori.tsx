/**
 * Pagina: Listini Serramenti → Fornitori + Linee Prodotto
 *
 * Gated dalla feature `listini_serramenti_avanzati`. Se OFF mostra un
 * messaggio informativo (niente crash, niente 404) per mantenere simmetria
 * con le altre feature opt-in.
 *
 * Layout: header + FornitoriManager (Fornitori → Linee prodotto).
 *
 * ⚠ Nessuna integrazione con il wizard preventivo in STEP 2: solo data
 *   management. Il wiring arriverà in STEP 6.
 */

import { Info, Loader2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { FornitoriManager } from "../components/FornitoriManager";
import { useListiniFeature } from "../hooks/useListiniFeature";

export default function ListiniFornitoriPage() {
  const { enabled, isLoading } = useListiniFeature();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-3xl">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Funzionalità non disponibile</AlertTitle>
          <AlertDescription>
            I listini serramenti avanzati sono una feature opt-in dedicata alle
            aziende serramentiste. Contatta il supporto per attivarla.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Listini Serramenti — Fornitori
        </h1>
        <p className="text-sm text-muted-foreground">
          Configura i tuoi fornitori di infissi, lo sconto di default applicato
          ai listini e le linee prodotto (profili) di ciascun fornitore.
        </p>
      </header>

      <FornitoriManager />
    </div>
  );
}
