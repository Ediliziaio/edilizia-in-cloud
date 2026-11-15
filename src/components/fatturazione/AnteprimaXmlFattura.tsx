/**
 * L'anteprima del file XML che parte allo SDI, letta in italiano (15/11/2026).
 *
 * Non è una seconda copia di cortesia: è il contenuto del file, elemento per
 * elemento, con i nomi dello schema tradotti. Serve per controllare che quello
 * che si vede nel PDF sia davvero quello che riceve l'Agenzia.
 */

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { sezioniFatturaXml, versioneFatturaXml, type NodoXml } from "@/lib/fatturazione/xmlLeggibile";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";

interface Props {
  documento: EditorState;
  azienda: AnagraficaAzienda | null;
  /** Lo stesso rimpicciolimento del foglio PDF, per stare nella stessa colonna. */
  scale?: number;
}

/** Blocchi che si ripetono: si numerano, così «Riga 2» si distingue da «Riga 1». */
const RIPETUTI = new Set(["DettaglioLinee", "DatiRiepilogo", "DettaglioPagamento", "Allegati", "Causale", "DatiDDT"]);

function Valore({ nodo }: { nodo: NodoXml }) {
  return (
    <div className="flex gap-2 py-[1px] text-[11px] leading-snug">
      <span className="min-w-[38%] max-w-[55%] shrink-0 text-muted-foreground">{nodo.etichetta}</span>
      <span className="min-w-0 break-words font-medium text-foreground">{nodo.valore || "—"}</span>
    </div>
  );
}

function Blocco({ nodo, livello, indice }: { nodo: NodoXml; livello: number; indice?: number }) {
  if (nodo.figli.length === 0) return <Valore nodo={nodo} />;
  const conteggi = new Map<string, number>();
  return (
    <section className={livello === 0 ? "rounded-md border bg-card p-2.5" : "mt-1.5 rounded border border-dashed px-2 py-1.5"}>
      <h4 className={livello === 0
        ? "mb-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/80"
        : "mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"}>
        {nodo.etichetta}{indice != null ? ` ${indice}` : ""}
      </h4>
      {nodo.figli.map((f, i) => {
        if (RIPETUTI.has(f.tag)) {
          const n = (conteggi.get(f.tag) ?? 0) + 1;
          conteggi.set(f.tag, n);
          const quanti = nodo.figli.filter((x) => x.tag === f.tag).length;
          return <Blocco key={i} nodo={f} livello={livello + 1} indice={quanti > 1 ? n : undefined} />;
        }
        return <Blocco key={i} nodo={f} livello={livello + 1} />;
      })}
    </section>
  );
}

export function AnteprimaXmlFattura({ documento, azienda, scale = 1 }: Props) {
  const esito = useMemo(() => {
    if (!azienda) return { errore: "I dati dell'azienda non sono ancora caricati." as string | null, sezioni: [] as NodoXml[], versione: "" };
    try {
      const xml = generateFatturaPAXML(documento as unknown as DocumentoFiscale, azienda);
      return { errore: null, sezioni: sezioniFatturaXml(xml), versione: versioneFatturaXml(xml) };
    } catch (e) {
      return { errore: e instanceof Error ? e.message : String(e), sezioni: [] as NodoXml[], versione: "" };
    }
  }, [documento, azienda]);

  return (
    <div className="w-full" style={scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: "top center" }}>
      <div className="space-y-2 p-2" data-testid="anteprima-xml">
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Il contenuto del file che parte allo SDI{esito.versione ? ` (${esito.versione})` : ""}. È la fattura con valore
            fiscale: il PDF ne è la copia di cortesia.
          </span>
        </div>
        {esito.errore ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive" role="alert">
            L'XML non si può generare adesso: {esito.errore}
          </p>
        ) : (
          esito.sezioni.map((s, i) => <Blocco key={i} nodo={s} livello={0} />)
        )}
      </div>
    </div>
  );
}
