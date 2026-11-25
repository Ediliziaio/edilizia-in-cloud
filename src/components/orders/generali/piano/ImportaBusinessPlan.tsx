import { UniformSelect } from "@/components/ui/uniform-select";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORIE_PIANO,
  categorieDelTipo,
  type CategoriaPiano,
  type VoceNuova,
} from "@/lib/orders/generali/pianoCategorie";
import {
  analizzaBusinessPlan,
  chiaveVoceBusinessPlan,
  leggiFileBusinessPlan,
  type FoglioBusinessPlan,
  type PeriodoLavori,
} from "@/lib/orders/generali/businessPlanImport";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { leggiNumeroItaliano } from "@/lib/orders/generali/pianoExcel";
import { euro } from "./formato";
import { DA_STIMARE, riferimentoImportazione } from "@/lib/orders/generali/budgetCompletezza";
import { leggiBusinessPlanAi } from "@/lib/orders/documentImportAi";
import { scenariBusinessPlanAi } from "@/lib/orders/generali/businessPlanAi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type VoceImportata = VoceNuova & { nota: string; aggiungiGiaPresente?: true };
export interface OrigineBusinessPlan {
  file: File;
  hash: string;
  foglio: string;
  simulazione?: Record<string, unknown>;
}

/** Workbook preview is independent of database writes. */
export function ImportaBusinessPlan({
  onImporta,
  onAnnulla,
  vociEsistenti,
  occupato = false,
  companyId = null,
  destinazione = "piano",
}: {
  onImporta: (voci: VoceImportata[], origine?: OrigineBusinessPlan) => void;
  onAnnulla: () => void;
  vociEsistenti?: readonly VocePiano[];
  occupato?: boolean;
  companyId?: string | null;
  destinazione?: "piano" | "simulatore";
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const lettura = useRef(0);
  const [file, setFile] = useState("");
  const [originale, setOriginale] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [fogli, setFogli] = useState<FoglioBusinessPlan[]>([]);
  const [indice, setIndice] = useState(0);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [selezionate, setSelezionate] = useState<Record<number, boolean>>({});
  const [categorie, setCategorie] = useState<Record<number, CategoriaPiano>>({});
  const [importi, setImporti] = useState<Record<number, string>>({});
  const [mesi, setMesi] = useState<Record<number, string>>({});
  const [durate, setDurate] = useState<Record<number, number>>({});
  const [conferma, setConferma] = useState(false);
  const analisi = useMemo(
    () => (fogli[indice] ? analizzaBusinessPlan(fogli[indice]) : null),
    [fogli, indice],
  );
  const esistentiPerNome = useMemo(() => {
    const mappa = new Map<string, VocePiano[]>();
    for (const voce of vociEsistenti ?? []) {
      const chiave = chiaveVoceBusinessPlan(voce);
      const voci = mappa.get(chiave);
      if (voci) voci.push(voce);
      else mappa.set(chiave, [voce]);
    }
    return mappa;
  }, [vociEsistenti]);
  const righe = (analisi?.righe ?? []).map((r) => {
    const importo = importi[r.riga] === undefined ? r.importo : leggiNumeroItaliano(importi[r.riga]);
    const giaPresenti = esistentiPerNome.get(chiaveVoceBusinessPlan(r)) ?? [];
    return {
      ...r,
      importo,
      giaPresenti,
      selezionata: selezionate[r.riga] ?? (giaPresenti.length === 0),
      mese: mesi[r.riga] ?? r.mese ?? null,
      durataMesi: durate[r.riga] ?? r.durataMesi,
      problema:
        importi[r.riga] === undefined ? r.problema : importo === null ? "Scrivi un importo valido" : importo < 0 ? "Verifica l'importo negativo" : null,
    };
  });
  const daImportare = righe.filter((r) => r.selezionata);
  const valide = daImportare.filter((r) => r.importo !== null && r.importo >= 0);
  const mancanti = daImportare.length - valide.length;
  const giaPresenti = righe.filter(r => r.giaPresenti.length > 0).length;
  const totale = (tipo: "costo" | "ricavo") =>
    valide.filter((r) => r.tipo === tipo).reduce((s, r) => s + (r.importo ?? 0), 0);
  const carica = async (f: File | undefined) => {
    if (!f) return;
    const richiesta = ++lettura.current;
    setErrore(null);
    setCaricamento(true);
    setFogli([]);
    setConferma(false);
    setSelezionate({});
    setCategorie({});
    setImporti({});
    setMesi({});
    setDurate({});
    try {
      const excel = /\.xlsx$/i.test(f.name);
      if (!/\.(xlsx|pdf|png|jpe?g|webp)$/i.test(f.name)) throw new Error(t("Scegli Excel .xlsx, PDF o immagine. I formati .xls e .xlsm non sono supportati."));
      if (!f.size) throw new Error(t("Il file è vuoto."));
      if (f.size > (excel ? 15 : 18) * 1024 * 1024) throw new Error(t("Il file supera {mb} MB.", { mb: excel ? 15 : 18 }));
      const bytes = await f.arrayBuffer();
      if (!excel && !companyId) throw new Error(t("Seleziona l’azienda per usare la lettura AI del PDF."));
      const nuovi = excel ? await leggiFileBusinessPlan(bytes) : scenariBusinessPlanAi((await leggiBusinessPlanAi(f, companyId!)).raw);
      const impronta = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (richiesta !== lettura.current) return;
      setFile(f.name);
      setOriginale(f);
      setHash(impronta);
      setFogli(nuovi);
      setIndice(
        Math.max(
          0,
          nuovi.findIndex((s) => /realistic/i.test(s.nome)),
        ),
      );
    } catch (e) {
      if (richiesta === lettura.current)
        setErrore(e instanceof Error ? e.message : t("Non riesco a leggere il file Excel."));
    } finally {
      if (richiesta === lettura.current) setCaricamento(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/20 p-5">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{file || t("Carica il piano della tua operazione")}</p>
            <p className="text-xs text-muted-foreground">
              {t("Excel .xlsx fino a 15 MB, letto nel browser. PDF e immagini fino a 18 MB, letti con l’AI.")}
            </p>
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.pdf,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          aria-label={t("File business plan")}
          disabled={occupato || caricamento}
          onChange={(e) => {
            void carica(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button variant="outline" disabled={occupato || caricamento} onClick={() => input.current?.click()}>
          {caricamento ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {t("Scegli file")}
        </Button>
      </div>
      {errore && (
        <p role="alert" className="text-sm text-destructive">
          {errore}
        </p>
      )}
      {caricamento && <p role="status" className="text-sm text-muted-foreground">{t("Lettura del file in corso. Per PDF e immagini l’AI può impiegare qualche istante.")}</p>}
      {destinazione === "piano" && fogli[indice]?.ai && Object.keys(fogli[indice].ai!.simulazione).length > 0 && <p className="rounded-lg border bg-muted/30 p-3 text-sm">{t("Qui importi le voci del budget. Per preparare anche le unità e le fonti previste dal documento, usa lo stesso import dal simulatore «Valuta un’operazione».")}</p>}
      {destinazione === "simulatore" && analisi && daImportare.some(r => r.importo === null || r.importo < 0 || !r.mese) && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">{t("Per trasferire il piano al simulatore completa gli importi e il mese di ogni voce selezionata. Non vengono inventate scadenze o stime.")}</p>}
      {destinazione === "simulatore" && analisi && daImportare.some(r => !r.mese) && <MesiInBlocco key={indice} righe={daImportare} periodo={analisi.periodo ?? null} disabled={occupato} onApplica={(tipo, mese, durata) => {
        const senza = daImportare.filter(r => !r.mese && r.tipo === tipo);
        setMesi(s => ({ ...s, ...Object.fromEntries(senza.map(r => [r.riga, mese])) }));
        setDurate(s => ({ ...s, ...Object.fromEntries(senza.map(r => [r.riga, durata])) }));
        setConferma(false);
      }} />}
      {analisi && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              {t("Scenario da importare")}
              <UniformSelect
                className="block h-10 w-full rounded-md border bg-background px-3 font-normal"
                value={indice}
                disabled={occupato}
                onChange={(e) => {
                  setIndice(Number(e.target.value));
                  setSelezionate({});
                  setCategorie({});
                  setImporti({});
                  setMesi({});
    setDurate({});
                  setConferma(false);
                }}
              >
                {fogli.map((s, i) => (
                  <option key={i} value={i}>
                    {s.nome.trim()}
                  </option>
                ))}
              </UniformSelect>
            </label>
            <div className="self-end rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("Colonna prevista:")}{" "}
              <strong dir="auto">{analisi.intestazioni[analisi.colonnaImporto] || t("non riconosciuta")}</strong>.{" "}
              {t("Ogni scenario resta separato.")}
            </div>
          </div>
          {analisi.titolo && (
            <p className="text-xs text-muted-foreground">
              {t("Titolo nel foglio:")} <strong dir="auto">{analisi.titolo}</strong>.{" "}
              {t("Verifica che appartenga a questa operazione.")}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicatore nome={t("Costi valorizzati selezionati")} valore={euro(totale("costo"))} />
            <Indicatore nome={t("Ricavi selezionati, IVA esclusa")} valore={euro(totale("ricavo"))} />
            <Indicatore nome={t("Voci ancora da completare")} valore={String(mancanti)} />
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {t("Controlli prima dell'importazione")}
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {analisi.avvisi
                .filter((a) => mancanti > 0 || !a.startsWith("Sono presenti voci senza importo"))
                .map((a) => (
                  <li key={a}>{a}</li>
                ))}
              {giaPresenti > 0 && (
                <li>
                  {giaPresenti === 1
                    ? t("{n} riga già presente nella bozza.", { n: giaPresenti })
                    : t("{n} righe già presenti nella bozza.", { n: giaPresenti })}{" "}
                  {t("Puoi confrontare gli importi qui. Se vuoi aggiungere una seconda voce, selezionala.")}
                </li>
              )}
            </ul>
          </div>
          <div className="max-h-[35vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">{t("Importa")}</th>
                  <th className="p-2">{t("Riga")}</th>
                  <th className="p-2">{t("Voce")}</th>
                  <th className="p-2">{t("Categoria")}</th>
                  <th className="p-2 text-right">{t("Previsto")}</th>
                  <th className="p-2">{t("Mese previsto")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((r) => (
                  <tr
                    key={r.riga}
                    className={r.importo === null ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={t("Importa riga {riga}", { riga: r.riga })}
                        // Una voce senza importo si può sempre togliere: prima restava spuntata e
                        // bloccata, e il simulatore non partiva senza inventare un importo.
                        disabled={occupato || (!r.selezionata && (r.importo === null || r.importo < 0))}
                        checked={r.selezionata}
                        onChange={(e) => {
                          setSelezionate((s) => ({ ...s, [r.riga]: e.target.checked }));
                          setConferma(false);
                        }}
                      />
                    </td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.riga}</td>
                    <td className="min-w-44 p-2" dir="auto">
                      {r.descrizione}
                      {r.giaPresenti.length > 0 && (
                        <span className="block text-xs text-amber-800 dark:text-amber-300">
                          {r.giaPresenti.length === 1 ? t("Già in bozza · {importo}", { importo: euro(r.giaPresenti[0].importo) }) : t("Già in bozza · {n} voci con lo stesso nome", { n: r.giaPresenti.length })}
                        </span>
                      )}
                      {r.problema && (
                        <span className="block text-xs text-amber-800 dark:text-amber-300">{t(r.problema)}</span>
                      )}
                    </td>
                    <td className="p-2">
                      <UniformSelect
                        aria-label={t("Categoria riga {riga}", { riga: r.riga })}
                        value={categorie[r.riga] ?? r.categoria}
                        disabled={occupato}
                        className="max-w-48 rounded border bg-background p-1 text-xs"
                        onChange={(e) => {
                          setCategorie((c) => ({ ...c, [r.riga]: e.target.value as CategoriaPiano }));
                          setConferma(false);
                        }}
                      >
                        {categorieDelTipo(r.tipo).map((c) => (
                          <option key={c.id} value={c.id}>
                            {t(CATEGORIE_PIANO[c.id].nome)}
                          </option>
                        ))}
                      </UniformSelect>
                    </td>
                    <td className="p-2">
                      <Input
                        className="ml-auto h-8 w-32 text-right tabular-nums"
                        aria-label={t("Importo previsto riga {riga}", { riga: r.riga })}
                        inputMode="decimal"
                        placeholder={t("Da stimare")}
                        disabled={occupato}
                        value={
                          importi[r.riga] ??
                          (r.importo === null
                            ? ""
                            : r.importo.toLocaleString("it-IT", {
                                useGrouping: false,
                                maximumFractionDigits: 2,
                              }))
                        }
                        onChange={(e) => {
                          setImporti((s) => ({ ...s, [r.riga]: e.target.value }));
                          if (r.giaPresenti.length === 0) setSelezionate(s => ({ ...s, [r.riga]: true }));
                          setConferma(false);
                        }}
                      />
                    </td>
                    <td className="p-2"><input type="month" aria-label={t("Mese previsto riga {riga}", { riga: r.riga })} value={r.mese ?? ""} disabled={occupato} className="h-9 rounded border bg-background px-2 text-sm" onChange={e => { setMesi(s => ({ ...s, [r.riga]: e.target.value })); setConferma(false); }}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={conferma}
              disabled={occupato}
              onChange={(e) => setConferma(e.target.checked)}
            />
            <span>
              {destinazione === "simulatore"
                ? t("Ho verificato scenario, importi al netto dell'IVA e voci già presenti. Le {n} voci ancora da correggere entrano come «Da stimare» e bloccano l'approvazione. Il file originale verrà conservato con l’ipotesi.", { n: mancanti })
                : t("Ho verificato scenario, importi al netto dell'IVA e voci già presenti. Le {n} voci ancora da correggere entrano come «Da stimare» e bloccano l'approvazione. Il file originale verrà conservato nella commessa.", { n: mancanti })}
            </span>
          </label>
        </>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" disabled={occupato} onClick={onAnnulla}>
          {t("Annulla")}
        </Button>
        <Button
          disabled={
            !analisi ||
            !conferma ||
            daImportare.length === 0 ||
            daImportare.length > 300 ||
            occupato ||
            caricamento
            || (destinazione === "simulatore" && daImportare.some(r => r.importo === null || r.importo < 0 || !r.mese))
          }
          onClick={() =>
            onImporta(
              daImportare.map<VoceImportata>((r) => ({
                tipo: r.tipo,
                categoria: categorie[r.riga] ?? r.categoria,
                descrizione: r.descrizione,
                importo: r.importo !== null && r.importo >= 0 ? r.importo : 0,
                mese: r.mese || null,
                durataMesi: r.durataMesi ?? 1,
                ...(r.giaPresenti.length > 0 ? { aggiungiGiaPresente: true as const } : {}),
                nota: `${riferimentoImportazione(hash, fogli[indice].nome, r.riga)} ${r.importo === null || r.importo < 0 ? DA_STIMARE + " " : ""}Fonte: ${file.slice(0, 200)} · ${fogli[indice].nome} · riga ${r.riga}.${importi[r.riga] !== undefined ? " Importo modificato nell'anteprima." : ""} Budget senza consuntivi. ${r.mese ? "Mese letto o verificato nell’anteprima." : "Calendario da completare."}`,
              })),
              originale ? { file: originale, hash, foglio: fogli[indice].nome, ...(fogli[indice].ai ? { simulazione: fogli[indice].ai!.simulazione } : {}) } : undefined,
            )
          }
        >
          {occupato && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{destinazione === "simulatore" ? t("Usa {n} voci nell’ipotesi", { n: daImportare.length }) : t("Aggiungi {n} voci alla bozza", { n: daImportare.length })}
        </Button>
      </div>
      {valide.length > 300 && (
        <p role="alert" className="text-xs text-destructive">
          {t("Seleziona al massimo 300 voci per importazione.")}
        </p>
      )}
    </div>
  );
}

function Indicatore({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{nome}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valore}</p>
    </div>
  );
}

/**
 * Un business plan in Excel di rado ha il calendario: Callimaco, 131 voci senza un mese
 * (25/11/2026), da scrivere una per una. Qui chi importa sceglie un mese per i costi e uno per
 * i ricavi che ne sono privi; quelli già letti dal file non si toccano, e ogni riga resta
 * modificabile nella tabella.
 */
function MesiInBlocco({ righe, periodo, disabled, onApplica }: {
  righe: readonly { tipo: string; mese: string | null }[];
  periodo: PeriodoLavori | null;
  disabled?: boolean;
  onApplica: (tipo: "costo" | "ricavo", mese: string, durataMesi: number) => void;
}) {
  const t = useT();
  // Dal periodo scritto nel foglio: i costi distribuiti sui mesi dei lavori, i ricavi alla fine.
  const [scelti, setScelti] = useState<Record<"costo" | "ricavo", string>>({ costo: periodo?.inizio ?? "", ricavo: periodo?.fine ?? "" });
  const [distribuisci, setDistribuisci] = useState(!!periodo && periodo.mesi > 1);
  const campi = ([["costo", t("Costi senza mese")], ["ricavo", t("Ricavi senza mese")]] as const)
    .map(([tipo, nome]) => ({ tipo, nome, n: righe.filter((r) => r.tipo === tipo && !r.mese).length }))
    .filter((c) => c.n > 0);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 text-sm">
      {periodo && <p className="basis-full text-xs">{t("Periodo dei lavori letto nel foglio:")} <strong dir="auto">{periodo.testo}</strong></p>}
      {campi.map((c) => (
        <label key={c.tipo} className="space-y-1">
          <span className="block text-xs font-medium">{c.nome} ({c.n})</span>
          <span className="flex gap-2">
            <input type="month" aria-label={c.nome} value={scelti[c.tipo]} disabled={disabled} className="h-9 rounded border bg-background px-2"
              onChange={(e) => setScelti((s) => ({ ...s, [c.tipo]: e.target.value }))} />
            <Button type="button" size="sm" variant="outline" disabled={disabled || !scelti[c.tipo]}
              onClick={() => onApplica(c.tipo, scelti[c.tipo], c.tipo === "costo" && distribuisci && periodo && scelti.costo === periodo.inizio ? periodo.mesi : 1)}>
              {t("Applica")}
            </Button>
          </span>
        </label>
      ))}
      {periodo && periodo.mesi > 1 && campi.some((c) => c.tipo === "costo") && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={distribuisci} disabled={disabled} onChange={(e) => setDistribuisci(e.target.checked)} />
          {t("Distribuisci i costi sui {n} mesi dei lavori", { n: periodo.mesi })}
        </label>
      )}
      <p className="basis-full text-xs text-muted-foreground">{t("Il mese vale per le voci selezionate che non ne hanno uno; puoi cambiarlo riga per riga.")}</p>
    </div>
  );
}
