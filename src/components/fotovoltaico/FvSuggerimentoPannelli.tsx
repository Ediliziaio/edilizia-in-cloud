import { Button } from "@/components/ui/button";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import type { ArticoloFv } from "@/lib/fotovoltaico/componentiConfigurazione";
import { stimaProduzioneFv } from "@/lib/fotovoltaico/anteprima";
import { leggiDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { leggiPiano } from "../../../supabase/functions/_shared/fvPianoTetto";

const numero = (n: number, decimali = 0) =>
  n.toLocaleString("it-IT", { maximumFractionDigits: decimali, useGrouping: "always" });
const positivo = (n: number) => Number.isFinite(n) && n > 0;

/** Prima indicazione energetica; la posa e gli scenari verificano il tetto e gli orari. */
export function FvSuggerimentoPannelli({
  data,
  pannelli,
  modificabile,
  onApplica,
}: {
  data: WizardData;
  pannelli: ArticoloFv[];
  modificabile: boolean;
  onApplica: (p: Pick<WizardData, "numero_pannelli_scelti" | "potenza_kwp">) => void;
}) {
  const consumo = Number(data.consumo_annuo_kwh);
  const aumento = data.analisi_consumi?.profilo.aumentoConsumiPct ?? 0;
  const fabbisogno = consumo * (1 + aumento / 100);
  const resa = data.tetto_mock ? 0 : stimaProduzioneFv({ ...data, potenza_kwp: 1 });
  const watt = Number(pannelli.find((p) => p.id === data.pannello_id)?.potenza_w);
  const pronto = positivo(consumo) && positivo(fabbisogno) && positivo(resa);
  const potenza = pronto ? fabbisogno / resa : 0;
  const quantita = pronto && positivo(watt)
    ? Math.ceil(potenza * 1000 / watt)
    : null;
  const disegno = leggiDisegnoCommerciale(data.layout_overlay) ?? leggiPiano(data.layout_overlay);
  const fonte = data.fonte_dati_tetto === "pvgis"
    ? "PVGIS"
    : data.fonte_dati_tetto === "solar_api"
    ? "Google Solar API"
    : "stima manuale";

  return (
    <section
      aria-label="Suggerimento automatico pannelli dai consumi"
      className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4"
    >
      <h3 className="font-semibold text-slate-900">Quanti pannelli proporre?</h3>
      {!pronto
        ? (
          <p role="status" className="mt-2 text-sm text-slate-700">
            {!positivo(consumo) || !positivo(fabbisogno)
              ? "Conferma i consumi della bolletta nella fase Consumi: il suggerimento si calcola automaticamente."
              : "Calcola la stima solare nella fase Tetto per ottenere il suggerimento. Puoi usare PVGIS anche senza disegnare le falde."}
          </p>
        )
        : (
          <>
            <p className="mt-2 text-lg text-slate-900">
              <strong>
                {quantita != null
                  ? `${numero(quantita)} pannelli da ${numero(watt)} Wp`
                  : `${numero(potenza, 2)} kWp indicativi`}
              </strong>
              {quantita != null && ` · ${numero(quantita * watt / 1000, 2)} kWp`}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Per produrre in un anno l’equivalente di {numero(fabbisogno)} kWh
              {aumento > 0 && " (compresi i nuovi consumi previsti)"}.
              {" "}Resa da {fonte}: {numero(resa)} kWh per kWp all’anno.
            </p>
            {quantita == null && (
              <p role="status" className="mt-2 text-sm text-slate-700">
                Scegli il modello di pannello dal catalogo per calcolare anche il numero di moduli.
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">
              È una prima indicazione energetica: non significa azzerare la bolletta.
              Spazio sul tetto, ombre, orari dei consumi e accumulo vanno verificati
              nella disposizione e negli scenari.
            </p>
            {data.kit_bundle_id
              ? <p className="mt-2 text-sm text-slate-700">Confronta questa potenza con il kit scelto. Quantità e prezzo del kit restano quelli del catalogo.</p>
              : disegno
              ? <p className="mt-2 text-sm text-slate-700">Usa gli scenari qui sotto per verificare quanti moduli entrano e applicare una disposizione al tetto.</p>
              : quantita != null && quantita <= 2000 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  disabled={!modificabile}
                  onClick={() => onApplica({
                    numero_pannelli_scelti: quantita,
                    potenza_kwp: quantita * watt / 1000,
                  })}
                >
                  Usa {numero(quantita)} pannelli nel preventivo
                </Button>
              )}
          </>
        )}
    </section>
  );
}
