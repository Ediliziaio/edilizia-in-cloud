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
  leggiFileBusinessPlan,
  type FoglioBusinessPlan,
} from "@/lib/orders/generali/businessPlanImport";
import { leggiNumeroItaliano } from "@/lib/orders/generali/pianoExcel";
import { euro } from "./formato";
import { DA_STIMARE, riferimentoImportazione } from "@/lib/orders/generali/budgetCompletezza";
import { leggiBusinessPlanAi } from "@/lib/orders/documentImportAi";
import { scenariBusinessPlanAi } from "@/lib/orders/generali/businessPlanAi";

export type VoceImportata = VoceNuova & { nota: string };
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
  vociEsistenti = 0,
  occupato = false,
  companyId = null,
  destinazione = "piano",
}: {
  onImporta: (voci: VoceImportata[], origine?: OrigineBusinessPlan) => void;
  onAnnulla: () => void;
  vociEsistenti?: number;
  occupato?: boolean;
  companyId?: string | null;
  destinazione?: "piano" | "simulatore";
}) {
  const input = useRef<HTMLInputElement>(null);
  const lettura = useRef(0);
  const [file, setFile] = useState("");
  const [originale, setOriginale] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [fogli, setFogli] = useState<FoglioBusinessPlan[]>([]);
  const [indice, setIndice] = useState(0);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [escluse, setEscluse] = useState<Set<number>>(new Set());
  const [categorie, setCategorie] = useState<Record<number, CategoriaPiano>>({});
  const [importi, setImporti] = useState<Record<number, string>>({});
  const [mesi, setMesi] = useState<Record<number, string>>({});
  const [conferma, setConferma] = useState(false);
  const analisi = useMemo(
    () => (fogli[indice] ? analizzaBusinessPlan(fogli[indice]) : null),
    [fogli, indice],
  );
  const righe = (analisi?.righe ?? []).map((r) => {
    const importo = importi[r.riga] === undefined ? r.importo : leggiNumeroItaliano(importi[r.riga]);
    return {
      ...r,
      importo,
      mese: mesi[r.riga] ?? r.mese ?? null,
      problema:
        importi[r.riga] === undefined ? r.problema : importo === null ? "Scrivi un importo valido" : importo < 0 ? "Verifica l'importo negativo" : null,
    };
  });
  const valide = righe.filter((r) => r.importo !== null && r.importo >= 0 && !escluse.has(r.riga));
  const daImportare = righe.filter((r) => !escluse.has(r.riga));
  const mancanti = righe.filter((r) => r.importo === null || r.importo < 0).length;
  const totale = (tipo: "costo" | "ricavo") =>
    valide.filter((r) => r.tipo === tipo).reduce((s, r) => s + (r.importo ?? 0), 0);
  const carica = async (f: File | undefined) => {
    if (!f) return;
    const richiesta = ++lettura.current;
    setErrore(null);
    setCaricamento(true);
    setFogli([]);
    setConferma(false);
    setEscluse(new Set());
    setCategorie({});
    setImporti({});
    setMesi({});
    try {
      const excel = /\.xlsx$/i.test(f.name);
      if (!/\.(xlsx|pdf|png|jpe?g|webp)$/i.test(f.name)) throw new Error("Scegli Excel .xlsx, PDF o immagine. I formati .xls e .xlsm non sono supportati.");
      if (!f.size) throw new Error("Il file è vuoto.");
      if (f.size > (excel ? 15 : 18) * 1024 * 1024) throw new Error(`Il file supera ${excel ? 15 : 18} MB.`);
      const bytes = await f.arrayBuffer();
      if (!excel && !companyId) throw new Error("Seleziona l’azienda per usare la lettura AI del PDF.");
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
        setErrore(e instanceof Error ? e.message : "Non riesco a leggere il file Excel.");
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
            <p className="text-sm font-medium">{file || "Carica il piano della tua operazione"}</p>
            <p className="text-xs text-muted-foreground">
              Excel .xlsx fino a 15 MB, letto nel browser. PDF e immagini fino a 18 MB, letti con l’AI.
            </p>
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.pdf,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          aria-label="File business plan"
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
          Scegli file
        </Button>
      </div>
      {errore && (
        <p role="alert" className="text-sm text-destructive">
          {errore}
        </p>
      )}
      {caricamento && <p role="status" className="text-sm text-muted-foreground">Lettura del file in corso. Per PDF e immagini l’AI può impiegare qualche istante.</p>}
      {destinazione === "piano" && fogli[indice]?.ai && Object.keys(fogli[indice].ai!.simulazione).length > 0 && <p className="rounded-lg border bg-muted/30 p-3 text-sm">Qui importi le voci del budget. Per preparare anche le unità e le fonti previste dal documento, usa lo stesso import dal simulatore «Valuta un’operazione».</p>}
      {destinazione === "simulatore" && analisi && daImportare.some(r => r.importo === null || r.importo < 0 || !r.mese) && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">Per trasferire il piano al simulatore completa gli importi e il mese di ogni voce selezionata. Non vengono inventate scadenze o stime.</p>}
      {analisi && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Scenario da importare
              <select
                className="block h-10 w-full rounded-md border bg-background px-3 font-normal"
                value={indice}
                disabled={occupato}
                onChange={(e) => {
                  setIndice(Number(e.target.value));
                  setEscluse(new Set());
                  setCategorie({});
                  setImporti({});
                  setMesi({});
                  setConferma(false);
                }}
              >
                {fogli.map((s, i) => (
                  <option key={i} value={i}>
                    {s.nome.trim()}
                  </option>
                ))}
              </select>
            </label>
            <div className="self-end rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Colonna prevista:{" "}
              <strong>{analisi.intestazioni[analisi.colonnaImporto] || "non riconosciuta"}</strong>. Ogni
              scenario resta separato.
            </div>
          </div>
          {analisi.titolo && (
            <p className="text-xs text-muted-foreground">
              Titolo nel foglio: <strong>{analisi.titolo}</strong>. Verifica che appartenga a questa
              operazione.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicatore nome="Costi valorizzati selezionati" valore={euro(totale("costo"))} />
            <Indicatore nome="Ricavi selezionati, IVA esclusa" valore={euro(totale("ricavo"))} />
            <Indicatore nome="Voci ancora da completare" valore={String(mancanti)} />
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Controlli prima dell'importazione
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {analisi.avvisi
                .filter((a) => mancanti > 0 || !a.startsWith("Sono presenti voci senza importo"))
                .map((a) => (
                  <li key={a}>{a}</li>
                ))}
              {vociEsistenti > 0 && (
                <li>
                  La bozza contiene già {vociEsistenti} voci. Le righe selezionate si aggiungono: togli
                  dall'anteprima quelle già presenti, soprattutto i ricavi.
                </li>
              )}
            </ul>
          </div>
          <div className="max-h-[35vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">Importa</th>
                  <th className="p-2">Riga</th>
                  <th className="p-2">Voce</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2 text-right">Previsto</th>
                  <th className="p-2">Mese previsto</th>
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
                        aria-label={`Importa riga ${r.riga}`}
                        disabled={occupato || r.importo === null || r.importo < 0}
                        checked={!escluse.has(r.riga)}
                        onChange={(e) => {
                          setEscluse((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.delete(r.riga);
                            else n.add(r.riga);
                            return n;
                          });
                          setConferma(false);
                        }}
                      />
                    </td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.riga}</td>
                    <td className="min-w-44 p-2">
                      {r.descrizione}
                      {r.problema && (
                        <span className="block text-xs text-amber-800 dark:text-amber-300">{r.problema}</span>
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Categoria riga ${r.riga}`}
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
                            {CATEGORIE_PIANO[c.id].nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Input
                        className="ml-auto h-8 w-32 text-right tabular-nums"
                        aria-label={`Importo previsto riga ${r.riga}`}
                        inputMode="decimal"
                        placeholder="Da stimare"
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
                          setEscluse((s) => { const n = new Set(s); n.delete(r.riga); return n; });
                          setConferma(false);
                        }}
                      />
                    </td>
                    <td className="p-2"><input type="month" aria-label={`Mese previsto riga ${r.riga}`} value={r.mese ?? ""} disabled={occupato} className="h-9 rounded border bg-background px-2 text-sm" onChange={e => { setMesi(s => ({ ...s, [r.riga]: e.target.value })); setConferma(false); }}/></td>
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
              Ho verificato scenario, importi al netto dell'IVA e voci già presenti. Le {mancanti} voci ancora
              da correggere entrano come «Da stimare» e bloccano l'approvazione. Il file originale verrà
              conservato {destinazione === "simulatore" ? "con l’ipotesi" : "nella commessa"}.
            </span>
          </label>
        </>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" disabled={occupato} onClick={onAnnulla}>
          Annulla
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
                nota: `${riferimentoImportazione(hash, fogli[indice].nome, r.riga)} ${r.importo === null || r.importo < 0 ? DA_STIMARE + " " : ""}Fonte: ${file.slice(0, 200)} · ${fogli[indice].nome} · riga ${r.riga}.${importi[r.riga] !== undefined ? " Importo modificato nell'anteprima." : ""} Budget senza consuntivi. ${r.mese ? "Mese letto o verificato nell’anteprima." : "Calendario da completare."}`,
              })),
              originale ? { file: originale, hash, foglio: fogli[indice].nome, ...(fogli[indice].ai ? { simulazione: fogli[indice].ai!.simulazione } : {}) } : undefined,
            )
          }
        >
          {occupato && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{destinazione === "simulatore" ? `Usa ${daImportare.length} voci nell’ipotesi` : `Aggiungi ${daImportare.length} voci alla bozza`}
        </Button>
      </div>
      {valide.length > 300 && (
        <p role="alert" className="text-xs text-destructive">
          Seleziona al massimo 300 voci per importazione.
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
