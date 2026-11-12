import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCircle2,
  Search,
} from "lucide-react";
import type {
  PianoCalcolato,
  RigaReale,
} from "@/lib/orders/generali/pianoConti";
import { formatCurrency } from "@/lib/formatters";
import {
  CATEGORIE_PIANO,
  CHIAVI_REALI,
  type CategoriaPiano,
} from "@/lib/orders/generali/pianoCategorie";
import "./piano-lettura.css";

type Tipo = "costi" | "ricavi" | "margine";

/** Tutte le serie usano la stessa scala, con uno zero esplicito anche per rettifiche e margini negativi. */
function Barra({
  valore,
  valori,
  classe,
}: {
  valore: number;
  valori: number[];
  classe: string;
}) {
  const minimo = Math.min(0, ...valori);
  const massimo = Math.max(0, ...valori);
  const ampiezza = massimo - minimo || 1;
  return (
    <div className="generale-plan-bar" aria-hidden="true">
      <span
        className="generale-plan-zero"
        style={{ left: `${(-minimo / ampiezza) * 100}%` }}
      />
      <span
        className={classe}
        style={{
          left: `${((Math.min(0, valore) - minimo) / ampiezza) * 100}%`,
          width: `${(Math.abs(valore) / ampiezza) * 100}%`,
        }}
      />
    </div>
  );
}

export function ConfrontoPiano({
  piano,
  permessi,
  onApriRighe,
  onCategoria,
}: {
  piano: PianoCalcolato;
  permessi: { costi: boolean; importi: boolean };
  onApriRighe: (titolo: string, righe: RigaReale[]) => void;
  onCategoria: (categoria: string, tipo: "costo" | "ricavo") => void;
}) {
  const [scelta, setScelta] = useState<Tipo>("costi");
  const tipi = [
    ...(permessi.costi ? [{ id: "costi" as const, nome: "Costi" }] : []),
    ...(permessi.importi ? [{ id: "ricavi" as const, nome: "Ricavi" }] : []),
    ...(permessi.costi && permessi.importi
      ? [{ id: "margine" as const, nome: "Margine" }]
      : []),
  ];
  const tipo = tipi.find((t) => t.id === scelta) ?? tipi[0];
  if (!tipo) return null;
  const completo = piano.budgetCompleto !== false;
  const t = piano.confronto.totali[tipo.id];
  const valori = [t.reale, ...(completo ? [t.previsto, t.stima] : [])];
  const righe =
    tipo.id === "costi"
      ? piano.confronto.costi
      : tipo.id === "ricavi"
        ? piano.confronto.ricavi
        : [];
  const scostamenti = completo
    ? [
        ...(permessi.costi ? piano.confronto.costi : []),
        ...(permessi.importi ? piano.confronto.ricavi : []),
      ]
        .filter(
          (r) => (r.tipo === "costo" ? r.scostamento : -r.scostamento) > 0.005,
        )
        .sort((a, b) => Math.abs(b.scostamento) - Math.abs(a.scostamento))
    : [];
  const sfavorevole =
    tipo.id === "costi" ? t.scostamento > 0.005 : t.scostamento < -0.005;
  const differenza =
    Math.abs(t.scostamento) < 0.005
      ? "In linea con il budget"
      : `${formatCurrency(Math.abs(t.scostamento))} ${t.scostamento > 0 ? "sopra" : "sotto"} il budget`;

  return (
    <div className="generale-plan-reading">
      <section
        className="generale-panel"
        aria-labelledby="confronto-piano-titolo"
      >
        <header className="generale-panel-heading">
          <div className="generale-panel-title">
            <span className="generale-section-icon">
              <ChartNoAxesCombined aria-hidden="true" />
            </span>
            <div>
              <h2 id="confronto-piano-titolo">Dal budget alla stima finale</h2>
              <p>
                Intera operazione · stessa versione del piano · importi netti
              </p>
            </div>
          </div>
          <div
            className="generale-segmented"
            role="group"
            aria-label="Confronta il piano"
          >
            {tipi.map((x) => (
              <button
                type="button"
                key={x.id}
                aria-pressed={tipo.id === x.id}
                onClick={() => setScelta(x.id)}
              >
                {x.nome}
              </button>
            ))}
          </div>
        </header>
        <dl
          className="generale-plan-comparison"
          aria-label={`Confronto ${tipo.nome.toLowerCase()} in euro netti`}
        >
          {[
            {
              nome: "Budget previsto",
              valore: completo ? t.previsto : null,
              classe: "generale-plan-bar--budget",
            },
            {
              nome: "Registrato a oggi",
              valore: t.reale,
              classe: "generale-plan-bar--reale",
            },
            {
              nome: "Stima finale",
              valore: completo ? t.stima : null,
              classe: sfavorevole
                ? "generale-plan-bar--rischio"
                : "generale-plan-bar--stima",
            },
          ].map((r) => (
            <div key={r.nome}>
              <dt>{r.nome}</dt>
              <dd>
                {r.valore === null ? "Da completare" : formatCurrency(r.valore)}
              </dd>
              {r.valore !== null && (
                <Barra valore={r.valore} valori={valori} classe={r.classe} />
              )}
            </div>
          ))}
        </dl>
        <div className="generale-plan-comparison-note">
          <span
            className={completo && sfavorevole ? "text-destructive" : undefined}
          >
            {completo
              ? differenza
              : "Completa le stime per confrontare il budget."}
          </span>
          {tipo.id !== "margine" && (
            <button
              type="button"
              disabled={!righe.some((r) => r.righe.length)}
              onClick={() =>
                onApriRighe(
                  `${tipo.nome} registrati · intera operazione`,
                  righe.flatMap((r) => r.righe),
                )
              }
            >
              <Search aria-hidden="true" /> Vedi {tipo.nome.toLowerCase()}{" "}
              registrati
            </button>
          )}
        </div>
        <footer className="generale-panel-footer generale-plan-formula">
          <span>
            Registrato {formatCurrency(t.reale)} <b>+</b> a finire{" "}
            {completo ? formatCurrency(t.aFinire) : "da completare"} <b>=</b>{" "}
            stima {completo ? formatCurrency(t.stima) : "da completare"}
          </span>
          <small>
            {tipo.id === "margine"
              ? "Il margine registrato è ricavi meno costi. Il saldo di cassa si consulta nei movimenti effettivi."
              : "L’a finire è quanto resta da registrare: non coincide con le fatture ancora da pagare."}
          </small>
        </footer>
      </section>
      <section
        className="generale-panel generale-plan-priorities"
        aria-labelledby="scostamenti-piano-titolo"
      >
        <header className="generale-panel-heading">
          <div className="generale-panel-title">
            <span className="generale-section-icon">
              <Search aria-hidden="true" />
            </span>
            <div>
              <h2 id="scostamenti-piano-titolo">Scostamenti da controllare</h2>
              <p>
                {scostamenti.length
                  ? scostamenti.length === 1
                    ? "1 voce riduce il margine previsto"
                    : `${scostamenti.length} voci riducono il margine previsto`
                  : "Controllo della stima rispetto al budget"}
              </p>
            </div>
          </div>
        </header>
        {!completo ? (
          <div className="generale-plan-priorities-empty">
            <strong>Prima completa il budget</strong>
            <p>
              Gli scostamenti diventano attendibili quando le stime mancanti
              sono state compilate.
            </p>
          </div>
        ) : !scostamenti.length ? (
          <div className="generale-plan-priorities-empty">
            <CheckCircle2 aria-hidden="true" />
            <strong>Nessuno scostamento sfavorevole</strong>
            <p>
              Le stime attuali non riducono il margine rispetto alle voci
              previste.
            </p>
          </div>
        ) : (
          <ul>
            {scostamenti.slice(0, 3).map((r) => (
              <li key={r.chiave}>
                <button
                  type="button"
                  onClick={() => onCategoria(r.categoria, r.tipo)}
                >
                  <span>
                    {r.tipo === "costo" ? (
                      <ArrowUpRight aria-hidden="true" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" />
                    )}
                    {r.tipo === "costo" ? "Costo" : "Ricavo"} ·{" "}
                    {CATEGORIE_PIANO[r.categoria as CategoriaPiano]?.nome ??
                      CHIAVI_REALI[r.categoria] ??
                      r.categoria}
                  </span>
                  <strong>{r.etichetta}</strong>
                  <small>
                    Budget {formatCurrency(r.previsto)} · stima{" "}
                    {formatCurrency(r.stima)}
                  </small>
                  <b>
                    {formatCurrency(Math.abs(r.scostamento))}{" "}
                    {r.tipo === "costo"
                      ? "di costi in più"
                      : "di ricavi in meno"}
                  </b>
                  <em>
                    Vai alle voci <ArrowUpRight aria-hidden="true" />
                  </em>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="generale-panel-footer">
          <span>
            {scostamenti.length > 3
              ? "Le tre voci con l’impatto maggiore. "
              : ""}
            I filtri della tabella non cambiano questo riepilogo.
          </span>
        </footer>
      </section>
    </div>
  );
}
