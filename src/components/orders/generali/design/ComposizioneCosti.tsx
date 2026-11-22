import { useState } from "react";
import { ArrowUpRight, ChartPie } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { formattaEuro } from "@/lib/orders/commesseGenerali";
import { composizioneCosti } from "@/lib/orders/generali/graficiPanoramica";
import { Ciambella } from "./Ciambella";

export function ComposizioneCosti({
  riepilogo,
}: {
  riepilogo: RiepilogoGenerale;
}) {
  const n = useGeneralePianoNumeri(riepilogo);
  // Lo speso nel tempo sta nel grafico «Speso contro piano»: qui, se c'è un piano, si parte dal
  // budget diviso per gruppo (dove andranno i soldi), non dallo stesso totale speso.
  const [modalita, setModalita] = useState<"budget" | "reale" | "stima" | null>(null);
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  if (!riepilogo.permessi.costi || !riepilogo.permessi.margini) return null;
  const previsioneDisponibile = !!n.piano && n.piano.budgetCompleto !== false;
  const conBudget = !!n.piano?.confronto.costi.some((r) => (r.previsto ?? 0) > 0);
  const scelta = modalita ?? (conBudget ? "budget" : "reale");
  const colonna =
    scelta === "stima" && previsioneDisponibile ? "stima" : scelta === "budget" && conBudget ? "previsto" : "reale";
  const righe =
    n.piano?.confronto.costi.map((r) => ({
      categoria: r.categoria,
      valore: r[colonna],
    })) ??
    (n.reale?.permessi.costi
      ? n.reale.righe
          .filter((r) => r.tipo === "costo")
          .map((r) => ({ categoria: r.chiave, valore: r.importo }))
      : []);
  const c = composizioneCosti(righe);
  const apri = (categorie?: string[]) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "piano");
    p.set("vista-piano", "voci");
    p.delete("categorie-costo");
    if (categorie?.length) p.set("categorie-costo", categorie.join(","));
    if (n.inVista?.id) p.set("versione-piano", n.inVista.id);
    if (colonna === "previsto") p.delete("base-costi");
    else p.set("base-costi", colonna);
    setParametri(p);
  };
  return (
    <section
      aria-labelledby="composizione-costi-titolo"
      className="generale-panel generale-costs"
    >
      <header className="generale-panel-heading">
        <div className="generale-panel-title">
          <span className="generale-section-icon">
            <ChartPie aria-hidden="true" />
          </span>
          <div>
            <h2 id="composizione-costi-titolo">Composizione dei costi</h2>
            <p>Intera operazione · importi netti</p>
          </div>
        </div>
        {(conBudget || previsioneDisponibile || c.categorie.length > 0) && (
          <div
            className="generale-segmented"
            role="group"
            aria-label="Base della composizione costi"
          >
            {conBudget && (
              <button
                type="button"
                aria-pressed={colonna === "previsto"}
                onClick={() => setModalita("budget")}
              >
                Budget
              </button>
            )}
            <button
              type="button"
              aria-pressed={colonna === "reale"}
              onClick={() => setModalita("reale")}
            >
              Registrati
            </button>
            <button
              type="button"
              aria-pressed={colonna === "stima"}
              disabled={!previsioneDisponibile}
              title={
                !previsioneDisponibile
                  ? "Completa il budget per vedere la stima finale"
                  : undefined
              }
              onClick={() => setModalita("stima")}
            >
              Stima finale
            </button>
          </div>
        )}
      </header>
      {n.isLoading ? (
        <div role="status" className="generale-chart-empty generale-chart-empty--compatto">
          Caricamento dei costi…
        </div>
      ) : n.isError ? (
        <div role="status" className="generale-chart-empty generale-chart-empty--compatto">
          <p>Costi momentaneamente non disponibili.</p>
          <button type="button" onClick={() => n.refetch()}>
            Riprova
          </button>
        </div>
      ) : c.categorie.length === 0 ? (
        <div className="generale-chart-empty generale-chart-empty--compatto">
          {colonna === "previsto" ? "Nessun costo a budget" : colonna === "stima" ? "Nessun costo stimato" : "Nessun costo registrato"}
        </div>
      ) : (
        <div className="generale-chart-body">
          {c.conRettifiche ? (
            <div className="generale-signed-total">
              <strong>{formattaEuro(c.totale)}</strong>
              <span>Totale netto con rettifiche</span>
            </div>
          ) : (
            <Ciambella
              dati={c.categorie}
              onSeleziona={
                telefono
                  ? undefined
                  : (id) =>
                      apri(c.categorie.find((r) => r.id === id)?.categorie)
              }
              valore={formattaEuro(c.totale)}
              etichetta={
                colonna === "reale" ? "costi registrati" : colonna === "previsto" ? "budget del piano" : "stima finale"
              }
            />
          )}
          <dl
            className="generale-chart-legend"
            aria-label={`Costi ${colonna === "reale" ? "registrati" : colonna === "previsto" ? "a budget" : "stimati"} per categoria`}
          >
            {c.categorie.map((r) => (
              <div key={r.id} className="generale-legend-row">
                <dt>
                  <span
                    className="generale-legend-dot"
                    style={{ backgroundColor: r.colore }}
                    aria-hidden="true"
                  />
                  {telefono ? (
                    r.nome
                  ) : (
                    <button
                      type="button"
                      className="generale-legend-link"
                      aria-label={`Filtra costi: ${r.nome}`}
                      onClick={() => apri(r.categorie)}
                    >
                      {r.nome}
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  )}
                </dt>
                <dd>
                  <strong>{formattaEuro(r.valore)}</strong>
                  {!c.conRettifiche && (
                    <span>
                      {((r.valore / c.totale) * 100).toLocaleString("it-IT", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <footer className="generale-panel-footer">
        <span>
          {c.conRettifiche
            ? "Le rettifiche sono incluse con il loro segno."
            : colonna === "previsto"
              ? "Il budget del piano, gruppo per gruppo: dove andranno i soldi."
              : colonna === "reale"
              ? "Costi sulla generale e sulle commesse collegate."
              : "Reale registrato + costi ancora da sostenere."}
        </span>
        {!telefono && (
          <button type="button" onClick={() => apri()}>
            Apri il piano <ArrowUpRight aria-hidden="true" />
          </button>
        )}
      </footer>
    </section>
  );
}
