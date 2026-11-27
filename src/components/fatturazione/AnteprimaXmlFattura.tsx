/**
 * L'anteprima del file XML che parte allo SDI, letta in italiano (15/11/2026).
 *
 * Non è una seconda copia di cortesia: è il contenuto del file, elemento per
 * elemento, con i nomi dello schema tradotti. Serve per controllare che quello
 * che si vede nel PDF sia davvero quello che riceve l'Agenzia.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { fatturaXmlTabellareHtml } from "@/lib/fatturazione/fatturaXmlTabellare";
import { esigiOriginaleSeTrasmesso, leggiXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { sezioniFatturaXml, versioneFatturaXml, type NodoXml } from "@/lib/fatturazione/xmlLeggibile";
import { stampaPreventivoNativo } from "@/lib/fotovoltaico/htmlToPdf";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
  documento: EditorState;
  azienda: AnagraficaAzienda | null;
  /** Lo stesso rimpicciolimento del foglio PDF, per stare nella stessa colonna. */
  scale?: number;
  mostraStampa?: boolean;
}

interface EsitoAnteprima {
  foglio: ReturnType<typeof fatturaXmlTabellareHtml> | null;
  errore: string | null;
  sezioni: NodoXml[];
  versione: string;
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

export function AnteprimaXmlFattura({ documento, azienda, scale = 1, mostraStampa = false }: Props) {
  const t = useT();
  const archiviato = !!documento.sdi_file_xml_url;
  const { data: originale, error: erroreOriginale } = useQuery({
    queryKey: ["anteprima-xml-emessa", documento.company_id, documento.id, documento.sdi_file_xml_url],
    enabled: archiviato,
    queryFn: () => leggiXmlFattura(documento as DocumentoFiscale, null),
    retry: false,
  });
  const esito = useMemo<EsitoAnteprima | null>(() => {
    try {
      if (erroreOriginale) throw erroreOriginale;
      esigiOriginaleSeTrasmesso(documento as DocumentoFiscale);
      if (archiviato && !originale) return null;
      if (!originale && !azienda) throw new Error("I dati dell'azienda non sono ancora caricati.");
      const xml = archiviato ? originale!.xml : generateFatturaPAXML(documento as DocumentoFiscale, azienda!);
      const foglio = fatturaXmlTabellareHtml(xml, { direzione: 'emessa', dentroIframe: true });
      return { foglio, errore: null, sezioni: sezioniFatturaXml(xml), versione: versioneFatturaXml(xml) };
    } catch (e) {
      return { foglio: null, errore: messaggioErrore(e), sezioni: [], versione: "" };
    }
  }, [documento, azienda, archiviato, originale, erroreOriginale]);
  const foglio = esito?.foglio;

  return (
    <div className="w-full" style={scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: "top center" }}>
      <div className="space-y-2 p-2" data-testid="anteprima-xml">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
          <span>{archiviato ? t("File XML archiviato") : t("Anteprima del file XML per lo SDI")}{esito?.versione ? ` · ${esito.versione}` : ""}</span>
          {mostraStampa && foglio && <Button variant="outline" size="sm" onClick={() => {
            stampaPreventivoNativo(foglio.html, foglio.titolo).catch(() => toast.error(t("Impossibile preparare la stampa da XML.")));
          }}><Printer className="mr-1.5 h-3.5 w-3.5" />{t("Stampa / Salva PDF da XML")}</Button>}
        </div>
        {!esito ? <p role="status" className="p-2 text-sm text-muted-foreground">{t("Caricamento dell’XML archiviato…")}</p> : esito.errore ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive" role="alert">{t("Anteprima XML non disponibile.")} {esito.errore}</p>
        ) : foglio && <>
          <iframe title={foglio.titolo} srcDoc={foglio.html} sandbox="" className="h-[min(64dvh,680px)] w-full rounded-md border bg-white" />
          <details className="rounded-md border bg-card p-2">
            <summary className="cursor-pointer text-sm font-medium">{t("Struttura XML")}</summary>
            <div className="mt-2 space-y-2">{esito.sezioni.map((s, i) => <Blocco key={i} nodo={s} livello={0} />)}</div>
          </details>
        </>}
      </div>
    </div>
  );
}
