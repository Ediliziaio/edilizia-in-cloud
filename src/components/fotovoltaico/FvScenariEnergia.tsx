import { useMemo, useState } from "react";
import { FvConfrontoConfigurazioni } from "./FvConfrontoConfigurazioni";
import { proposteImpiantoFv, type PropostaImpiantoFv } from "@/lib/fotovoltaico/proposteImpianto";
import { leggiPiano } from "../../../supabase/functions/_shared/fvPianoTetto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  aggiornaConsumiAggiuntiviFv,
  type AnalisiConsumiFv,
  analisiConsumiIniziale,
} from "../../../supabase/functions/_shared/fvBollette";
import {
  type DisegnoCommercialeFv,
  disponiModuliOttimizzati,
  leggiDisegnoCommerciale,
  limiteModuliDisegno,
  pannelliDaRivedere,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import {
  type ListinoComponentiFv,
} from "@/lib/fotovoltaico/componentiConfigurazione";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
const numero = (n: number, d = 0) =>
  n.toLocaleString(intlCampo(), {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const PROFILI_RAPIDI_FV = [
  {
    id: "casa_giorno",
    nome: "Casa · anche di giorno",
    tipo: "residenziale" as const,
    giorni: [0, 1, 2, 3, 4, 5, 6],
    oraInizio: 7,
    oraFine: 23,
    quotaFuoriOrario: .3,
  },
  {
    id: "casa_sera",
    nome: "Casa · soprattutto la sera",
    tipo: "residenziale" as const,
    giorni: [0, 1, 2, 3, 4, 5, 6],
    oraInizio: 18,
    oraFine: 24,
    quotaFuoriOrario: .25,
  },
  {
    id: "ufficio",
    nome: "Attività · lun–ven, 8–18",
    tipo: "azienda" as const,
    giorni: [1, 2, 3, 4, 5],
    oraInizio: 8,
    oraFine: 18,
    quotaFuoriOrario: .12,
  },
  {
    id: "negozio",
    nome: "Attività · tutti i giorni, 8–20",
    tipo: "azienda" as const,
    giorni: [0, 1, 2, 3, 4, 5, 6],
    oraInizio: 8,
    oraFine: 20,
    quotaFuoriOrario: .2,
  },
];
export function FvProfiloEnergetico(
  { value, azienda, modificabile, onChange, consumoAnnuo }: {
    value: AnalisiConsumiFv | null;
    azienda: boolean;
    modificabile: boolean;
    onChange: (a: AnalisiConsumiFv) => void;
    consumoAnnuo?: number | null;
  },
) {
  const t = useT();
  const a = value ?? analisiConsumiIniziale(azienda), p = a.profilo;
  const patch = (v: Partial<typeof p>) =>
    onChange({ ...a, profilo: { ...p, ...v } });
  const selezionato =
    PROFILI_RAPIDI_FV.find((r) =>
      r.tipo === p.tipo && r.oraInizio === p.oraInizio &&
      r.oraFine === p.oraFine && r.quotaFuoriOrario === p.quotaFuoriOrario &&
      [...r.giorni].sort().join() === [...p.giorni].sort().join()
    )?.id ?? "personalizzato";
  const aggiunte = a.consumiAggiuntivi ?? [],
    base = consumoAnnuo ?? a.correzioni.consumoAnnuo ?? 0;
  const cambiaAggiunte = (
    righe: NonNullable<AnalisiConsumiFv["consumiAggiuntivi"]>,
  ) => {
    const next = {
      ...a,
      consumiAggiuntivi: righe,
      profilo: { ...p, aumentoConsumiPct: 0 },
    };
    onChange(aggiornaConsumiAggiuntiviFv(next, base));
  };
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11"
      aria-label={t("Profilo orario e obiettivo energetico")}
    >
      <h3 className="text-lg font-semibold text-slate-900">
        {t("Due scelte per personalizzare la proposta")}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t("Quando si usa l’energia?")}
          <select
            aria-label={t("Utilizzo rapido dell’energia")}
            className="mt-1 w-full rounded-lg border p-2"
            disabled={!modificabile}
            value={selezionato}
            onChange={(e) => {
              const r = PROFILI_RAPIDI_FV.find((x) => x.id === e.target.value);
              if (r) {
                patch({
                  tipo: r.tipo,
                  giorni: r.giorni,
                  oraInizio: r.oraInizio,
                  oraFine: r.oraFine,
                  quotaFuoriOrario: r.quotaFuoriOrario,
                });
              }
            }}
          >
            {PROFILI_RAPIDI_FV.map((r) => (
              <option key={r.id} value={r.id}>{t(r.nome)}</option>
            ))}
            {selezionato === "personalizzato" && (
              <option value="personalizzato">{t("Orari personalizzati")}</option>
            )}
          </select>
        </label>
        <label className="text-sm">
          {t("Cosa conta per il cliente?")}
          <select
            aria-label={t("Obiettivo del cliente")}
            className="mt-1 w-full rounded-lg border p-2"
            value={a.obiettivo}
            disabled={!modificabile}
            onChange={(e) =>
              onChange({
                ...a,
                obiettivo: e.target.value as AnalisiConsumiFv["obiettivo"],
              })}
          >
            <option value="spesa">{t("Ridurre la spesa in bolletta")}</option>
            <option value="autoconsumo">{t("Usare più energia prodotta")}</option>
            <option value="copertura">{t("Coprire una quota dei consumi")}</option>
          </select>
        </label>
        {a.obiettivo === "copertura" && (
          <label className="text-sm">
            {t("Copertura desiderata (%)")}<Input
              aria-label={t("Copertura obiettivo percentuale")}
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
      </div>
      <fieldset className="mt-4 border-t border-slate-100 pt-4">
        <legend className="text-sm font-medium text-slate-800">
          {t("Il cliente prevede nuovi consumi?")}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[{ id: "auto", nome: "Auto elettrica", kwhAnnui: 1800 }, {
            id: "pompa",
            nome: "Pompa di calore",
            kwhAnnui: 3000,
          }].map((v) => {
            const presente = aggiunte.some((x) => x.id === v.id);
            return (
              <Button
                key={v.id}
                type="button"
                variant={presente ? "default" : "outline"}
                aria-pressed={presente}
                disabled={!modificabile || !(base > 0)}
                onClick={() =>
                  cambiaAggiunte(
                    presente
                      ? aggiunte.filter((x) => x.id !== v.id)
                      : [...aggiunte, v],
                  )}
              >
                {presente ? "✓ " : "+ "}
                {v.nome}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            disabled={!modificabile || !(base > 0) || aggiunte.length >= 8}
            onClick={() =>
              cambiaAggiunte([...aggiunte, {
                id: crypto.randomUUID(),
                nome: "Altro consumo",
                kwhAnnui: 1000,
              }])}
          >
            {t("+ Altro consumo")}
          </Button>
        </div>
        {aggiunte.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              {t("Ipotesi modificabili, aggiunte ai consumi della bolletta. Auto: esempio 10.000 km/anno × 0,18 kWh/km; pompa di calore: 3.000 kWh/anno da verificare.")}
            </p>
            {aggiunte.map((v, i) => (
              <div key={v.id} className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">
                  {v.nome} {t("· kWh/anno")}<Input
                    aria-label={t("Consumo aggiuntivo {nome} {i}", { nome: String(v.nome ?? ""), i: i + 1 })}
                    type="number"
                    min={0}
                    max={1000000}
                    value={v.kwhAnnui}
                    disabled={!modificabile}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 0 && n <= 1e6) {
                        cambiaAggiunte(aggiunte.map((x) =>
                          x.id === v.id ? { ...x, kwhAnnui: n } : x
                        ));
                      }
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!modificabile}
                  aria-label={t("Rimuovi {nome} {i}", { nome: String(v.nome ?? ""), i: i + 1 })}
                  onClick={() =>
                    cambiaAggiunte(aggiunte.filter((x) =>
                      x.id !== v.id
                    ))}
                >
                  {t("Rimuovi")}
                </Button>
              </div>
            ))}
            <p className="text-sm font-medium text-slate-800">
              {t("Consumo futuro:")} {numero(
                base + aggiunte.reduce((s, x) => s + x.kwhAnnui, 0),
              )} {t("kWh/anno")}
            </p>
          </div>
        )}
      </fieldset>
      <details className="mt-4 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          {t("Personalizza orari e ipotesi di calcolo")}
        </summary>
        <p className="mt-3 text-xs text-slate-500">
          {t("In assenza di misure orarie, il profilo è un’ipotesi di utilizzo. La bolletta determina i consumi totali.")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                    onChange({
                      ...a,
                      ...(k === "aumentoConsumiPct"
                        ? { consumiAggiuntivi: [] }
                        : {}),
                      profilo: { ...p, [k]: n },
                    });
                  }
                }}
              />
            </label>
          ))}
          <label className="text-sm">
            {t("Carico fuori orario (%)")}<Input
              aria-label={t("Carico fuori orario percentuale")}
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
            {t("Valore energia immessa (€/kWh)")}<Input
              aria-label={t("Valore energia immessa")}
              type="number"
              min={0}
              max={2}
              step={.001}
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
          <legend className="text-sm">{t("Giorni di attività")}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"].map((g, i) => (
              <label
                key={g}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
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
            {t("Stagionalità dei consumi · pesi mensili")}
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {p.pesiMensili.map((v, i) => (
              <label key={i} className="text-xs">
                {new Intl.DateTimeFormat(intlCampo(), {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2025, i, 1)))}
                <Input
                  aria-label={t("Peso consumi mese {i}", { i: i + 1 })}
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
                        pesiMensili: p.pesiMensili.map((x, j) =>
                          i === j ? n : x
                        ),
                      });
                    }
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      </details>
      {(p.oraFine <= p.oraInizio || p.aumentoConsumiPct > 500) && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {p.aumentoConsumiPct > 500
            ? t("Verifica i nuovi consumi: superano di oltre cinque volte il consumo attuale.")
            : t("L’orario di fine deve seguire quello di inizio.")}
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
  | "prezzo_vendita_manuale"
  | "prodotti_extra"
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
  const t = useT();
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
  const senzaMappa = !piano && !leggiPiano(data.layout_overlay);
  const confronto = useMemo(() => (valida || senzaMappa) ? proposteImpiantoFv(data, listino, regoleSconto, valida) : null,
    [data, listino, regoleSconto, valida, senzaMappa]);
  const applica = (s: PropostaImpiantoFv) => onScenario({
    layout_overlay: s.configurazione.layout_overlay,
    numero_pannelli_scelti: s.configurazione.numero_pannelli_scelti,
    potenza_kwp: s.configurazione.potenza_kwp,
    con_accumulo: s.configurazione.con_accumulo,
    capacita_accumulo_kwh: s.configurazione.capacita_accumulo_kwh,
    accumulo_id: s.configurazione.accumulo_id,
    analisi_consumi: { ...a, scenario: s.id },
    prezzo_vendita_manuale: s.configurazione.prezzo_vendita_manuale,
    prodotti_extra: s.configurazione.prodotti_extra,
  });
  const schede = confronto && <FvConfrontoConfigurazioni confronto={confronto} modificabile={modificabile} pannelliSalvati={piano?.pannelli.length ?? 0} selezionata={a.scenario} onScegli={applica} />;
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11"
      aria-label={t("Capienza del tetto e scenari energetici")}
    >
      <h3 className="font-semibold">
        {t("Spazio disponibile e impianto consigliato")}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {piano ? t("La capienza deriva dai moduli che entrano nelle falde, provando posa verticale e orizzontale. La proposta è una ricerca limitata di griglie, da verificare nel sopralluogo.") : t("Confronta quantità, consumo nelle diverse ore e prezzi delle voci inserite. Il riferimento energetico annuo non coincide necessariamente con la taglia più conveniente.")}
      </p>
      {piano
        ? (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                {t("Lato corto reale del modulo (m)")}<Input
                  aria-label={t("Lato corto reale modulo")}
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
                {t("Lato lungo reale del modulo (m)")}<Input
                  aria-label={t("Lato lungo reale modulo")}
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
                {t("Dimensioni da verificare: controlla entrambi i lati nella scheda del modulo.")}{" "}
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
                  {t("Confermo entrambe le dimensioni")}
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
              {t("Calcola disposizione pannelli")}
            </Button>
            {!(watt > 0) && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                {t("Seleziona un modulo con potenza Wp dal catalogo per calcolare la disposizione.")}
              </p>
            )}
            {valida && !confronto && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                {t("Completa consumo annuo, stima di produzione e profilo orario per ottenere una potenza consigliata.")}
              </p>
            )}
            {capacita && !valida && (
              <p role="status" className="mt-2 text-sm text-amber-800">
                {t("Geometria o modulo cambiati: ricalcola la capienza. Il layout attuale resta da verificare.")}
              </p>
            )}
            {valida && (
              <>
                <p className="mt-3">
                  <strong>{t("Potenza massima installabile proposta: {valore} kWp", { valore: String(numero(valida.pannelli.length * watt / 1000, 2) ?? "") })}</strong>{" "}
                  · {t("{n} pannelli fisicamente collocati.", { n: valida.pannelli.length })}
                </p>
                <p className="mt-1 text-sm">
                  {valida.falde.map((f) =>
                    `${f.nome}: ${
                      valida.pannelli.filter((p) => p.faldaId === f.id).length
                    } pannelli`
                  ).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">{t("Area occupata dai moduli: {valore} m² sulla falda, dopo i distacchi. La parte libera residua può non contenere un altro modulo.", { valore: String(numero(
                    valida.pannelli.length * valida.modulo.corto *
                      valida.modulo.lungo,
                    1,
                  ) ?? "") })}</p>
              </>
            )}
            {schede}
            {!!pannelliDaRivedere(piano).length && (
              <p role="alert" className="mt-3 text-sm text-amber-800">
                {t("Controlla i pannelli evidenziati nell’editor prima di confermare il preventivo.")}
              </p>
            )}
          </>
        )
        : (
          <div>
            <p className="mt-3 text-sm text-slate-600">{t("Disegna le falde nella fase Tetto per verificare lo spazio disponibile. Prima del disegno puoi confrontare le taglie usando consumi, orari e catalogo.")}</p>
            {schede || <p role="status" className="mt-3 text-sm text-amber-800">{t("Completa consumo annuo, modello di pannello e stima solare per ottenere le proposte.")}</p>}
          </div>
        )}
      {errore && (
        <p role="alert" className="mt-3 text-sm text-red-700">{errore}</p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {t("Risultati indicativi su profilo orario sintetico: accumulo con capacità utile del 90% e rendimento di ciclo del 90%. Rientro semplice senza incentivi, interessi e manutenzione. Inverter, accessori e lavorazioni restano da confermare nel preventivo.")}
      </p>
    </section>
  );
}
