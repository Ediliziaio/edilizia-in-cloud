import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { RiesameProprioPos } from "../RiesameProprioPos";
import { Button } from "@/components/ui/button";
import { useStoricoAddetti } from "@/hooks/useRequisitiAddetti";
import {
  useRiesameProprioPos,
  useRiesamiPropriPos,
} from "@/hooks/useRiesameProprioPos";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import {
  requisitiAddettiPosVuoti,
  contestoLavorazioneAddetti,
  erroriRequisitiAddettiPos,
  type RequisitiAddettiPos,
  type JsonRiesame,
} from "../../../../supabase/functions/_shared/posRequisitiAddetti";
import type {
  Lavorazione,
  PosContenuto,
} from "../../../../supabase/functions/_shared/posModello";
import type { Modifica } from "./PosSezioni";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function RequisitiLavorazionePos({
  companyId,
  orderId,
  d,
  l,
  n,
  ro,
  modifica,
}: {
  companyId: string;
  orderId: string;
  d: PosContenuto;
  l: Lavorazione;
  n: number;
  ro: boolean;
  modifica: Modifica;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false),
    [scelto, setScelto] = useState("");
  const v = l.requisiti_addetti || requisitiAddettiPosVuoti();
  const fasi = useFasiFascicolo(companyId, orderId);
  const storico = useStoricoAddetti(
    companyId,
    orderId,
    v.dal,
    v.al,
    l.fase_id || null,
    false,
    aperto && !ro,
  );
  const fonte = useRiesameProprioPos(
    companyId,
    orderId,
    aperto && !ro ? scelto : "",
  );
  const correnti = useRiesamiPropriPos(
    companyId,
    orderId,
    v.fonti.map((f) => f.id),
    !ro,
  );
  const inLettura = correnti.some((q) => q.isLoading || q.isFetching);
  const cambiate = correnti.some(
    (q, i) =>
      q.isError || (!!q.data && q.data.impronta !== v.fonti[i].impronta),
  );
  const cambia = (fn: (v: RequisitiAddettiPos) => void) =>
    modifica((x) => {
      const a = x.lavorazioni[n];
      a.requisiti_addetti ||= requisitiAddettiPosVuoti();
      fn(a.requisiti_addetti);
      a.requisiti_addetti.confermata = false;
      a.requisiti_addetti.contesto_lavorazione = null;
    });
  const errori = erroriRequisitiAddettiPos(
    v,
    l,
    d.opera.data_inizio,
    d.opera.data_fine,
  );
  const primaDellaConferma = erroriRequisitiAddettiPos(
    {
      ...v,
      confermata: true,
      contesto_lavorazione: contestoLavorazioneAddetti(l),
    },
    l,
    d.opera.data_inizio,
    d.opera.data_fine,
  );
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3 sm:col-span-2">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-sm font-medium">
          {t("Requisiti e qualifiche degli addetti per questa lavorazione")}
        </p>
        {!ro && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAperto((a) => !a)}
          >
            {aperto ? t("Chiudi riesami") : t("Scegli riesami della commessa")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Collega il riesame dell’attività e i suoi addetti della tua impresa. Gli originali pertinenti verranno conservati nel fascicolo dell’emissione; non vengono importati attestati dei subappaltatori.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs">
          {t("Gestione")}
          <UniformSelect
            className="block w-full rounded border p-2 text-sm"
            aria-label={t("Gestione requisiti addetti {n}", { n: n + 1 })}
            value={v.modalita}
            disabled={ro}
            onChange={(e) =>
              cambia((v) => {
                v.modalita = e.target.value as RequisitiAddettiPos["modalita"];
                v.fonti = [];
              })
            }
          >
            <option value="da_verificare">{t("Da definire")}</option>
            <option value="riesami">{t("Addetti della propria impresa")}</option>
            {l.svolgimento === "subappalto" && (
              <option value="altra_gestione">
                {t("Interamente eseguita dall’impresa esterna")}
              </option>
            )}
          </UniformSelect>
        </label>
        <label className="space-y-1 text-xs">
          {t("Dal")}
          <input
            className="block w-full rounded border p-2 text-sm"
            type="date"
            aria-label={t("Inizio requisiti addetti {n}", { n: n + 1 })}
            value={v.dal}
            disabled={ro}
            onChange={(e) => {
              setScelto("");
              cambia((v) => {
                v.dal = e.target.value;
              });
            }}
          />
        </label>
        <label className="space-y-1 text-xs">
          {t("Al")}
          <input
            className="block w-full rounded border p-2 text-sm"
            type="date"
            aria-label={t("Fine requisiti addetti {n}", { n: n + 1 })}
            value={v.al}
            disabled={ro}
            onChange={(e) => {
              setScelto("");
              cambia((v) => {
                v.al = e.target.value;
              });
            }}
          />
        </label>
      </div>
      {!d.versione_prodotti && (
        <label className="block text-xs">
          {t("Fase della lavorazione")}
          <UniformSelect
            className="block w-full rounded border p-2"
            disabled={ro || fasi.isError}
            value={l.fase_id || ""}
            onChange={(e) => {
              setScelto("");
              modifica((x) => {
                x.lavorazioni[n].fase_id = e.target.value || null;
                if (x.lavorazioni[n].requisiti_addetti)
                  x.lavorazioni[n].requisiti_addetti!.confermata = false;
              });
            }}
          >
            <option value="">{t("Nessuna fase specifica")}</option>
            {(fasi.data || []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </UniformSelect>
        </label>
      )}
      {aperto && !ro && v.modalita === "riesami" && (
        <div className="space-y-2 rounded border bg-slate-50 p-3">
          {!v.dal || !v.al || v.al < v.dal ? (
            <p className="text-sm">
              {t("Indica prima il periodo della lavorazione.")}
            </p>
          ) : storico.isError ? (
            <p role="alert">
              {t("Storico non disponibile: rileggi i riesami nella commessa.")}
            </p>
          ) : storico.isLoading ? (
            <p role="status">{t("Lettura dei riesami…")}</p>
          ) : (
            <>
              <label className="block text-sm">
                {t("Riesame dell’attività")}
                <UniformSelect
                  className="block w-full rounded border p-2"
                  value={scelto}
                  onChange={(e) => setScelto(e.target.value)}
                >
                  <option value="">{t("Scegli un riesame registrato")}</option>
                  {(storico.data || [])
                    .filter((r) => r.fase_id === (l.fase_id || null))
                    .map((r) => (
                      <option key={r.id} value={r.id}>{t("{attivita} · {dal}–{al} · rev. {versione}", { attivita: String(r.dati.attivita ?? ""), dal: String(r.dal ?? ""), al: String(r.al ?? ""), versione: String(r.versione ?? "") })}</option>
                    ))}
                </UniformSelect>
              </label>
              {!storico.data?.length && (
                <p className="text-sm">
                  {t("Nessun riesame nel periodo. Registralo in Cantiere → Sicurezza → Requisiti e qualifiche degli addetti.")}
                </p>
              )}
            </>
          )}
          {scelto &&
            (fonte.isLoading ? (
              <p role="status">{t("Verifica della fonte propria…")}</p>
            ) : fonte.isError ? (
              <p role="alert" className="text-sm text-amber-800">
                {fonte.error.message}
              </p>
            ) : (
              fonte.data && (
                <>
                  <p className="text-sm">{t("{attivita} · {n} addetti · {n2} riscontri", { attivita: String(fonte.data.attivita ?? ""), n: fonte.data.persone.length, n2: fonte.data.riscontri.length })}</p>
                  <details className="rounded border bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t("Leggi riscontri, limiti e originali")}
                    </summary>
                    <div className="mt-3">
                      <RiesameProprioPos
                        companyId={companyId}
                        orderId={orderId}
                        id={scelto}
                      />
                    </div>
                  </details>
                  <Button
                    size="sm"
                    disabled={
                      fonte.isFetching ||
                      fonte.data.fase_id !== (l.fase_id || null) ||
                      fonte.data.dal > v.dal ||
                      fonte.data.al < v.al ||
                      (v.fonti.length >= 10 &&
                        !v.fonti.some((f) => f.id === scelto))
                    }
                    onClick={() => {
                      const f = fonte.data!;
                      cambia((v) => {
                        v.modalita = "riesami";
                        v.fonti = [
                          ...v.fonti.filter((s) => s.id !== f.id),
                          {
                            id: f.id,
                            impronta: f.impronta,
                            fotografia: structuredClone(f) as unknown as Record<
                              string,
                              JsonRiesame
                            >,
                          },
                        ];
                      });
                    }}
                  >
                    {v.fonti.some((f) => f.id === scelto)
                      ? t("Rileggi e sostituisci questa fonte")
                      : t("Collega il riesame della propria impresa")}
                  </Button>
                </>
              )
            ))}
        </div>
      )}
      {v.fonti.map((f, i) => (
        <div key={f.id} className="rounded border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-medium">{t("{valore} · rev. {valore2}", { valore: String(f.fotografia.attivita || t("Riesame")), valore2: String(f.fotografia.revisione || "") })}</p>
            {!ro && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  cambia((v) => {
                    v.fonti = v.fonti.filter((a) => a.id !== f.id);
                  })
                }
              >
                {t("Rimuovi collegamento")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {String(f.fotografia.dal || "")}–{String(f.fotografia.al || "")}
          </p>
          {!ro && (
            <p
              className="mt-1 text-xs"
              role={correnti[i]?.isError ? "alert" : undefined}
            >
              {correnti[i]?.isError
                ? correnti[i].error?.message
                : correnti[i]?.data && correnti[i].data!.impronta !== f.impronta
                  ? t("Fonte cambiata: scegli il nuovo riesame e ricollegalo.")
                  : correnti[i]?.isFetching
                    ? t("Rilettura delle fonti…")
                    : t("Il server ricontrolla la fonte prima dell’emissione.")}
            </p>
          )}
        </div>
      ))}
      {v.modalita === "altra_gestione" && (
        <label className="block space-y-1 text-xs">
          {t("Impresa esterna e motivazione dell’esclusione dell’organico proprio")}
          <textarea
            className="block w-full rounded border p-2 text-sm"
            value={v.motivazione}
            disabled={ro}
            onChange={(e) =>
              cambia((v) => {
                v.motivazione = e.target.value;
              })
            }
          />
        </label>
      )}
      <label className="block space-y-1 text-xs">
        {t("Pertinenza a questa lavorazione, ruoli, limiti e azioni da attuare")}
        <textarea
          className="block w-full rounded border p-2 text-sm"
          aria-label={t("Pertinenza requisiti addetti {n}", { n: n + 1 })}
          value={v.adattamento}
          disabled={ro}
          onChange={(e) =>
            cambia((v) => {
              v.adattamento = e.target.value;
            })
          }
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.confermata && errori.length === 0 && !cambiate}
          disabled={
            ro ||
            inLettura ||
            cambiate ||
            primaDellaConferma.length > 0 ||
            (v.modalita === "riesami" && correnti.some((q) => !q.data))
          }
          onChange={(e) =>
            modifica((x) => {
              const a = x.lavorazioni[n];
              a.requisiti_addetti ||= requisitiAddettiPosVuoti();
              a.requisiti_addetti.confermata = e.target.checked;
              a.requisiti_addetti.contesto_lavorazione = e.target.checked
                ? contestoLavorazioneAddetti(a)
                : null;
            })
          }
        />
        {t("Ho verificato identità, periodo e pertinenza dei riscontri rispetto alla lavorazione attuale. Non è un’attestazione di idoneità o accesso.")}
      </label>
      {errori.length > 0 && !ro && (
        <ul className="space-y-1 text-xs text-amber-800">
          {errori.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
