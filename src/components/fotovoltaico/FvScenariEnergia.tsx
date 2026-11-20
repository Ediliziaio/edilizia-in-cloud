import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AnalisiConsumiFv,
  analisiConsumiIniziale,
} from "../../../supabase/functions/_shared/fvBollette";
import {
  consigliaModuliFv,
  simulaEnergiaFv,
} from "../../../supabase/functions/_shared/fvSimulazioneEnergetica";
import {
  type DisegnoCommercialeFv,
  disponiModuliOttimizzati,
  leggiDisegnoCommerciale,
  limiteModuliDisegno,
  pannelliDaRivedere,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import {
  anteprimaFotovoltaico,
  stimaProduzioneFv,
} from "@/lib/fotovoltaico/anteprima";
import {
  type ListinoComponentiFv,
  righeComponentiFv,
} from "@/lib/fotovoltaico/componentiConfigurazione";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import { resaMappaFv } from "../../../supabase/functions/_shared/fvMappa";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
const numero = (n: number, d = 0) =>
  n.toLocaleString("it-IT", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
export function FvProfiloEnergetico(
  { value, azienda, modificabile, onChange }: {
    value: AnalisiConsumiFv | null;
    azienda: boolean;
    modificabile: boolean;
    onChange: (a: AnalisiConsumiFv) => void;
  },
) {
  const a = value ?? analisiConsumiIniziale(azienda), p = a.profilo;
  const patch = (v: Partial<typeof p>) =>
    onChange({ ...a, profilo: { ...p, ...v } });
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11"
      aria-label="Profilo orario e obiettivo energetico"
    >
      <h3 className="font-semibold">Quando viene usata l’energia</h3>
      <p className="mt-1 text-sm text-slate-600">
        La simulazione usa un anno orario convenzionale. In assenza di misure
        orarie, questo profilo è un’ipotesi modificabile; ombre e limitazioni di
        rete richiedono verifica.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Profilo<select
            aria-label="Tipo profilo energetico"
            className="mt-1 block w-full rounded border p-2"
            value={p.tipo}
            disabled={!modificabile}
            onChange={(e) => patch({ tipo: e.target.value as typeof p.tipo })}
          >
            <option value="residenziale">Abitazione</option>
            <option value="azienda">Attività aziendale</option>
          </select>
        </label>
        <label className="text-sm">
          Obiettivo<select
            aria-label="Obiettivo del cliente"
            className="mt-1 block w-full rounded border p-2"
            value={a.obiettivo}
            disabled={!modificabile}
            onChange={(e) =>
              onChange({
                ...a,
                obiettivo: e.target.value as AnalisiConsumiFv["obiettivo"],
              })}
          >
            <option value="spesa">Ridurre la spesa in bolletta</option>
            <option value="autoconsumo">Aumentare l’autoconsumo</option>
            <option value="copertura">Copertura dei consumi scelta</option>
          </select>
        </label>
        {a.obiettivo === "copertura" && (
          <label className="text-sm">
            Copertura dei consumi desiderata (%)<Input
              aria-label="Copertura obiettivo percentuale"
              type="number"
              min={1}
              max={100}
              value={a.coperturaObiettivo * 100}
              disabled={!modificabile}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n > 0 && n <= 100) {
                  onChange({ ...a, coperturaObiettivo: n / 100 });
                }
              }}
            />
          </label>
        )}
        {([["oraInizio", "Inizio attività (ora)", 0, 23], [
          "oraFine",
          "Fine attività (ora)",
          1,
          24,
        ], [
          "aumentoConsumiPct",
          "Aumento futuro dei consumi (%)",
          0,
          500,
        ]] as const).map(([k, label, min, max]) => (
          <label key={k} className="text-sm">
            {label}
            <Input
              aria-label={label}
              type="number"
              min={min}
              max={max}
              value={p[k]}
              disabled={!modificabile}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= min && n <= max) {
                  patch({ [k]: n });
                }
              }}
            />
          </label>
        ))}
        <label className="text-sm">
          Carico fuori orario rispetto all’attività (%)<Input
            aria-label="Carico fuori orario percentuale"
            type="number"
            min={0}
            max={100}
            value={p.quotaFuoriOrario * 100}
            disabled={!modificabile}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 0 && n <= 100) patch({ quotaFuoriOrario: n / 100 });
            }}
          />
        </label>
        <label className="text-sm">
          Valore dell’energia immessa (€/kWh)<Input
            aria-label="Valore energia immessa"
            type="number"
            step={.001}
            min={0}
            max={2}
            value={a.prezzoImmissione}
            disabled={!modificabile}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 0 && n <= 2) onChange({ ...a, prezzoImmissione: n });
            }}
          />
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-sm">Giorni di attività</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"].map((g, i) => (
            <label key={g} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.giorni.includes(i)}
                disabled={!modificabile}
                onChange={(e) =>
                  patch({
                    giorni: e.target.checked
                      ? [...p.giorni, i]
                      : p.giorni.filter((x) => x !== i),
                  })}
              />
              {g}
            </label>
          ))}
        </div>
      </fieldset>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">
          Stagionalità dei consumi · pesi mensili
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {p.pesiMensili.map((v, i) => (
            <label key={i} className="text-xs">
              {new Intl.DateTimeFormat("it-IT", {
                month: "short",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2025, i, 1)))}
              <Input
                aria-label={`Peso consumi mese ${i + 1}`}
                type="number"
                min={0}
                max={100}
                step={.1}
                value={v}
                disabled={!modificabile}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 0 && n <= 100) {
                    patch({
                      pesiMensili: p.pesiMensili.map((x, j) => i === j ? n : x),
                    });
                  }
                }}
              />
            </label>
          ))}
        </div>
      </details>
      {p.oraFine <= p.oraInizio && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          L’orario di fine deve seguire quello di inizio.
        </p>
      )}
    </section>
  );
}
type ScenarioPatch = Pick<
  WizardData,
  | "layout_overlay"
  | "numero_pannelli_scelti"
  | "potenza_kwp"
  | "con_accumulo"
  | "capacita_accumulo_kwh"
  | "accumulo_id"
  | "analisi_consumi"
>;
export function FvScenariEnergia({
  data,
  listino,
  regoleSconto = [],
  modificabile,
  onLayout,
  onScenario,
}: {
  data: WizardData;
  listino: ListinoComponentiFv;
  regoleSconto?: DiscountRule[];
  modificabile: boolean;
  onLayout: (p: DisegnoCommercialeFv) => void;
  onScenario: (p: ScenarioPatch) => void;
}) {
  const a = data.analisi_consumi ??
      analisiConsumiIniziale(data.cliente_tipo === "azienda"),
    piano = leggiDisegnoCommerciale(data.layout_overlay),
    articolo = listino.pannelli.find((p) => p.id === data.pannello_id),
    watt = Number(articolo?.potenza_w);
  const [capacita, setCapacita] = useState<
      { firma: string; piano: DisegnoCommercialeFv } | null
    >(null),
    [errore, setErrore] = useState("");
  const firma = JSON.stringify(
    piano &&
      [
        piano.falde,
        piano.ostacoli,
        piano.modulo,
        piano.distanzaBordo,
        piano.spazioModuli,
        piano.mappa?.distanzaOstacoli,
      ],
  );
  const valida = capacita?.firma === firma ? capacita.piano : null;
  const calcola = () => {
    if (!piano) return;
    try {
      if (piano.modulo.stimato) {
        throw Error(
          "Inserisci le dimensioni reali del modulo prima di calcolare quanti pannelli entrano.",
        );
      }
      const next = disponiModuliOttimizzati(
        { ...piano, pannelli: [] },
        limiteModuliDisegno(piano),
      );
      setCapacita({ firma, piano: next });
      setErrore("");
    } catch (e) {
      setErrore(
        e instanceof Error
          ? e.message
          : "Verifica le dimensioni del modulo e le falde.",
      );
    }
  };
  const consigliata = valida
    ? consigliaModuliFv({
      massimo: valida.pannelli.length,
      watt,
      consumoAnnuo: data.consumo_annuo_kwh ?? 0,
      resaKwhKwp: stimaProduzioneFv({ ...data, potenza_kwp: 1 }),
      profilo: a.profilo,
      obiettivo: a.obiettivo,
      copertura: a.coperturaObiettivo,
      pesiProduzioneMensili: resaMappaFv(valida)?.pesiMensili,
    })
    : null;
  const batteria = listino.accumuli.find((p) => p.id === data.accumulo_id) ??
    listino.accumuli.filter((p) => Number(p.capacita_kwh) > 0).sort((x, y) =>
      Math.abs(
        Number(x.capacita_kwh) - (data.consumo_annuo_kwh ?? 0) / 365 * .5,
      ) -
      Math.abs(
        Number(y.capacita_kwh) - (data.consumo_annuo_kwh ?? 0) / 365 * .5,
      )
    )[0];
  const scenari = valida && consigliata
    ? (["consigliata", "accumulo", "massima"] as const).map((id) => {
      const quantita = id === "massima"
          ? valida.pannelli.length
          : consigliata.consigliati,
        con_accumulo = id === "accumulo",
        capacita_accumulo_kwh = con_accumulo
          ? Number(batteria?.capacita_kwh) || 0
          : 0;
      const configurazione = {
        ...data,
        ...datiDalDisegno({
          ...valida,
          pannelli: valida.pannelli.slice(0, quantita),
        }, watt),
        con_accumulo,
        capacita_accumulo_kwh,
        accumulo_id: con_accumulo && batteria ? String(batteria.id) : null,
      };
      let flussi: ReturnType<typeof simulaEnergiaFv> | null = null;
      try {
        flussi = simulaEnergiaFv({
          consumoAnnuo: data.consumo_annuo_kwh ?? 0,
          produzioneAnnua: stimaProduzioneFv(configurazione),
          batteriaKwh: capacita_accumulo_kwh,
          costoEvitabileKwh: data.costo_kwh_attuale ?? 0,
          prezzoImmissione: a.prezzoImmissione,
          profilo: a.profilo,
          pesiProduzioneMensili: resaMappaFv(configurazione.layout_overlay)
            ?.pesiMensili,
        });
      } catch { /* Il messaggio nel riepilogo indica i dati da completare. */ }
      const righe = righeComponentiFv(configurazione, listino),
        prezziConfermati = !!data.inverter_id &&
          righe.length >= (con_accumulo ? 3 : 2) && righe.every((r) =>
            r.prezzo_unitario_vendita > 0
          ) && (!con_accumulo || !!batteria);
      const prezzo = prezziConfermati
        ? anteprimaFotovoltaico(configurazione, {
          listino,
          regoleSconto,
          impiantoConfigurato: true,
        }).totaleDocumento
        : null;
      const posaValorizzata = data.prezzo_vendita_manuale! > 0 ||
        data.manodopera_righe.some((r) =>
          r.ore > 0 && r.tariffa_oraria_vendita > 0
        );
      const beneficio = flussi
        ? (data.costo_kwh_attuale != null
          ? flussi.risparmioAcquisti + flussi.ricaviImmissione
          : null)
        : null;
      return {
        id,
        configurazione,
        flussi,
        prezzo,
        beneficio,
        posaValorizzata,
        rientro: posaValorizzata && prezzo && beneficio && beneficio > 0
          ? prezzo / beneficio
          : null,
      };
    })
    : [];
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11"
      aria-label="Capienza del tetto e scenari energetici"
    >
      <h3 className="font-semibold">
        Spazio disponibile e impianto consigliato
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        La capienza deriva dai moduli che entrano nelle falde, provando posa
        verticale e orizzontale. La proposta è una ricerca limitata di griglie,
        da verificare nel sopralluogo.
      </p>
      {piano
        ? (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Lato corto reale del modulo (m)<Input
                  aria-label="Lato corto reale modulo"
                  type="number"
                  min={.5}
                  max={1.6}
                  step={.001}
                  disabled={!modificabile}
                  value={piano.modulo.corto}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= .5 && n <= 1.6) {
                      onLayout({
                        ...piano,
                        modulo: { ...piano.modulo, corto: n, stimato: true },
                      });
                    }
                  }}
                />
              </label>
              <label className="text-sm">
                Lato lungo reale del modulo (m)<Input
                  aria-label="Lato lungo reale modulo"
                  type="number"
                  min={.8}
                  max={3.2}
                  step={.001}
                  disabled={!modificabile}
                  value={piano.modulo.lungo}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= .8 && n <= 3.2) {
                      onLayout({
                        ...piano,
                        modulo: { ...piano.modulo, lungo: n, stimato: true },
                      });
                    }
                  }}
                />
              </label>
            </div>
            {piano.modulo.stimato && (
              <p className="mt-2 text-sm text-amber-800">
                Dimensioni da verificare: controlla entrambi i lati nella scheda
                del modulo.{" "}
                <button
                  type="button"
                  className="underline"
                  disabled={!modificabile}
                  onClick={() =>
                    onLayout({
                      ...piano,
                      modulo: { ...piano.modulo, stimato: false },
                    })}
                >
                  Confermo entrambe le dimensioni
                </button>
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={!modificabile || !(watt > 0) || piano.modulo.stimato}
              onClick={calcola}
            >
              Calcola disposizione pannelli
            </Button>
            {!(watt > 0) && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                Seleziona un modulo con potenza Wp dal catalogo per calcolare la
                disposizione.
              </p>
            )}
            {valida && !consigliata && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                Completa consumo annuo, stima di produzione e profilo orario per
                ottenere una potenza consigliata.
              </p>
            )}
            {capacita && !valida && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                Geometria o modulo cambiati: ricalcola la capienza. Il layout
                attuale resta da verificare.
              </p>
            )}
            {valida && (
              <>
                <p className="mt-3">
                  <strong>
                    Potenza massima installabile proposta:{" "}
                    {numero(valida.pannelli.length * watt / 1000, 2)} kWp
                  </strong>{" "}
                  · {valida.pannelli.length} pannelli fisicamente collocati.
                </p>
                <p className="mt-1 text-sm">
                  {valida.falde.map((f) =>
                    `${f.nome}: ${
                      valida.pannelli.filter((p) => p.faldaId === f.id).length
                    } pannelli`
                  ).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Area occupata dai moduli: {numero(
                    valida.pannelli.length * valida.modulo.corto *
                      valida.modulo.lungo,
                    1,
                  )}{" "}
                  m² sulla falda, dopo i distacchi. La parte libera residua può
                  non contenere un altro modulo.
                </p>
              </>
            )}
            {consigliata && (
              <p className="mt-3">
                <strong>
                  Potenza consigliata:{" "}
                  {numero(consigliata.consigliati * watt / 1000, 2)} kWp
                </strong>. {consigliata.criterio}{" "}
                {!consigliata.obiettivoRaggiungibile &&
                  "Con lo spazio e il profilo attuali l’obiettivo non è raggiunto."}
              </p>
            )}
            {scenari.length > 0 && (
              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                {scenari.map((s) => (
                  <article
                    key={s.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <h4 className="font-semibold">
                      {s.id === "consigliata"
                        ? "Consigliata"
                        : s.id === "accumulo"
                        ? "Con accumulo"
                        : "Massima potenza"}
                    </h4>
                    <p className="mt-2 text-sm">
                      {s.configurazione.numero_pannelli_scelti} pannelli ·{" "}
                      {numero(s.configurazione.potenza_kwp, 2)} kWp ·{" "}
                      {numero(s.configurazione.capacita_accumulo_kwh, 1)}{" "}
                      kWh accumulo
                    </p>
                    {s.flussi
                      ? (
                        <dl className="mt-2 space-y-1 text-xs">
                          {[[
                            "Produzione annua",
                            `${numero(s.flussi.produzione)} kWh`,
                          ], [
                            "Energia autoconsumata",
                            `${numero(s.flussi.autoconsumo)} kWh`,
                          ], [
                            "Energia immessa",
                            `${numero(s.flussi.immessa)} kWh`,
                          ], [
                            "Energia ancora acquistata",
                            `${numero(s.flussi.acquistata)} kWh`,
                          ], [
                            "Consumi coperti",
                            `${numero(s.flussi.coperturaConsumi * 100)}%`,
                          ], [
                            "Produzione utilizzata dal cliente",
                            `${numero(s.flussi.quotaProduzioneUsata * 100)}%`,
                          ], [
                            "Risparmio sugli acquisti",
                            data.costo_kwh_attuale == null
                              ? "Costo evitabile da confermare"
                              : eur(s.flussi.risparmioAcquisti),
                          ], [
                            "Valore immissioni",
                            eur(s.flussi.ricaviImmissione),
                          ], [
                            "Costo voci inserite",
                            s.prezzo == null
                              ? "Componenti o prezzi da confermare"
                              : eur(s.prezzo),
                          ], [
                            "Rientro semplice",
                            s.rientro == null
                              ? "Dati insufficienti"
                              : `${numero(s.rientro, 1)} anni`,
                          ]].map(([k, v]) => (
                            <div
                              key={k}
                              className="flex flex-wrap justify-between gap-2"
                            >
                              <dt>{k}</dt>
                              <dd className="font-medium">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )
                      : (
                        <p className="mt-2 text-sm text-amber-800">
                          Completa consumi, produzione e profilo orario per
                          confrontare il beneficio.
                        </p>
                      )}
                    {!s.posaValorizzata && (
                      <p className="mt-2 text-xs text-amber-800">
                        Posa da valorizzare: aggiungi le lavorazioni o un prezzo
                        a corpo completo prima di stimare il rientro.
                      </p>
                    )}
                    {s.id === "accumulo" && !batteria && (
                      <p className="mt-2 text-xs text-amber-800">
                        Aggiungi un accumulo al catalogo aziendale.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant={a.scenario === s.id ? "default" : "outline"}
                      className="mt-3"
                      disabled={!modificabile ||
                        s.configurazione.numero_pannelli_scelti < 1 ||
                        (s.id === "accumulo" && !batteria)}
                      onClick={() =>
                        onScenario({
                          layout_overlay: s.configurazione.layout_overlay,
                          numero_pannelli_scelti:
                            s.configurazione.numero_pannelli_scelti,
                          potenza_kwp: s.configurazione.potenza_kwp,
                          con_accumulo: s.configurazione.con_accumulo,
                          capacita_accumulo_kwh:
                            s.configurazione.capacita_accumulo_kwh,
                          accumulo_id: s.configurazione.accumulo_id,
                          analisi_consumi: { ...a, scenario: s.id },
                        })}
                    >
                      Usa questa configurazione
                    </Button>
                  </article>
                ))}
              </div>
            )}
            {!!pannelliDaRivedere(piano).length && (
              <p role="alert" className="mt-3 text-sm text-amber-800">
                Controlla i pannelli evidenziati nell’editor prima di confermare
                il preventivo.
              </p>
            )}
          </>
        )
        : (
          <p className="mt-3 text-sm text-slate-600">
            Disegna le falde nella fase Tetto per confrontare lo spazio
            disponibile. Puoi comunque configurare manualmente un impianto con
            misure rilevate.
          </p>
        )}
      {errore && (
        <p role="alert" className="mt-3 text-sm text-red-700">{errore}</p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Risultati indicativi su profilo orario sintetico: accumulo con capacità
        utile del 90% e rendimento di ciclo del 90%. Rientro semplice senza
        incentivi, interessi e manutenzione. Inverter, accessori e lavorazioni
        restano da confermare nel preventivo.
      </p>
    </section>
  );
}
