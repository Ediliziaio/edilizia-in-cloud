import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import {
  type AnalisiConsumiFv,
  analisiConsumiIniziale,
  CAMPI_NUMERO_BOLLETTA,
  CAMPI_TESTO_BOLLETTA,
  type CampoBollettaFv,
  type DatiBollettaFv,
  leggiAnalisiConsumi,
  riepilogoBollette,
  selezionaFornituraFv,
  validaLetturaBolletta,
} from "../../../supabase/functions/_shared/fvBollette";

const LABEL: Record<CampoBollettaFv, string> = {
  intestatario: "Intestatario / ragione sociale",
  codice_fiscale: "Codice fiscale",
  partita_iva: "Partita IVA",
  pod: "POD",
  fornitore: "Fornitore",
  indirizzo_fornitura: "Indirizzo di fornitura",
  uso: "Uso domestico o aziendale",
  periodo_dal: "Periodo dal",
  periodo_al: "Periodo al",
  tipo_lettura: "Lettura effettiva o stimata",
  potenza_impegnata_kw: "Potenza impegnata (kW)",
  potenza_disponibile_kw: "Potenza disponibile (kW)",
  potenza_massima_kw: "Potenza massima rilevata (kW)",
  consumo_periodo_kwh: "Consumo del periodo (kWh)",
  consumo_annuo_kwh: "Consumo annuo dichiarato (kWh)",
  f1_kwh: "Consumi F1 (kWh)",
  f2_kwh: "Consumi F2 (kWh)",
  f3_kwh: "Consumi F3 (kWh)",
  totale_da_pagare: "Totale da pagare (€)",
  spesa_fornitura: "Spesa per la fornitura (€)",
  quote_fisse: "Quote fisse del periodo (€)",
  quote_consumi: "Quote legate ai consumi (€)",
  quote_potenza: "Quote potenza del periodo (€)",
  imposte: "Imposte (€)",
  iva: "IVA (€)",
  spesa_annua: "Spesa annua dichiarata (€)",
  canone_tv: "Canone TV (€)",
  depositi: "Depositi (€)",
  arretrati: "Arretrati (€)",
  conguagli: "Conguagli (€)",
  bonus: "Bonus (€)",
  crediti: "Crediti (€)",
};
const PRINCIPALI: CampoBollettaFv[] = [
  "pod",
  "intestatario",
  "indirizzo_fornitura",
  "periodo_dal",
  "periodo_al",
  "consumo_periodo_kwh",
  "consumo_annuo_kwh",
  "totale_da_pagare",
  "quote_fisse",
  "spesa_annua",
];
const euro = (n: number | null) =>
  n == null
    ? "da verificare"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })
      .format(n);
type Props = {
  progettoId?: string | null;
  value: AnalisiConsumiFv | null;
  azienda: boolean;
  modificabile: boolean;
  onChange: (a: AnalisiConsumiFv) => void;
  onApplica: (a: { consumo: number; costoEvitabile: number | null }) => void;
  onIndirizzo: (indirizzo: string) => void;
};
export function FvBolletteConsumi(
  {
    progettoId,
    value,
    azienda,
    modificabile,
    onChange,
    onApplica,
    onIndirizzo,
  }: Props,
) {
  const companyId = useEffectiveCompanyId(),
    a = value ?? analisiConsumiIniziale(azienda),
    [caricando, setCaricando] = useState(false),
    [errore, setErrore] = useState(""),
    [selezione, setSelezione] = useState(""),
    [url, setUrl] = useState<string | null>(null),
    [pagina, setPagina] = useState(1),
    [anteprimaErrore, setAnteprimaErrore] = useState(""),
    [tentativoAnteprima, setTentativoAnteprima] = useState(0);
  const interruzione = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null),
    attivo = useRef(true),
    corrente = useRef(a);
  useEffect(() => {
    corrente.current = a;
  }, [a]);
  useEffect(() => {
    attivo.current = true;
    return () => {
      attivo.current = false;
      interruzione.current?.abort();
    };
  }, []);
  const doc = a.documenti.find((d) => d.id === selezione) ?? a.documenti[0],
    riepilogo = riepilogoBollette(a),
    pods = [
      ...new Set(
        a.documenti.map((d) => d.dati.pod).filter((p): p is string => !!p),
      ),
    ];
  const documentoPath = doc?.path;
  useEffect(() => {
    let corrente = true, u: string | undefined;
    if (!documentoPath) return;
    void (async () => {
      await Promise.resolve();
      if (!corrente) return;
      setUrl(null);
      setAnteprimaErrore("");
      setPagina(1);
      try {
        const { data, error } = await supabase.storage.from("fv-bollette")
          .download(documentoPath);
        if (error || !data) {
          throw Error(
            "Anteprima non disponibile. Verifica l’accesso al documento e riprova.",
          );
        }
        u = URL.createObjectURL(data);
        if (corrente) setUrl(u);
        else URL.revokeObjectURL(u);
      } catch (e) {
        if (corrente) {
          setAnteprimaErrore(
            e instanceof Error ? e.message : "Anteprima non disponibile.",
          );
        }
      }
    })();
    return () => {
      corrente = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [documentoPath, tentativoAnteprima]);
  const aggiornaDocumento = (patch: Partial<DatiBollettaFv>) => {
    if (!doc || !modificabile) return;
    onChange({
      ...a,
      documenti: a.documenti.map((d) =>
        d.id === doc.id
          ? { ...d, dati: { ...d.dati, ...patch }, confermato: false }
          : d
      ),
    });
  };
  const confermaDocumento = () => {
    if (!doc) return;
    const dati = validaLetturaBolletta(doc.dati, doc.pagine_totali);
    const invalidi = [...CAMPI_TESTO_BOLLETTA, ...CAMPI_NUMERO_BOLLETTA].filter(
      (k) => doc.dati[k] != null && dati[k] == null,
    );
    if (
      invalidi.length ||
      dati.storico_mensile.length !== doc.dati.storico_mensile.length
    ) {
      setErrore(
        `Correggi i campi prima di confermare: ${
          invalidi.length
            ? invalidi.map((k) => LABEL[k]).join(", ")
            : "mesi dello storico"
        }.`,
      );
      return;
    }
    setErrore("");
    onChange({
      ...a,
      documenti: a.documenti.map((d) =>
        d.id === doc.id ? { ...d, dati, confermato: !d.confermato } : d
      ),
    });
  };
  const campo = (k: CampoBollettaFv) => {
    if (!doc) return null;
    const numero = (CAMPI_NUMERO_BOLLETTA as readonly string[]).includes(k),
      origine = doc.dati.pagine[k];
    return (
      <div key={k} className="block text-xs text-slate-700">
        <div className="flex flex-wrap items-center">
          <label htmlFor={`fv-bolletta-${doc.id}-${k}`}>{LABEL[k]}</label>
          {origine && (
            <button
              type="button"
              className="ml-2 underline text-sky-700"
              onClick={() => setPagina(origine)}
            >
              pagina {origine}
            </button>
          )}
        </div>
        <Input
          id={`fv-bolletta-${doc.id}-${k}`}
          aria-label={LABEL[k]}
          className="mt-1"
          type={numero ? "number" : k.startsWith("periodo_") ? "date" : "text"}
          step={numero ? "any" : undefined}
          value={doc.dati[k] ?? ""}
          disabled={!modificabile}
          onChange={(e) =>
            aggiornaDocumento({
              [k]: e.target.value === ""
                ? null
                : numero
                ? Number(e.target.value)
                : e.target.value,
            } as Partial<DatiBollettaFv>)}
        />
        {doc.estratti[k] !== doc.dati[k] && (
          <span className="mt-1 block text-amber-700">
            Corretto dall’operatore · estratto:{" "}
            {String(doc.estratti[k] ?? "assente")}
          </span>
        )}
        {doc.dati[k] == null && (
          <span className="mt-1 block text-slate-500">
            Dato non rilevato nel documento
          </span>
        )}
      </div>
    );
  };
  const carica = async (files: File[]) => {
    if (!modificabile || caricando) return;
    if (!companyId || !progettoId) {
      setErrore("Salva cliente e immobile prima di caricare le bollette.");
      return;
    }
    if (files.length > 12 || a.documenti.length + files.length > 60) {
      setErrore(
        "Carica al massimo 12 file per volta, fino a 60 letture per preventivo.",
      );
      return;
    }
    const accettati = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    if (
      files.some((f) =>
        !accettati.has(f.type) || !f.size || f.size > 20 * 1024 * 1024
      )
    ) {
      setErrore(
        "Ogni documento deve essere un PDF, PNG, JPG o WebP fino a 20 MB.",
      );
      return;
    }
    setCaricando(true);
    setErrore("");
    try {
      for (const f of files) {
        if (!attivo.current) break;
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (corrente.current.documenti.some((d) => d.hash === hash)) {
          setErrore(`${f.name}: documento già presente, lettura non ripetuta.`);
          continue;
        }
        const est = f.type === "application/pdf"
            ? "pdf"
            : f.type === "image/jpeg"
            ? "jpg"
            : f.type === "image/png"
            ? "png"
            : "webp",
          path = `${companyId}/${progettoId}/${hash}.${est}`;
        const { error: uploadError } = await supabase.storage.from(
          "fv-bollette",
        ).upload(path, f, { contentType: f.type, upsert: false });
        if (
          uploadError &&
          String((uploadError as { statusCode?: string }).statusCode) !== "409"
        ) {
          throw Error(
            "Caricamento non riuscito. Verifica accesso e connessione, poi riprova.",
          );
        }
        if (!attivo.current) break;
        const controller = new AbortController();
        interruzione.current = controller;
        const timeout = setTimeout(() => controller.abort(), 125000);
        let lettura;
        try {
          lettura = await supabase.functions.invoke("fv-leggi-bolletta", {
            body: { progetto_id: progettoId, path, nome: f.name.slice(0, 200) },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        if (lettura.error) {
          throw Error(
            await edgeErrorMessage(
              lettura.error,
              "Lettura non riuscita: puoi continuare con l’inserimento manuale.",
            ),
          );
        }
        const validata = leggiAnalisiConsumi({
          ...analisiConsumiIniziale(azienda),
          documenti: lettura.data?.documenti,
        });
        if (!validata?.documenti.length) {
          throw Error(
            "I dati estratti non sono validi. Verifica il documento o compila i consumi manualmente.",
          );
        }
        if (!attivo.current) break;
        const current = corrente.current;
        if (current.documenti.length + validata.documenti.length > 60) {
          throw Error(
            "Questo documento supera il limite di 60 letture: separa i POD in progetti diversi.",
          );
        }
        const next = {
          ...current,
          documenti: [...current.documenti, ...validata.documenti],
          podSelezionato: current.podSelezionato ||
            validata.documenti[0].dati.pod || "",
          proiezioneConfermata: false,
        };
        corrente.current = next;
        onChange(next);
        setSelezione(validata.documenti[0].id);
      }
    } catch (e) {
      if (attivo.current) {
        setErrore(
          e instanceof Error
            ? e.message
            : "Caricamento non riuscito. Puoi compilare i dati manualmente.",
        );
      }
    } finally {
      if (attivo.current) setCaricando(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11"
      aria-label="Bollette e dati confermati della fornitura"
      aria-busy={caricando}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Consumi reali dalla bolletta</h3>
          <p className="mt-1 text-sm text-slate-600">
            PDF anche multipagina, scansioni e foto PNG/JPG/WebP · massimo 20 MB
            per file. Lettura AI con i crediti aziendali; puoi sempre compilare
            i campi manualmente.
          </p>
        </div>
        <Button
          type="button"
          disabled={!modificabile || caricando || !progettoId}
          onClick={() => input.current?.click()}
        >
          {caricando ? "Lettura bollette in corso…" : "Carica bolletta"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          multiple
          hidden
          aria-label="Scegli bollette"
          onChange={(e) => void carica(Array.from(e.target.files ?? []))}
        />
      </div>
      {caricando && (
        <p role="status" className="mt-3 text-sm">
          Leggo i documenti uno alla volta. I valori saranno da verificare prima
          dell’importazione.
        </p>
      )}
      {errore && (
        <p role="alert" className="mt-3 text-sm text-red-700">{errore}</p>
      )}
      {!!a.documenti.length && (
        <>
          <div className="my-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Documento da verificare<select
                aria-label="Documento bolletta"
                className="mt-1 w-full rounded border p-2"
                value={doc?.id ?? ""}
                onChange={(e) => setSelezione(e.target.value)}
              >
                {a.documenti.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome} · {d.dati.pod ?? "POD da verificare"}
                    {d.confermato ? " · confermato" : " · da verificare"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Fornitura usata dal preventivo<select
                aria-label="POD del preventivo"
                className="mt-1 w-full rounded border p-2"
                disabled={!modificabile}
                value={a.podSelezionato}
                onChange={(e) =>
                  onChange(selezionaFornituraFv(a, e.target.value))}
              >
                <option value="">Seleziona POD</option>
                {pods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          {doc && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  {anteprimaErrore && (
                    <p role="alert" className="text-sm text-amber-800">
                      {anteprimaErrore}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setTentativoAnteprima((v) =>
                            v + 1
                          )}
                      >
                        Riprova anteprima
                      </button>
                    </p>
                  )}
                  {url && (doc.mime === "application/pdf"
                    ? (
                      <iframe
                        title={`Bolletta ${doc.nome}`}
                        src={`${url}#page=${pagina}`}
                        className="h-[540px] w-full rounded border"
                      />
                    )
                    : (
                      <img
                        src={url}
                        alt={`Bolletta ${doc.nome}`}
                        className="max-h-[540px] w-full object-contain"
                      />
                    ))}
                </div>
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PRINCIPALI.map(campo)}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Potenza, fasce e altre voci della bolletta
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[...CAMPI_TESTO_BOLLETTA, ...CAMPI_NUMERO_BOLLETTA]
                        .filter((k) => !PRINCIPALI.includes(k)).map(campo)}
                    </div>
                    <fieldset className="mt-3">
                      <legend className="text-sm">
                        Storico mensile da verificare
                      </legend>
                      <div className="mt-2 grid gap-2">
                        {doc.dati.storico_mensile.map((r, i) => (
                          <div
                            key={`${doc.id}-${i}`}
                            className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                          >
                            <label className="text-xs">
                              Mese<Input
                                aria-label={`Mese storico ${i + 1}`}
                                type="month"
                                value={r.mese}
                                disabled={!modificabile}
                                onChange={(e) =>
                                  aggiornaDocumento({
                                    storico_mensile: doc.dati.storico_mensile
                                      .map((v, j) =>
                                        i === j
                                          ? { ...v, mese: e.target.value }
                                          : v
                                      ),
                                  })}
                              />
                            </label>
                            <label className="text-xs">
                              kWh<Input
                                aria-label={`Consumo storico ${i + 1}`}
                                type="number"
                                min={0}
                                value={r.kwh}
                                disabled={!modificabile}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n) && n >= 0) {
                                    aggiornaDocumento({
                                      storico_mensile: doc.dati.storico_mensile
                                        .map((v, j) =>
                                          i === j ? { ...v, kwh: n } : v
                                        ),
                                    });
                                  }
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="text-xs underline"
                              disabled={!modificabile}
                              onClick={() =>
                                aggiornaDocumento({
                                  storico_mensile: doc.dati.storico_mensile
                                    .filter((_, j) => i !== j),
                                })}
                            >
                              Togli mese {i + 1}
                            </button>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        disabled={!modificabile ||
                          doc.dati.storico_mensile.length >= 36}
                        onClick={() => {
                          const mesi = doc.dati.storico_mensile,
                            ultimo = mesi.at(-1)?.mese ??
                              new Date().toISOString().slice(0, 7),
                            [y, m] = ultimo.split("-").map(Number),
                            mese = mesi.length
                              ? new Date(Date.UTC(y, m, 1)).toISOString().slice(
                                0,
                                7,
                              )
                              : ultimo;
                          aggiornaDocumento({
                            storico_mensile: [...mesi, { mese, kwh: 0 }],
                          });
                        }}
                      >
                        Aggiungi mese allo storico
                      </Button>
                    </fieldset>
                  </details>
                  <label className="mt-3 flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!modificabile}
                      checked={doc.dati.rettifica}
                      onChange={(e) =>
                        aggiornaDocumento({ rettifica: e.target.checked })}
                    />Questo documento rettifica consumi già fatturati:
                    escludilo dalla somma dei periodi
                  </label>
                  {doc.dati.avvisi.length > 0 && (
                    <ul className="mt-3 list-disc pl-4 text-xs text-amber-800">
                      {doc.dati.avvisi.map((v, i) => (
                        <li key={`${i}-${v}`}>{v}</li>
                      ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    className="mt-3"
                    disabled={!modificabile}
                    onClick={confermaDocumento}
                  >
                    {doc.confermato
                      ? "Riapri verifica"
                      : "Conferma i dati di questa bolletta"}
                  </Button>
                  {doc.dati.indirizzo_fornitura && (
                    <Button
                      type="button"
                      variant="outline"
                      className="ml-2 mt-3"
                      disabled={!modificabile}
                      onClick={() => onIndirizzo(doc.dati.indirizzo_fornitura!)}
                    >
                      Proponi indirizzo di fornitura
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-3"
                    disabled={!modificabile}
                    onClick={() =>
                      onChange({
                        ...a,
                        documenti: a.documenti.filter((d) => d.id !== doc.id),
                        proiezioneConfermata: false,
                      })}
                  >
                    Escludi documento dall’analisi
                  </Button>
                </div>
              </div>
            </>
          )}
          <p className="mt-4 text-sm">
            Copertura: {riepilogo.giorniCoperti} giorni ·{" "}
            {riepilogo.mesiCoperti.join(", ") || "periodo non disponibile"}.
            {" "}
            {riepilogo.stimato
              ? "Consumo annuo proiettato dal periodo disponibile."
              : "Consumo annuo dichiarato o storico completo."}
          </p>
          {riepilogo.stimato && (
            <label className="mt-2 flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.proiezioneConfermata}
                disabled={!modificabile}
                onChange={(e) =>
                  onChange({ ...a, proiezioneConfermata: e.target.checked })}
              />Confermo l’uso della proiezione annua indicativa
            </label>
          )}
        </>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([[
          "consumoAnnuo",
          "Consumo annuo confermato (kWh)",
          riepilogo.consumoAnnuo,
        ], [
          "spesaAnnua",
          "Spesa annua ricorrente confermata (€)",
          riepilogo.spesaAnnua,
        ], [
          "costiFissiAnnui",
          "Quote fisse annue che restano (€)",
          riepilogo.fissiAnnui,
        ], [
          "costiEvitabiliAnnui",
          "Costi annui proporzionali evitabili (€)",
          null,
        ]] as const).map(([k, label, proposta]) => (
          <label key={k} className="text-sm">
            {label}
            <Input
              aria-label={label}
              type="number"
              min={0}
              step="any"
              value={a.correzioni[k] ?? ""}
              disabled={!modificabile}
              placeholder={proposta == null
                ? "Da verificare"
                : String(Math.round(proposta * 100) / 100)}
              onChange={(e) => {
                const n = Number(e.target.value), c = { ...a.correzioni };
                if (e.target.value === "") {
                  delete c[k];
                } else if (Number.isFinite(n) && n >= 0) {
                  c[k] = n;
                }
                onChange({ ...a, correzioni: c });
              }}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm">
        Oggi: <strong>{euro(riepilogo.spesaAnnua)}/anno</strong> · quote fisse:
        {" "}
        <strong>{euro(riepilogo.fissiAnnui)}/anno</strong> · costo evitabile:
        {" "}
        <strong>
          {riepilogo.costoEvitabileKwh == null
            ? "da confermare"
            : `${
              riepilogo.costoEvitabileKwh.toLocaleString("it-IT", {
                maximumFractionDigits: 4,
              })
            } €/kWh`}
        </strong>.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Conferma quali quote sono proporzionali ai consumi. Canone TV, depositi,
        arretrati e conguagli richiedono verifica separata. Le tue correzioni
        restano quando aggiungi nuove bollette.
      </p>
      {riepilogo.avvisi.map((v, i) => (
        <p
          key={`${i}-${v}`}
          role="status"
          className="mt-2 text-xs text-amber-800"
        >
          {v}
        </p>
      ))}
      <Button
        type="button"
        className="mt-3"
        disabled={!modificabile || !riepilogo.costiCoerenti ||
          !(riepilogo.consumoAnnuo && riepilogo.consumoAnnuo > 0) ||
          (!riepilogo.pronto && a.documenti.length > 0)}
        onClick={() =>
          onApplica({
            consumo: riepilogo.consumoAnnuo!,
            costoEvitabile: riepilogo.costoEvitabileKwh,
          })}
      >
        Applica al simulatore i dati confermati
      </Button>
    </section>
  );
}
