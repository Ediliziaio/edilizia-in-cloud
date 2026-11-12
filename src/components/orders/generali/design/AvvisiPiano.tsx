import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { euro } from "../piano/formato";

export function AvvisiPiano({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const n = useGeneralePianoNumeri(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  if (!riepilogo.permessi.margini || n.isLoading || n.isError) return null;
  const avvisi: string[] = [];
  if (n.vuoto)
    avvisi.push("Imposta il budget per confrontare costi e previsione finale.");
  else if (n.piano?.budgetCompleto === false)
    avvisi.push(
      "Il budget ha stime da completare: il margine finale è sospeso.",
    );
  if (n.piano?.calendarioCompleto === false)
    avvisi.push(
      "Completa stime e calendario del piano per conoscere il fabbisogno di capitale.",
    );
  const scarto = n.piano?.confronto.totali.margine.scostamento;
  if (
    n.piano?.budgetCompleto !== false &&
    scarto !== undefined &&
    scarto < -0.5
  )
    avvisi.push(`Il margine stimato è sotto il previsto di ${euro(-scarto)}.`);
  if (!avvisi.length) return null;
  const apri = () => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "piano");
    p.set("vista-piano", "voci");
    p.delete("categorie-costo");
    setParametri(p);
  };
  return (
    <div className="generale-plan-attention">
      <AlertTriangle aria-hidden="true" />
      <div>
        {avvisi.slice(0, 3).map((a) => (
          <p key={a}>{a}</p>
        ))}
      </div>
      {!telefono && (
        <button type="button" onClick={apri}>
          Controlla il piano <ArrowUpRight aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
