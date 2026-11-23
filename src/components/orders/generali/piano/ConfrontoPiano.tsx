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
import { stimaMancante } from "@/lib/orders/generali/budgetCompletezza";
import {
  CATEGORIE_PIANO,
  CHIAVI_REALI,
  type CategoriaPiano,
} from "@/lib/orders/generali/pianoCategorie";
import "./piano-lettura.css";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const tr = useT();
  const [scelta, setScelta] = useState<Tipo>("costi");
  const tipi = [
    ...(permessi.costi ? [{ id: "costi" as const, nome: tr("Costi") }] : []),
    ...(permessi.importi ? [{ id: "ricavi" as const, nome: tr("Ricavi") }] : []),
    ...(permessi.costi && permessi.importi
      ? [{ id: "margine" as const, nome: tr("Margine") }]
      : []),
  ];
  const tipo = tipi.find((t) => t.id === scelta) ?? tipi[0];
  if (!tipo) return null;
  const completo = piano.budgetCompleto !== false;
  const t = piano.confronto.totali[tipo.id];
  // Con voci da stimare i numeri si mostrano lo stesso, segnati come provvisori.
  const daStimare = [...piano.confronto.costi, ...piano.confronto.ricavi].filter(
    (r) => r.voce && stimaMancante(r.voce),
  ).length;
  const valori = [t.reale, t.previsto, t.stima];
  const righe =
    tipo.id === "costi"
      ? piano.confronto.costi
      : tipo.id === "ricavi"
        ? piano.confronto.ricavi
        : [];
  // Anche col budget incompleto: una spesa oltre il previsto (o senza previsto) è già un fatto.
  const scostamenti = [
    ...(permessi.costi ? piano.confronto.costi : []),
    ...(permessi.importi ? piano.confronto.ricavi : []),
  ]
    .filter(
      (r) => (r.tipo === "costo" ? r.scostamento : -r.scostamento) > 0.005,
    )
    .sort((a, b) => Math.abs(b.scostamento) - Math.abs(a.scostamento));
  const sfavorevole =
    tipo.id === "costi" ? t.scostamento > 0.005 : t.scostamento < -0.005;
  const differenza =
    Math.abs(t.scostamento) < 0.005
      ? tr("In linea con il budget")
      : t.scostamento > 0
        ? tr("{importo} sopra il budget", { importo: formatCurrency(Math.abs(t.scostamento)) })
        : tr("{importo} sotto il budget", { importo: formatCurrency(Math.abs(t.scostamento)) });

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
              <h2 id="confronto-piano-titolo">{tr("Dal budget alla stima finale")}</h2>
              <p>
                {tr("Intera operazione · stessa versione del piano · importi netti")}
              </p>
            </div>
          </div>
          <div
            className="generale-segmented"
            role="group"
            aria-label={tr("Confronta il piano")}
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
          aria-label={
            tipo.id === "costi"
              ? tr("Confronto costi in euro netti")
              : tipo.id === "ricavi"
                ? tr("Confronto ricavi in euro netti")
                : tr("Confronto margine in euro netti")
          }
        >
          {[
            {
              nome: "Budget previsto",
              valore: t.previsto,
              classe: "generale-plan-bar--budget",
            },
            {
              nome: "Registrato a oggi",
              valore: t.reale,
              classe: "generale-plan-bar--reale",
            },
            {
              nome: "Stima finale",
              valore: t.stima,
              classe: sfavorevole
                ? "generale-plan-bar--rischio"
                : "generale-plan-bar--stima",
            },
          ].map((r) => (
            <div key={r.nome}>
              <dt>
                {tr(r.nome)}
                {!completo && r.nome !== "Registrato a oggi" && (
                  <span className="generale-indicator-tag">{tr("provvisorio")}</span>
                )}
              </dt>
              <dd>{formatCurrency(r.valore)}</dd>
              <Barra valore={r.valore} valori={valori} classe={r.classe} />
            </div>
          ))}
        </dl>
        <div className="generale-plan-comparison-note">
          <span
            className={completo && sfavorevole ? "text-destructive" : undefined}
          >
            {completo
              ? differenza
              : daStimare === 1
                ? tr("{differenza} · 1 voce ancora da stimare", { differenza })
                : tr("{differenza} · {n} voci ancora da stimare", { differenza, n: daStimare })}
          </span>
          {tipo.id !== "margine" && (
            <button
              type="button"
              disabled={!righe.some((r) => r.righe.length)}
              onClick={() =>
                onApriRighe(
                  tipo.id === "costi"
                    ? tr("Costi registrati · intera operazione")
                    : tr("Ricavi registrati · intera operazione"),
                  righe.flatMap((r) => r.righe),
                )
              }
            >
              <Search aria-hidden="true" />{" "}
              {tipo.id === "costi" ? tr("Vedi costi registrati") : tr("Vedi ricavi registrati")}
            </button>
          )}
        </div>
        <footer className="generale-panel-footer generale-plan-formula">
          <span>
            {tr("Registrato {importo}", { importo: formatCurrency(t.reale) })} <b>+</b>{" "}
            {tr("a finire {importo}", { importo: formatCurrency(t.aFinire) })} <b>=</b>{" "}
            {tr("stima {importo}", { importo: formatCurrency(t.stima) })}
          </span>
          <small>
            {tipo.id === "margine"
              ? tr("Il margine registrato è ricavi meno costi. Il saldo di cassa si consulta nei movimenti effettivi.")
              : tr("L’a finire è quanto resta da registrare: non coincide con le fatture ancora da pagare.")}
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
              <h2 id="scostamenti-piano-titolo">{tr("Scostamenti da controllare")}</h2>
              <p>
                {scostamenti.length
                  ? scostamenti.length === 1
                    ? tr("1 voce riduce il margine previsto")
                    : tr("{n} voci riducono il margine previsto", { n: scostamenti.length })
                  : tr("Controllo della stima rispetto al budget")}
              </p>
            </div>
          </div>
        </header>
        {!scostamenti.length ? (
          <div className="generale-plan-priorities-empty">
            <CheckCircle2 aria-hidden="true" />
            <strong>{completo ? tr("Nessuno scostamento sfavorevole") : tr("Finora nessuna spesa oltre il previsto")}</strong>
            <p>
              {completo
                ? tr("Le stime attuali non riducono il margine rispetto alle voci previste.")
                : tr("Il confronto completo arriva quando le voci da stimare hanno un importo.")}
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
                    {r.tipo === "costo" ? tr("Costo") : tr("Ricavo")} ·{" "}
                    {tr(
                      CATEGORIE_PIANO[r.categoria as CategoriaPiano]?.nome ??
                        CHIAVI_REALI[r.categoria] ??
                        r.categoria,
                    )}
                  </span>
                  <strong dir="auto">{r.etichetta}</strong>
                  <small>
                    {tr("Budget {previsto} · stima {stima}", { previsto: formatCurrency(r.previsto), stima: formatCurrency(r.stima) })}
                  </small>
                  <b>
                    {r.tipo === "costo"
                      ? tr("{importo} di costi in più", { importo: formatCurrency(Math.abs(r.scostamento)) })
                      : tr("{importo} di ricavi in meno", { importo: formatCurrency(Math.abs(r.scostamento)) })}
                  </b>
                  <em>
                    {tr("Vai alle voci")} <ArrowUpRight aria-hidden="true" />
                  </em>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="generale-panel-footer">
          <span>
            {scostamenti.length > 3
              ? `${tr("Le tre voci con l’impatto maggiore.")} `
              : ""}
            {tr("I filtri della tabella non cambiano questo riepilogo.")}
          </span>
        </footer>
      </section>
    </div>
  );
}
