// src/components/orders/generali/PerLavorare.tsx
// «Per lavorare ti manca…»: le cose senza le quali una parte del flusso si ferma (operai o
// ditte per i rapportini, clienti per prenotare le unità, dati per fatturare). Compare solo se
// manca qualcosa; si può nascondere (per chi guarda, su questo dispositivo).
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrerequisitiGenerale } from "@/hooks/useCommesseGenerali";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { mancanzeOperazione } from "@/lib/orders/generali/prerequisiti";

const chiave = (id: string, cosa: string) => `generale-per-lavorare-nascosta:${id}:${cosa}`;
const leggiNascosta = (k: string) => {
  try { return localStorage.getItem(k) === "1"; } catch { return false; }
};

export function PerLavorare({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const g = riepilogo.generale;
  const { data } = usePrerequisitiGenerale(g.id);
  const mancanze = mancanzeOperazione(data ?? null, g.modello);
  // Nascosta per quell'elenco: se manca qualcos'altro, ricompare.
  const k = chiave(g.id, mancanze.map((m) => m.id).join(","));
  const [nascosta, setNascosta] = useState<string | null>(null);
  if (!mancanze.length || nascosta === k || leggiNascosta(k)) return null;
  const nascondi = () => {
    try { localStorage.setItem(k, "1"); } catch { /* resta nascosta fino al prossimo caricamento */ }
    setNascosta(k);
  };
  return (
    <section
      aria-labelledby="per-lavorare-titolo"
      className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 py-2 pl-3 pr-10 dark:border-amber-500/30 dark:bg-amber-500/5"
    >
      <h2 id="per-lavorare-titolo" className="w-full text-sm font-semibold sm:w-auto">
        Per lavorare ti mancano
      </h2>
      <ul className="flex flex-wrap items-center gap-1.5">
        {mancanze.map((m) => (
          <li key={m.id}>
            <Button asChild size="sm" variant="outline" className="h-7 bg-background px-2 text-xs" title={m.perche}>
              <Link to={m.percorso}>
                {m.cosa}
                <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <p className="w-full text-xs text-muted-foreground lg:w-auto lg:flex-1">{mancanze.map((m) => m.perche).join(" ")}</p>
      <Button variant="ghost" size="icon" className="absolute right-1.5 top-1.5 h-7 w-7" onClick={nascondi} aria-label="Nascondi «Per lavorare»">
        <X className="h-3.5 w-3.5" />
      </Button>
    </section>
  );
}
