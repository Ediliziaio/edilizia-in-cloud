import { useState } from "react";
import { Landmark } from "lucide-react";
import { Ciambella } from "../design/Ciambella";
import { euro } from "../piano/formato";
import type {
  ContiInvestitori,
  GruppoFonte,
} from "@/lib/orders/generali/investitoriConti";

const COLORI: Record<GruppoFonte, string> = {
  propri: "rgb(var(--brand-navy-deep, 23 59 103))",
  investitori: "#0284c7",
  debito: "rgb(var(--brand-accent, 249 115 22))",
};

export function GraficoFonti({
  conti,
  onFiltra,
}: {
  conti: ContiInvestitori;
  onFiltra?: (gruppo: GruppoFonte) => void;
}) {
  const [base, setBase] = useState<"impegno" | "dentro">("impegno");
  const dati = conti.copertura.map((g) => ({
    id: g.gruppo,
    nome: g.nome,
    valore: g[base],
    colore: COLORI[g.gruppo],
  }));
  const totale = Math.round(dati.reduce((s, r) => s + r.valore, 0) * 100) / 100;
  const negativi = dati.some((r) => r.valore < 0);
  return (
    <section className="generale-panel" aria-label="Composizione delle fonti">
      <header className="generale-panel-heading">
        <div className="generale-panel-title">
          <span className="generale-section-icon">
            <Landmark aria-hidden="true" />
          </span>
          <div>
            <h3>Composizione delle fonti</h3>
            <p>Impegni e capitale effettivo su basi distinte</p>
          </div>
        </div>
        <div
          className="generale-segmented"
          role="group"
          aria-label="Base della composizione fonti"
        >
          <button
            type="button"
            aria-pressed={base === "impegno"}
            onClick={() => setBase("impegno")}
          >
            Impegni
          </button>
          <button
            type="button"
            aria-pressed={base === "dentro"}
            onClick={() => setBase("dentro")}
          >
            Capitale dentro
          </button>
        </div>
      </header>
      <div className="generale-chart-body">
        {negativi ? (
          <div className="generale-signed-total">
            <strong>{euro(totale)}</strong>
            <span>Saldo con rettifiche</span>
          </div>
        ) : (
          <Ciambella
            dati={dati}
            valore={euro(totale)}
            etichetta={
              base === "impegno"
                ? "capitale impegnato"
                : "capitale ancora dentro"
            }
            onSeleziona={
              onFiltra ? (id) => onFiltra(id as GruppoFonte) : undefined
            }
          />
        )}
        <dl className="generale-chart-legend">
          {dati.map((g) => (
            <div key={g.id} className="generale-legend-row">
              <dt>
                <span
                  className="generale-legend-dot"
                  style={{ backgroundColor: g.colore }}
                  aria-hidden="true"
                />
                {onFiltra ? (
                  <button
                    className="generale-legend-link"
                    type="button"
                    aria-label={`Filtra fonti: ${g.nome}`}
                    onClick={() => onFiltra(g.id)}
                  >
                    {g.nome}
                  </button>
                ) : (
                  g.nome
                )}
              </dt>
              <dd>
                <strong>{euro(g.valore)}</strong>
                {totale > 0 && !negativi && (
                  <span>{Math.round((g.valore / totale) * 100)}%</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <footer className="generale-panel-footer">
        {base === "impegno"
          ? "Impegni delle fonti, inclusi eventuali versamenti superiori all'impegno."
          : "Versamenti effettivi meno rimborsi e accolli. I movimenti previsti restano esclusi."}
      </footer>
    </section>
  );
}
