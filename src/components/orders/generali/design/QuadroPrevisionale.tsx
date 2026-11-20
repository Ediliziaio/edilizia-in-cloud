/**
 * Previsionale sopra, reale sotto (16/11/2026), come «La commessa in numeri» di una commessa
 * singola. Tre colonne — vendita, costi, margine — e sotto ogni importo il suo €/m².
 *
 *                 Vendita                 Costi                      Margine
 *   Previsionale  ricavi previsti         budget del piano           differenza
 *                 2.496 €/m²              1.938 €/m²                 22,4%
 *   Reale         venduto · incassato     speso                      differenza
 *                 600 €/m²                739 €/m² · 38% del budget
 *
 * I conti stanno in lib/orders/generali/numeriOperazione.ts: qui si disegna soltanto.
 */
import { cn } from "@/lib/utils";
import { noteSuperficie, type NumeriOperazione } from "@/lib/orders/generali/numeriOperazione";
import { SuperficieAMano } from "@/components/orders/generali/design/SuperficieAMano";

const euro = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const euroMq = (v: number | null) =>
  v === null ? null : `${v.toLocaleString("it-IT", { maximumFractionDigits: 0 })} €/m²`;

const pct = (v: number | null) => (v === null ? null : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

function Cella({ valore, nota, tono }: { valore: string; nota?: string | null; tono?: "verde" | "rosso" }) {
  return (
    <div className="quadro-prev-cella">
      <p className={cn("quadro-prev-valore tabular-nums", tono === "verde" && "generale-positive", tono === "rosso" && "generale-negative")}>
        {valore}
      </p>
      {nota && <p className="quadro-prev-nota">{nota}</p>}
    </div>
  );
}

interface Props {
  n: NumeriOperazione;
  /** «Venduto» per un'operazione immobiliare, «Fatturato» per un appalto. */
  etichettaVendita: string;
  /** Incassato davvero, scritto sotto il venduto. */
  incassato: number | null;
  /** Il piano non ha ancora tutte le stime: il budget è parziale e va detto. */
  budgetParziale?: boolean;
  /** Nessun costo previsto nel piano: si dice cosa manca invece di lasciare un trattino muto. */
  notaCostiPrevisti?: string | null;
  /** Con questo la superficie si scrive da qui, senza passare dalla scheda Dati. */
  superficieAMano?: { generaleId: string; area: Record<string, string | number | boolean | null> | undefined };
  appalto?: boolean;
}

export function QuadroPrevisionale({ n, etichettaVendita, incassato, budgetParziale, notaCostiPrevisti, superficieAMano, appalto = false }: Props) {
  const { previsionale: p, reale: r } = n;
  const mq = n.superficie;
  const tonoMargine = (m: number | null) => (m === null ? undefined : m < 0 ? "rosso" : "verde");
  // Spendere meno del previsto è un bene, spendere di più no: il colore segue il senso, non il segno.
  const tonoScarto = n.scartoCosti === null ? undefined : n.scartoCosti > 0 ? "rosso" : "verde";

  return (
    <div className="quadro-prev">
      <div className="quadro-prev-testata">
        <span className="quadro-prev-titolo">Previsionale e reale</span>
        {mq ? (
          <span className="quadro-prev-mq">
            {mq.mq.toLocaleString("it-IT", { maximumFractionDigits: 0 })} m²
            <span className="quadro-prev-mq-fonte"> · {noteSuperficie(mq)}</span>
            {superficieAMano && mq.fonte !== "unita" && (
              <SuperficieAMano {...superficieAMano} etichetta="correggi" />
            )}
          </span>
        ) : !appalto && (
          <span className="quadro-prev-mq-fonte">
            Per i €/m² serve la superficie vendibile:{" "}
            {superficieAMano
              ? <SuperficieAMano {...superficieAMano} />
              : "scrivila nella scheda Dati, o metti i metri quadri delle unità"}
          </span>
        )}
      </div>

      <div role="table" aria-label="Previsionale e reale" className="quadro-prev-griglia">
        <div role="row" className="contents">
          <span role="columnheader" className="quadro-prev-angolo" />
          <span role="columnheader" className="quadro-prev-intestazione">{etichettaVendita}</span>
          <span role="columnheader" className="quadro-prev-intestazione">Costi</span>
          <span role="columnheader" className="quadro-prev-intestazione">Margine</span>
        </div>

        <div role="row" className="contents">
          <span role="rowheader" className="quadro-prev-riga-nome">
            Previsionale<span className="quadro-prev-riga-sotto">dal piano</span>
          </span>
          <Cella valore={euro(p.vendita)} nota={euroMq(p.venditaMq)} />
          <Cella
            valore={euro(p.costi)}
            nota={euroMq(p.costiMq) ?? (p.costi === null ? notaCostiPrevisti : null) ?? (budgetParziale ? "stime da completare" : null)}
          />
          <Cella valore={euro(p.margine)} nota={pct(p.marginePct)} tono={tonoMargine(p.margine)} />
        </div>

        <div role="row" className="contents">
          <span role="rowheader" className="quadro-prev-riga-nome">
            Reale<span className="quadro-prev-riga-sotto">a oggi</span>
          </span>
          <Cella
            valore={r.vendita === null ? "—" : euro(r.vendita)}
            nota={r.vendita === null
              ? (appalto ? "nessuna fattura emessa finora" : "niente venduto finora")
              : [euroMq(r.venditaMq), incassato !== null ? `incassato ${euro(incassato)}` : null].filter(Boolean).join(" · ")}
          />
          <Cella
            valore={euro(r.costi)}
            nota={[euroMq(r.costiMq), n.spesoPct !== null ? `${pct(n.spesoPct)} del budget` : null].filter(Boolean).join(" · ") || null}
          />
          <Cella
            valore={r.margine === null ? "—" : euro(r.margine)}
            nota={r.margine === null ? (appalto ? "si calcola con ricavi e costi registrati" : "si calcola quando si vende") : pct(r.marginePct)}
            tono={tonoMargine(r.margine)}
          />
        </div>
      </div>

      {(n.scartoCosti !== null || n.scartoCostoMq !== null) && (
        <p className="quadro-prev-scarto">
          {n.scartoCosti !== null && (
            <span className={cn(tonoScarto === "rosso" && "generale-negative", tonoScarto === "verde" && "generale-positive")}>
              {n.scartoCosti > 0
                ? `Oltre il budget di ${euro(n.scartoCosti)}`
                : `Restano ${euro(-n.scartoCosti)} di budget`}
            </span>
          )}
          {n.scartoCostoMq !== null && (
            <span>
              {" · "}
              {n.scartoCostoMq > 0
                ? `${euroMq(n.scartoCostoMq)} in più al metro quadro`
                : `${euroMq(-n.scartoCostoMq)} al metro quadro sotto il previsto`}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
