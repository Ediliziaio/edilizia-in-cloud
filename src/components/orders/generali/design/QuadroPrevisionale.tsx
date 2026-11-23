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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const euro = (v: number | null) =>
  v === null ? "—" : v.toLocaleString(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const euroMq = (v: number | null) =>
  v === null ? null : `${v.toLocaleString(intlCampo(), { maximumFractionDigits: 0 })} €/m²`;

const pct = (v: number | null) => (v === null ? null : `${v.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`);

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
  budgetInBozza?: boolean;
  /** Nessun costo previsto nel piano: si dice cosa manca invece di lasciare un trattino muto. */
  notaCostiPrevisti?: string | null;
  /** Con questo la superficie si scrive da qui, senza passare dalla scheda Dati. */
  superficieAMano?: { generaleId: string; area: Record<string, string | number | boolean | null> | undefined };
  appalto?: boolean;
}

export function QuadroPrevisionale({ n, etichettaVendita, incassato, budgetParziale, budgetInBozza, notaCostiPrevisti, superficieAMano, appalto = false }: Props) {
  const t = useT();
  const { previsionale: p, reale: r } = n;
  const mq = n.superficie;
  const tonoMargine = (m: number | null) => (m === null ? undefined : m < 0 ? "rosso" : "verde");
  // Spendere meno del previsto è un bene, spendere di più no: il colore segue il senso, non il segno.
  const tonoScarto = n.scartoCosti === null ? undefined : n.scartoCosti > 0 ? "rosso" : "verde";

  return (
    <div className="quadro-prev">
      <div className="quadro-prev-testata">
        <span className="quadro-prev-titolo">{t("Previsionale e reale")}</span>
        {mq ? (
          <span className="quadro-prev-mq">
            {mq.mq.toLocaleString(intlCampo(), { maximumFractionDigits: 0 })} m²
            <span className="quadro-prev-mq-fonte"> · {noteSuperficie(mq)}</span>
            {superficieAMano && mq.fonte !== "unita" && (
              <SuperficieAMano {...superficieAMano} etichetta={t("correggi")} />
            )}
          </span>
        ) : !appalto && (
          <span className="quadro-prev-mq-fonte">
            {t("Per i €/m² serve la superficie vendibile:")}{" "}
            {superficieAMano
              ? <SuperficieAMano {...superficieAMano} />
              : t("scrivila nella scheda Dati, o metti i metri quadri delle unità")}
          </span>
        )}
      </div>

      <div role="table" aria-label={t("Previsionale e reale")} className="quadro-prev-griglia">
        <div role="row" className="contents">
          <span role="columnheader" className="quadro-prev-angolo" />
          <span role="columnheader" className="quadro-prev-intestazione">{etichettaVendita}</span>
          <span role="columnheader" className="quadro-prev-intestazione">{t("Costi")}</span>
          <span role="columnheader" className="quadro-prev-intestazione">{t("Margine")}</span>
        </div>

        <div role="row" className="contents">
          <span role="rowheader" className="quadro-prev-riga-nome">
            {t("Previsionale")}<span className="quadro-prev-riga-sotto">{budgetInBozza ? t("piano in bozza") : t("dal piano")}</span>
          </span>
          <Cella valore={euro(p.vendita)} nota={euroMq(p.venditaMq)} />
          <Cella
            valore={euro(p.costi)}
            nota={euroMq(p.costiMq) ?? (p.costi === null ? notaCostiPrevisti : null) ?? (budgetParziale ? t("stime da completare") : null)}
          />
          <Cella valore={euro(p.margine)} nota={pct(p.marginePct)} tono={tonoMargine(p.margine)} />
        </div>

        <div role="row" className="contents">
          <span role="rowheader" className="quadro-prev-riga-nome">
            {t("Reale")}<span className="quadro-prev-riga-sotto">{t("a oggi")}</span>
          </span>
          <Cella
            valore={r.vendita === null ? "—" : euro(r.vendita)}
            nota={r.vendita === null
              ? (appalto ? t("nessuna fattura emessa finora") : t("niente venduto finora"))
              : [euroMq(r.venditaMq), incassato !== null ? t("incassato {importo}", { importo: euro(incassato) }) : null].filter(Boolean).join(" · ")}
          />
          <Cella
            valore={euro(r.costi)}
            nota={[euroMq(r.costiMq), n.spesoPct !== null ? (budgetInBozza ? t("{perc} dei costi in bozza", { perc: pct(n.spesoPct) }) : t("{perc} del budget", { perc: pct(n.spesoPct) })) : null].filter(Boolean).join(" · ") || null}
          />
          <Cella
            valore={r.margine === null ? "—" : euro(r.margine)}
            nota={r.margine === null ? (appalto ? t("si calcola con ricavi e costi registrati") : t("si calcola quando si vende")) : pct(r.marginePct)}
            tono={tonoMargine(r.margine)}
          />
        </div>
      </div>

      {!budgetInBozza && r.costi !== 0 && (n.scartoCosti !== null || n.scartoCostoMq !== null) && (
        <p className="quadro-prev-scarto">
          {n.scartoCosti !== null && (
            <span className={cn(tonoScarto === "rosso" && "generale-negative", tonoScarto === "verde" && "generale-positive")}>
              {n.scartoCosti > 0
                ? t("Oltre il budget di {importo}", { importo: euro(n.scartoCosti) })
                : t("Restano {importo} di budget", { importo: euro(-n.scartoCosti) })}
            </span>
          )}
          {n.scartoCostoMq !== null && (
            <span>
              {" · "}
              {n.scartoCostoMq > 0
                ? t("{valore} in più al metro quadro", { valore: euroMq(n.scartoCostoMq) })
                : t("{valore} al metro quadro sotto il previsto", { valore: euroMq(-n.scartoCostoMq) })}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
