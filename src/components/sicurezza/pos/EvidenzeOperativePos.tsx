import { useState } from "react";
import { CheckCheck, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDpiCommessa } from "@/hooks/useDpiCommessa";
import { useDocumentiSicurezza } from "@/hooks/useDocumentiSicurezza";
import { chiamaServerPos } from "@/hooks/usePos";
import { TIPI_DPI } from "@/lib/sicurezza/dpiCommessa";
import { dataRiscontriDpiPos, dpiPrevistiPos, riscontriDpiDisponibili, stessoRiscontroDpi, suggerisciRiscontriDpiPos, type FonteRumorePos, type RiscontroDpiPos } from "../../../../supabase/functions/_shared/posEvidenzeOperative";
import type { AllegatoPos, Lavorazione } from "../../../../supabase/functions/_shared/posModello";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const stileSelect = "block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

export async function apriRapportoRumorePos(companyId: string, posId: string, fonte: FonteRumorePos, pagina?: number) {
  const finestra = window.open("about:blank", "_blank");
  if (!finestra) throw new Error("Consenti l’apertura della scheda per consultare il rapporto");
  finestra.opener = null;
  try {
    const { url } = await chiamaServerPos<{ url: string }>({ azione: "fonte_rapporto_rumore", company_id: companyId,
      pos_id: posId, origine: fonte.origine, documento_id: fonte.id, sha256: fonte.sha256, apri: true });
    finestra.location.href = pagina && Number.isSafeInteger(pagina) && pagina > 0 ? `${url}#page=${pagina}` : url;
  } catch (e) {
    finestra.close();
    throw e;
  }
}

export function ScegliRapportoRumorePos({ companyId, orderId, posId, allegati, collega }: {
  companyId: string; orderId: string; posId: string; allegati: AllegatoPos[];
  collega: (fonte: FonteRumorePos) => void;
}) {
  const t = useT();
  const documenti = useDocumentiSicurezza(companyId, orderId);
  const [selezionato, setSelezionato] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const rapporti = (documenti.data ?? []).filter(d =>
    d.fonte === "sicurezza" && !d.subappaltatore_id && d.tipo === "valutazione_rumore" && d.file_path);
  const collegaRapporto = async () => {
    const indice = selezionato.indexOf(":");
    if (indice <= 0) return;
    setInCorso(true);
    try {
      const { fonte } = await chiamaServerPos<{ fonte: FonteRumorePos }>({
        azione: "fonte_rapporto_rumore", company_id: companyId, pos_id: posId,
        origine: selezionato.slice(0, indice), documento_id: selezionato.slice(indice + 1),
      });
      collega(fonte);
      setSelezionato("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Collegamento del rapporto non riuscito"));
    } finally { setInCorso(false); }
  };
  return <div className="space-y-2 rounded-md border bg-muted/20 p-3">
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{t("Originale del rapporto")}</span>
      <select className={stileSelect} value={selezionato} onChange={e => setSelezionato(e.target.value)} disabled={inCorso}>
        <option value="">{documenti.isLoading ? t("Caricamento archivio…") : t("Scegli il documento")}</option>
        {!!rapporti.length && <optgroup label={t("Archivio sicurezza")}>
          {rapporti.map(d => <option key={d.id} value={`archivio:${d.id}`}>{d.titolo}{d.data_documento ? ` · ${d.data_documento}` : ""}</option>)}
        </optgroup>}
        {!!allegati.length && <optgroup label={t("Allegati del POS")}>
          {allegati.map(d => <option key={d.file_path} value={`allegato:${d.file_path}`}>{d.nome}</option>)}
        </optgroup>}
      </select>
    </label>
    {documenti.isError && <p role="alert" className="text-xs text-destructive">{t("Archivio sicurezza non disponibile. Riprova o scegli un allegato del POS.")}</p>}
    {!documenti.isLoading && !rapporti.length && !allegati.length && <p className="text-xs text-muted-foreground">{t("Carica il rapporto in Archivio sicurezza o negli Allegati del POS e salva la bozza.")}</p>}
    <Button type="button" size="sm" variant="outline" disabled={!selezionato || inCorso} onClick={() => void collegaRapporto()}>
      {inCorso ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Paperclip className="mr-1.5 size-4" />} {t("Collega originale")}
    </Button>
  </div>;
}

function RegistroDpiPos({ l, companyId, orderId, aggiungi, aggiungiInGruppo }: {
  l: Lavorazione; companyId: string; orderId: string; aggiungi: (r: RiscontroDpiPos) => void; aggiungiInGruppo?: (righe: RiscontroDpiPos[]) => void;
}) {
  const t = useT();
  const [previsto, setPrevisto] = useState("");
  const [consegna, setConsegna] = useState("");
  const data = dataRiscontriDpiPos();
  const quadro = useDpiCommessa(companyId, orderId, data, l.fase_id || undefined);
  const previsti = dpiPrevistiPos(l.dpi);
  const richiesto = previsti.includes(previsto) ? previsto : "";
  const disponibili = richiesto ? riscontriDpiDisponibili(quadro.data?.addetti ?? [], richiesto, data, l.fase_id)
    .filter(r => !l.riscontri_dpi?.some(x => stessoRiscontroDpi(x, r))) : [];
  const corrispondenze = aggiungiInGruppo && l.svolgimento !== "subappalto" && quadro.data && !quadro.isError
    ? suggerisciRiscontriDpiPos(previsti, quadro.data.addetti, l.riscontri_dpi ?? [], data, l.fase_id) : undefined;
  const proposte = corrispondenze?.proposte.slice(0, Math.max(0, 250 - (l.riscontri_dpi?.length ?? 0))) ?? [];
  const scelto = disponibili.find(d => d.consegna_id === consegna);
  return <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
    <label className="space-y-1.5 text-xs font-medium">
      <span>{t("DPI previsto dalla scheda")}</span>
      <select className={stileSelect} value={richiesto} onChange={e => { setPrevisto(e.target.value); setConsegna(""); }}>
        <option value="">{t("Scegli il DPI")}</option>
        {previsti.map(d => <option key={d}>{d}</option>)}
      </select>
    </label>
    <label className="space-y-1.5 text-xs font-medium">
      <span>{t("Consegna registrata all’addetto")}</span>
      <select className={stileSelect} value={scelto?.consegna_id ?? ""} onChange={e => setConsegna(e.target.value)} disabled={!richiesto || !disponibili.length}>
        <option value="">{quadro.isLoading ? t("Lettura del registro…") : richiesto && !disponibili.length ? t("Nessuna consegna disponibile") : t("Scegli addetto e consegna")}</option>
        {disponibili.map(r => <option key={r.consegna_id} value={r.consegna_id}>{r.addetto} · {TIPI_DPI[r.tipo] ? t(TIPI_DPI[r.tipo]) : r.tipo} · {r.data}</option>)}
      </select>
    </label>
    <Button type="button" size="sm" variant="outline" disabled={!scelto} onClick={() => {
      if (!scelto) return;
      aggiungi(scelto);
      setConsegna("");
    }}><Plus className="mr-1 size-4" /> {t("Collega consegna")}</Button>
    {corrispondenze && (proposte.length > 0 || corrispondenze.daScegliere.length > 0 || corrispondenze.mancanti.length > 0 || corrispondenze.manuali.length > 0) && <details className="rounded-md border bg-background p-2.5 sm:col-span-3">
      <summary className="cursor-pointer text-xs font-medium">{t("Abbinamenti dal registro · {n} proposti", { n: proposte.length })}</summary>
      {!!proposte.length && <>
        <ul className="mt-2 max-h-40 divide-y overflow-auto text-xs">
          {proposte.map(r => <li key={`${r.previsto}:${r.consegna_id}`} className="py-1">{r.addetto} · {r.previsto} · {r.data}</li>)}
        </ul>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => aggiungiInGruppo?.(proposte)}>
          <CheckCheck className="mr-1 size-4" />{t("Conferma")} {proposte.length} {proposte.length === 1 ? t("abbinamento") : t("abbinamenti")}
        </Button>
      </>}
      {([{ valori: corrispondenze.daScegliere, etichetta: t("Più consegne da scegliere") },
        { valori: corrispondenze.mancanti, etichetta: t("Consegne da riscontrare") },
        { valori: corrispondenze.manuali, etichetta: t("DPI da associare manualmente") }]).map(({ valori, etichetta }) => valori.length > 0 &&
          <div className="mt-2 text-xs text-muted-foreground" key={etichetta}>
            <p className="font-medium">{etichetta} · {valori.length}</p>
            <ul className="max-h-24 list-disc overflow-auto pl-4">{valori.map((v, i) => <li key={`${i}:${v}`}>{v}</li>)}</ul>
          </div>)}
    </details>}
    {quadro.isError && <p role="alert" className="text-xs text-destructive sm:col-span-3">{t("Registro DPI non disponibile.")}</p>}
    {scelto && <p className="text-xs text-muted-foreground sm:col-span-3">{t("Verifica che «{dpi}» corrisponda al DPI richiesto dalla scheda.", { dpi: TIPI_DPI[scelto.tipo] ? t(TIPI_DPI[scelto.tipo]) : scelto.tipo })}</p>}
  </div>;
}

export function ConsegneDpiLavorazionePos({ l, companyId, orderId, ro, aggiungi, aggiungiInGruppo, togli }: {
  l: Lavorazione; companyId?: string; orderId?: string; ro: boolean;
  aggiungi: (r: RiscontroDpiPos) => void; aggiungiInGruppo?: (righe: RiscontroDpiPos[]) => void; togli: (r: RiscontroDpiPos) => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const previsti = dpiPrevistiPos(l.dpi);
  const consegne = l.riscontri_dpi ?? [];
  if (!previsti.length && !consegne.length) return null;
  const senzaCollegamento = previsti.filter(d => !consegne.some(c => c.previsto === d));
  return <div className="space-y-2 rounded-md border bg-muted/20 p-3 sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-1">
      <h4 className="text-sm font-semibold">{t("Consegne DPI collegate")} <span className="font-normal text-muted-foreground">· {consegne.length}</span></h4>
      {!ro && companyId && orderId && !!previsti.length && <Button type="button" size="sm" variant="ghost" aria-expanded={aperto} onClick={() => setAperto(p => !p)}>
        {aperto ? t("Chiudi registro") : t("Scegli dal registro DPI")}
      </Button>}
    </div>
    {!!consegne.length && <ul className="divide-y rounded-md border bg-background">
      {consegne.map(r => <li key={JSON.stringify([r.previsto, r.consegna_id])} className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
        <span><strong>{r.previsto}</strong> · {r.addetto} · {TIPI_DPI[r.tipo] ? t(TIPI_DPI[r.tipo]) : r.tipo} · {r.data}
          {!previsti.includes(r.previsto) && <span className="block text-amber-800">{t("DPI previsto modificato. Riesamina il collegamento.")}</span>}
        </span>
        {!ro && <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t("Togli la consegna di {addetto}", { addetto: String(r.addetto ?? "") })} onClick={() => togli(r)}><Trash2 className="size-3.5" /></Button>}
      </li>)}
    </ul>}
    {!!senzaCollegamento.length && <p className="text-xs text-muted-foreground">{t("Da riscontrare nel registro: {senzaCollegamento}.", { senzaCollegamento: senzaCollegamento.join(", ") })}</p>}
    {aperto && !ro && companyId && orderId && <RegistroDpiPos l={l} companyId={companyId} orderId={orderId} aggiungi={aggiungi} aggiungiInGruppo={aggiungiInGruppo} />}
  </div>;
}
