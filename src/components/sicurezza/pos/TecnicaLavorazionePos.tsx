import { DocumentiMezzoSchedaPos } from "./DocumentiMezzoSchedaPos";
import { MezzoSchedaTecnicaPos } from "./MezzoSchedaTecnicaPos";
import { FontiSchedaTecnicaPos } from "./FontiSchedaTecnicaPos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPI_ATTREZZATURA_TECNICA,
  CAMPI_CONTESTO_TECNICO,
  CAMPI_RISCHIO_TECNICO,
  attrezzaturaTecnicaVuota,
  erroriTecnicaPos,
  rischioTecnicoVuoto,
  tecnicaPosVuota,
  type TecnicaLavorazionePos,
} from "../../../../supabase/functions/_shared/posTecnica";
import type { PosContenuto } from "../../../../supabase/functions/_shared/posModello";

export function TecnicaLavorazionePos({
  d,
  n,
  ro,
  modifica,
  companyId,
  orderId,
}: {
  companyId?: string;
  orderId?: string;
  d: PosContenuto;
  n: number;
  ro: boolean;
  modifica: (fn: (v: PosContenuto) => void) => void;
}) {
  const t = d.lavorazioni[n].tecnica || tecnicaPosVuota();
  const edit = (fn: (v: TecnicaLavorazionePos) => void) => {
    if (!ro)
      modifica((p) => {
        const r = (p.lavorazioni[n].tecnica ||= tecnicaPosVuota());
        fn(r);
      });
  };
  const base = `tecnica-${n}`;
  const area = (
    id: string,
    label: string,
    value: string,
    cambia: (v: string) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        readOnly={ro}
        rows={3}
        onChange={(e) => cambia(e.target.value)}
      />
    </div>
  );
  const errori = erroriTecnicaPos(t);
  return (
    <section
      className="space-y-3 rounded-lg border bg-white p-3 sm:col-span-2"
      aria-label={`Dettaglio tecnico della lavorazione ${n + 1}`}
    >
      <div>
        <h4 className="font-medium">Scheda tecnica di dettaglio</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Descrivi le condizioni effettive del cantiere. I testi di riepilogo
          restano conservati. Non sono calcolati rischi o attestazioni
          automatiche: le valutazioni e i riferimenti vanno verificati dal
          responsabile competente.
        </p>
      </div>
      <details open className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Organizzazione e sequenza operativa
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(CAMPI_CONTESTO_TECNICO).map(([k, label]) => (
            <div key={k}>
              {area(
                `${base}-${k}`,
                label,
                t[k as keyof typeof CAMPI_CONTESTO_TECNICO],
                (v) =>
                  edit((x) => {
                    x[k as keyof typeof CAMPI_CONTESTO_TECNICO] = v;
                  }),
              )}
            </div>
          ))}
        </div>
      </details>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Rischi, misure e valutazioni · {t.rischi.length}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Una scheda per ogni rischio specifico. Se una protezione non è
          pertinente, indica il motivo. Non inserire valori di esposizione o
          valutazioni senza una fonte.
        </p>
        <div className="mt-3 space-y-3">
          {t.rischi.map((r, i) => (
            <fieldset
              key={r.id}
              className="min-w-0 space-y-3 rounded-md border p-3"
            >
              <legend className="px-1 text-sm font-medium">
                Rischio {i + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(CAMPI_RISCHIO_TECNICO).map(([k, label]) => (
                  <div key={k}>
                    {area(
                      `${base}-r-${i}-${k}`,
                      `${label} · rischio ${i + 1}`,
                      r[k as keyof typeof CAMPI_RISCHIO_TECNICO],
                      (v) =>
                        edit((x) => {
                          x.rischi[i][k as keyof typeof CAMPI_RISCHIO_TECNICO] =
                            v;
                        }),
                    )}
                  </div>
                ))}
              </div>
              {d.versione_fonti_tecniche === 1 && companyId && orderId && (
                <FontiSchedaTecnicaPos
                  companyId={companyId}
                  orderId={orderId}
                  tipo="rischio"
                  id={`${base}-r-${i}`}
                  value={r.fonti}
                  ro={ro}
                  faseId={d.lavorazioni[n].fase_id}
                  dal={d.opera.data_inizio}
                  al={d.opera.data_fine}
                  onChange={(v) =>
                    edit((x) => {
                      x.rischi[i].fonti = v;
                    })
                  }
                />
              )}
              {!ro && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    edit((x) => {
                      x.rischi.splice(i, 1);
                    })
                  }
                >
                  Rimuovi rischio {i + 1}
                </Button>
              )}
            </fieldset>
          ))}
        </div>
        {!ro && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={t.rischi.length >= 50}
            onClick={() =>
              edit((x) => {
                x.rischi.push(rischioTecnicoVuoto(crypto.randomUUID()));
              })
            }
          >
            Aggiungi rischio specifico
          </Button>
        )}
      </details>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Attrezzature e opere provvisionali · {t.attrezzature.length}
        </summary>
        <Label htmlFor={`${base}-attrezzature`} className="mt-3 block">
          Sono previste attrezzature, macchine, impianti o opere provvisionali?
        </Label>
        <select
          id={`${base}-attrezzature`}
          className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
          value={t.attrezzature_previste}
          disabled={ro}
          onChange={(e) =>
            edit((x) => {
              x.attrezzature_previste = e.target
                .value as TecnicaLavorazionePos["attrezzature_previste"];
            })
          }
        >
          <option value="da_verificare">Da verificare</option>
          <option value="si">Sì, identificale nelle schede</option>
          <option value="no">No, indica il motivo</option>
        </select>
        {t.attrezzature_previste === "no" && (
          <div className="mt-3">
            {area(
              `${base}-motivo`,
              "Motivo dell’assenza di attrezzature",
              t.motivo_senza_attrezzature,
              (v) =>
                edit((x) => {
                  x.motivo_senza_attrezzature = v;
                }),
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          I riferimenti ai manuali e alla formazione sono testi da controllare:
          non attestano da soli la presenza o la validità dei documenti nel
          fascicolo.
        </p>
        <div className="mt-3 space-y-3">
          {t.attrezzature.map((a, i) => (
            <fieldset
              key={a.id}
              className="min-w-0 space-y-3 rounded-md border p-3"
            >
              <legend className="px-1 text-sm font-medium">
                Attrezzatura {i + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(CAMPI_ATTREZZATURA_TECNICA).map(
                  ([k, label]) => (
                    <div key={k}>
                      {area(
                        `${base}-a-${i}-${k}`,
                        `${label} · attrezzatura ${i + 1}`,
                        a[k as keyof typeof CAMPI_ATTREZZATURA_TECNICA],
                        (v) =>
                          edit((x) => {
                            x.attrezzature[i][
                              k as keyof typeof CAMPI_ATTREZZATURA_TECNICA
                            ] = v;
                          }),
                      )}
                    </div>
                  ),
                )}
              </div>
              {d.versione_mezzi === 1 && companyId && orderId && (
                <MezzoSchedaTecnicaPos
                  companyId={companyId}
                  orderId={orderId}
                  id={`${base}-a-${i}-mezzo`}
                  value={a.anagrafica}
                  ro={ro}
                  dal={d.opera.data_inizio}
                  al={d.opera.data_fine}
                  onChange={(v) =>
                    edit((x) => {
                      x.attrezzature[i].anagrafica = v;
                      if (x.attrezzature[i].documentazione)
                        x.attrezzature[i].documentazione!.confermata = false;
                    })
                  }
                />
              )}
              {d.versione_documenti_mezzi === 1 && companyId && orderId && (
                <DocumentiMezzoSchedaPos
                  companyId={companyId}
                  orderId={orderId}
                  id={`${base}-a-${i}-documenti-mezzo`}
                  value={a.documentazione}
                  anagrafica={a.anagrafica}
                  ro={ro}
                  onChange={(v) =>
                    edit((x) => {
                      x.attrezzature[i].documentazione = v;
                    })
                  }
                />
              )}
              {d.versione_fonti_tecniche === 1 && companyId && orderId && (
                <FontiSchedaTecnicaPos
                  companyId={companyId}
                  orderId={orderId}
                  tipo="attrezzatura"
                  id={`${base}-a-${i}`}
                  value={a.fonti}
                  ro={ro}
                  faseId={d.lavorazioni[n].fase_id}
                  dal={d.opera.data_inizio}
                  al={d.opera.data_fine}
                  onChange={(v) =>
                    edit((x) => {
                      x.attrezzature[i].fonti = v;
                    })
                  }
                />
              )}
              {!ro && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    edit((x) => {
                      x.attrezzature.splice(i, 1);
                    })
                  }
                >
                  Rimuovi attrezzatura {i + 1}
                </Button>
              )}
            </fieldset>
          ))}
        </div>
        {!ro && t.attrezzature_previste === "si" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={t.attrezzature.length >= 50}
            onClick={() =>
              edit((x) => {
                x.attrezzature.push(
                  attrezzaturaTecnicaVuota(crypto.randomUUID()),
                );
              })
            }
          >
            Aggiungi attrezzatura effettiva
          </Button>
        )}
      </details>
      <label className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={t.riesaminata}
          disabled={ro}
          onChange={(e) =>
            edit((x) => {
              x.riesaminata = e.target.checked;
            })
          }
        />
        <span>
          Ho riesaminato rischi, misure, sequenza e attrezzature per questa
          lavorazione e per questo cantiere. Le modifiche ai contenuti o al
          contesto richiedono un nuovo riesame.
        </span>
      </label>
      {!!errori.length && (
        <details className="text-xs text-amber-900">
          <summary className="cursor-pointer">
            {errori.length} elementi del dettaglio tecnico da completare o
            riesaminare
          </summary>
          <ul className="mt-2 list-disc pl-4">
            {errori.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
