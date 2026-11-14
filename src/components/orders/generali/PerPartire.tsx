// src/components/orders/generali/PerPartire.tsx
// «Per partire»: i pochi passi che rendono utile una generale appena creata. Compare finché
// resta qualcosa da fare; si può nascondere (vale per chi guarda, su questo dispositivo).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { useFontiGenerale } from "@/hooks/useGeneraleInvestitori";
import { useVersioniPiano, useVociPiano } from "@/hooks/useGeneralePiano";
import { DEFINIZIONI_MODELLI, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { valoreContratto } from "@/lib/orders/generali/contratto";
import { passiPerPartire, perPartireServe, type IdPasso } from "@/lib/orders/generali/perPartire";

const chiaveNascosta = (id: string) => `generale-per-partire-nascosta:${id}`;
const leggiNascosta = (id: string) => {
  try { return localStorage.getItem(chiaveNascosta(id)) === "1"; } catch { return false; }
};

export function PerPartire({ riepilogo, nuovaFiglia }: { riepilogo: RiepilogoGenerale; nuovaFiglia: () => void }) {
  const g = riepilogo.generale;
  const def = DEFINIZIONI_MODELLI[g.modello];
  const appalto = g.modello === "appalto";
  const { importi, margini } = riepilogo.permessi;
  const contratto = useDatiContratto(g.id, appalto && importi);
  const versioni = useVersioniPiano(g.id, margini);
  const voci = useVociPiano(versioni.data?.[0]?.id ?? null);
  const fonti = useFontiGenerale(g.id, !appalto && margini);
  const [parametri, setParametri] = useSearchParams();
  const [nascosta, setNascosta] = useState(() => leggiNascosta(g.id));

  // Finché una lettura è in corso non si mostra niente: la lista non deve lampeggiare passi già fatti.
  if (nascosta || contratto.isLoading || versioni.isLoading || voci.isLoading || fonti.isLoading) return null;

  // Con un piano, sviluppo e compravendita hanno il percorso «Completa l'operazione»
  // (AvvisiPiano), che comprende anche le fonti: qui si ripeterebbero gli stessi passi.
  if (!appalto && margini && (versioni.data?.length ?? 0) > 0) return null;

  const passi = passiPerPartire(g.modello, {
    figlie: riepilogo.figlie.length,
    contrattoCompilato: contratto.data ? valoreContratto(contratto.data.contratto, contratto.data.atti) !== null : null,
    vociPianoConImporto: !versioni.data ? null : versioni.data.length === 0 ? 0 : voci.data ? voci.data.filter((v) => v.importo > 0).length : null,
    fonti: fonti.data ? fonti.data.length : null,
  });
  if (!perPartireServe(passi)) return null;

  const apriScheda = (scheda: string) => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", scheda);
    setParametri(dopo, { replace: true });
  };
  const testi: Record<IdPasso, { titolo: string; azione: () => void }> = {
    contratto: { titolo: "Completa i dati del contratto", azione: () => apriScheda("contratto") },
    figlie: {
      titolo: def.figlia.nuova,
      azione: appalto ? nuovaFiglia : () => apriScheda("unita"),
    },
    piano: { titolo: appalto ? "Scrivi il budget" : "Scrivi il business plan", azione: () => apriScheda("piano") },
    fonti: { titolo: "Indica da dove arrivano i soldi", azione: () => apriScheda("investitori") },
  };
  const nascondi = () => {
    try { localStorage.setItem(chiaveNascosta(g.id), "1"); } catch { /* resta nascosta fino al prossimo caricamento */ }
    setNascosta(true);
  };

  const prossimo = passi.find((p) => !p.fatto)?.id;
  return (
    <section aria-labelledby="per-partire-titolo" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
      <h2 id="per-partire-titolo" className="text-sm font-semibold">
        Per partire <span className="font-normal text-muted-foreground">{passi.filter((p) => p.fatto).length} di {passi.length}</span>
      </h2>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {passi.map((p) => (
          <li key={p.id}>
            {p.fatto ? (
              <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" /> {testi[p.id].titolo}
              </span>
            ) : (
              <Button type="button" size="sm" variant={p.id === prossimo ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={testi[p.id].azione}>
                {testi[p.id].titolo}
                {p.id === prossimo && <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={nascondi} aria-label="Nascondi «Per partire»">
        <X className="h-3.5 w-3.5" />
      </Button>
    </section>
  );
}
