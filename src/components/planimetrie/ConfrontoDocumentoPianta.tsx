import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import type { VerificaLettura } from "../../../shared/planimetrie/letturaTipi.ts";
import { confermaVerifica, revocaVerifica, valoreSulDisegno, verificaConfermata, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { applicaQuotaDocumento } from "@/lib/planimetrie/confermaQuoteDocumento";
import type { ArchivioRicalco } from "@/lib/planimetrie/ricalco";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FotoDocumentoVerifica } from "./FotoDocumentoVerifica";
import { daPlanimetria } from "./editor/adattatore";
import { impostaZoneFoto } from "@/lib/planimetrie/zoneFotoDocumento";
import { StatoVerificaDocumento } from "./ControlloPrimaDellUso";

export interface SorgenteDocumentoPianta { file: Blob; nome: string }
const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

export function ConfrontoDocumentoPianta({ documento, sorgente, archivio, onAggiorna, onSeleziona, solaLettura }: {
  documento: Planimetria; sorgente?: SorgenteDocumentoPianta; archivio?: ArchivioRicalco;
  onAggiorna: (d: Planimetria) => void; onSeleziona?: (v: VerificaLettura) => void; solaLettura?: boolean;
}) {
  const [attivaId, setAttivaId] = useState<string>();
  const percorso = documento.letturaDocumento?.sorgente?.percorso;
  const foto = useQuery({ queryKey: ["documento-pianta-foto", percorso], enabled: !!percorso && !!archivio && !sorgente, queryFn: () => archivio!.url(percorso!), staleTime: 60 * 60_000 });
  const verifiche = verificheDelDocumento(documento);
  const fatte = verifiche.filter((v) => verificaConfermata(documento, v)).length;
  const attiva = verifiche.find((v) => v.id === attivaId);
  const piantaFoto = useMemo(() => daPlanimetria(documento, attiva?.riferimento?.livelloId), [documento, attiva?.riferimento?.livelloId]);
  const seleziona = (v: VerificaLettura) => { setAttivaId(v.id); onSeleziona?.(v); };
  return <aside aria-label="Confronto foto e pianta" className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b bg-slate-50 lg:w-[330px] lg:border-b-0 lg:border-r xl:w-[360px]">
    {sorgente || foto.data ? <FotoDocumentoVerifica file={sorgente?.file} url={foto.data} verifiche={verifiche} attiva={attiva} pianta={piantaFoto} onSeleziona={seleziona} onZone={(id, zone) => { if (!solaLettura) onAggiorna(impostaZoneFoto(documento, id, zone)); }} solaLettura={solaLettura} /> : <div className="border-b p-3"><h3 className="text-sm font-semibold">Documento originale</h3><p className="mt-2 text-xs text-muted-foreground">{foto.isLoading ? "Carico la foto originale…" : foto.error ? "Foto non disponibile: riprova riaprendo il progetto." : "La foto originale non è allegata a questa versione. Confronta le quote con il documento in tuo possesso."}</p></div>}
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 max-lg:max-h-64">
      <div className="flex items-center justify-between text-sm"><h3 className="font-semibold">Verifica una voce alla volta</h3><span className="text-xs tabular-nums">{fatte}/{verifiche.length}</span></div>
      <p className="text-xs text-muted-foreground">Scegli una misura solo dopo averla verificata. Puoi lasciare aperti i dubbi e salvare la bozza.</p>
      {verifiche.map((v) => <VoceVerifica key={v.id} verifica={v} documento={documento} solaLettura={solaLettura} onAggiorna={onAggiorna} onSeleziona={seleziona} evidenziata={v.id === attivaId} />)}
      {!!documento.letturaDocumento?.avvisiIniziali.length && <details className="rounded-lg border bg-white p-3 text-xs"><summary className="cursor-pointer font-medium">Osservazioni della lettura iniziale <ChevronDown className="inline h-3 w-3" /></summary><ul className="mt-2 list-disc space-y-2 pl-4">{documento.letturaDocumento.avvisiIniziali.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
      <StatoVerificaDocumento documento={documento} />
    </div>
  </aside>;
}

function VoceVerifica({ verifica: v, documento, onAggiorna, onSeleziona, solaLettura, evidenziata }: {
  verifica: VerificaLettura; documento: Planimetria; onAggiorna: (d: Planimetria) => void; onSeleziona?: (v: VerificaLettura) => void; solaLettura?: boolean; evidenziata?: boolean;
}) {
  const [valore, setValore] = useState("");
  const [nota, setNota] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const confermata = verificaConfermata(documento, v);
  const attuale = valoreSulDisegno(documento, v);
  const conferma = () => {
    try {
      setErrore(null);
      const n = Number(valore.trim().replace(",", "."));
      const nuova = v.tipo === "quota" && attuale !== null ? applicaQuotaDocumento(documento, v.id, n, nota) : confermaVerifica(documento, v.id, { nota });
      onAggiorna(nuova);
    } catch (e) { setErrore(e instanceof Error ? e.message : "Verifica non registrata."); }
  };
  return <section aria-label={v.descrizione} className={`space-y-2 rounded-lg border bg-white p-3 ${evidenziata ? "border-orange-500 ring-2 ring-orange-200" : confermata ? "border-emerald-200" : "border-amber-200"}`}>
    <p className="text-xs font-medium leading-relaxed">{confermata && <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-700" />}{v.descrizione}</p>
    {confermata ? <><p className="text-xs text-emerald-800">Verificata{v.conferma?.valoreCm !== undefined ? `: ${num(v.conferma.valoreCm)} cm` : ""}{v.conferma?.nota ? ` · ${v.conferma.nota}` : ""}</p>{!solaLettura && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAggiorna(revocaVerifica(documento, v.id))}><RotateCcw className="mr-1 h-3 w-3" />Riapri controllo</Button>}</> : <>
      {v.conferma && <p className="text-xs text-amber-800">Il disegno è cambiato: verifica di nuovo questa voce.</p>}
      {attuale !== null && <p className="text-xs text-muted-foreground">Sul disegno, provvisoriamente: {num(attuale)} cm</p>}
      {!!v.valoriLettiCm?.length && <div className="flex flex-wrap gap-1">{v.valoriLettiCm.map((n) => attuale === null ? <span key={n} className="rounded border px-2 py-1 text-xs">{num(n)} cm</span> : <Button type="button" size="sm" aria-pressed={valore === String(n).replace(".", ",")} variant={valore === String(n).replace(".", ",") ? "secondary" : "outline"} disabled={solaLettura} className="h-7 px-2 text-xs" key={n} onClick={() => setValore(String(n).replace(".", ","))}>{num(n)} cm</Button>)}</div>}
      {v.tipo === "quota" && attuale === null && <p className="text-xs text-muted-foreground">Correggi questo dettaglio sul disegno, poi annota come l’hai verificato.</p>}
      {v.tipo === "quota" && attuale !== null && <Input aria-label={`Quota verificata in cm: ${v.descrizione}`} value={valore} onChange={(e) => setValore(e.target.value)} inputMode="decimal" placeholder="Misura verificata (cm)" disabled={solaLettura} className="h-8 text-xs" />}
      {(v.tipo === "nota" || (v.tipo === "quota" && attuale === null)) && <Input aria-label={`Nota di verifica: ${v.descrizione}`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} placeholder="Cosa hai verificato o corretto?" disabled={solaLettura} className="h-8 text-xs" />}
      <div className="flex flex-wrap gap-1">{onSeleziona && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" aria-pressed={!!evidenziata} onClick={() => onSeleziona(v)}>Evidenzia foto e pianta</Button>}{!solaLettura && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={conferma}>{v.tipo === "quota" && attuale !== null ? "Applica quota e conferma" : "Confermo il controllo"}</Button>}</div>
      {errore && <p role="alert" className="text-xs text-red-700">{errore}</p>}
    </>}
  </section>;
}
