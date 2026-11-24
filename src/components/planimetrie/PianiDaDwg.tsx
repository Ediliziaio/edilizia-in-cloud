import { useState } from "react";
import { Box, CheckCircle2, Layers3, Plus, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MASSIMO_PIANI_DWG, METRI_PER_UNITA_DWG, UNITA_DWG, direzioniDistinteDwg, rettangoloInRitaglio, ritaglioInCoordinateDwg, unitaCompatibiliDwg, unitaDwgValida,
  type QuotaDwg, type RiferimentoDwg, type RichiestaModelloDwg, type RiscontroQuotaDwg,
} from "@/lib/planimetrie/coordinateDwg";
import type { RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface SelezionePiano {
  id: string;
  nome: string;
  quotaMetri: string;
  ritaglio: RitaglioPianta;
}

const misuraRitaglio = () => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 });
const classeSelect = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const direzioneQuota = ({ angolo }: QuotaDwg) => angolo < 5 || angolo > 175 ? "orizzontale" : Math.abs(angolo - 90) < 5 ? "verticale" : "obliqua";

function opzioniQuote(scelta: QuotaDwg | undefined, quote: QuotaDwg[]) {
  const viste = new Set<string>();
  return (scelta ? [scelta, ...quote] : quote).filter(q => {
    const chiave = [q.testo, q.lunghezza.toPrecision(5), Math.round(q.angolo) % 180].join("|");
    if (viste.has(chiave)) return false;
    viste.add(chiave);
    return true;
  });
}

function leggiMetri(valore: string) {
  const testo = valore.trim();
  const metri = /^\d+(?:[.,]\d{1,4})?$/.test(testo) ? Number(testo.replace(",", ".")) : 0;
  return metri > 0 && metri <= 1e6 ? metri : null;
}

function stessoRitaglio(a: RitaglioPianta, b: RitaglioPianta) {
  return Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1
    && Math.abs(a.width - b.width) < 0.1 && Math.abs(a.height - b.height) < 0.1;
}

export function PianiDaDwg({ riferimento, ritaglio, occupato, onAggiunto, onRicostruisci }: {
  riferimento: RiferimentoDwg;
  ritaglio: RitaglioPianta | null;
  occupato: boolean;
  onAggiunto: () => void;
  onRicostruisci: (richiesta: RichiestaModelloDwg, tagli: RitaglioPianta[], quoteConfermate: RiscontroQuotaDwg[]) => void;
}) {
  const t = useT();
  const [piani, setPiani] = useState<SelezionePiano[]>([]);
  const [unita, setUnita] = useState(riferimento.unita?.toString() ?? "");
  const [altezza, setAltezza] = useState("2.70");
  const [layerMuri, setLayerMuri] = useState("");
  const [quoteScelte, setQuoteScelte] = useState([{ id: "", metri: "" }, { id: "", metri: "" }]);
  const numero = piani.length;
  const quotaGiaUsata = (quota: number) => piani.some((p) => Number(p.quotaMetri) === quota);
  const unitaSelezionata = Number(unita);
  const taglioDiRiferimento = piani[0]?.ritaglio ?? ritaglio;
  const rettangoloDiRiferimento = taglioDiRiferimento && ritaglioInCoordinateDwg(riferimento.rettangolo, taglioDiRiferimento);
  const larghezzaMetri = rettangoloDiRiferimento && unitaDwgValida(unitaSelezionata)
    ? (rettangoloDiRiferimento[2] - rettangoloDiRiferimento[0]) * METRI_PER_UNITA_DWG[unitaSelezionata] : null;
  const quote = riferimento.quote ?? [];
  const quoteNelPiano = rettangoloDiRiferimento ? quote.filter(({ punto: [x, y] }) =>
    x >= rettangoloDiRiferimento[0] && y >= rettangoloDiRiferimento[1] && x <= rettangoloDiRiferimento[2] && y <= rettangoloDiRiferimento[3]) : quote;
  const prima = quote.find(q => q.id === quoteScelte[0].id) ?? quoteNelPiano[0] ?? quote[0];
  const seconda = quote.find(q => q.id === quoteScelte[1].id) ?? (prima && (
    quoteNelPiano.find(q => direzioniDistinteDwg(prima, q)) ?? quote.find(q => direzioniDistinteDwg(prima, q))));
  const righeQuote = [prima, seconda].map((quota, i) => ({ quota, testo: quoteScelte[i].metri, metri: leggiMetri(quoteScelte[i].metri) }));
  const quoteInserite = righeQuote.flatMap(({ quota, metri }) => quota && metri !== null ? [{ quota, metri }] : []);
  const quoteNonValide = righeQuote.some(r => r.testo.trim() && (!r.quota || r.metri === null));
  const unitaCompatibili = unitaCompatibiliDwg(quoteInserite);
  const discordanza = quoteInserite.length > 0 && (!unitaCompatibili.length || (unitaDwgValida(unitaSelezionata) && !unitaCompatibili.includes(unitaSelezionata)));
  const doppiaDirezione = prima && seconda && direzioniDistinteDwg(prima, seconda);
  const quoteConfermate = doppiaDirezione && quoteInserite.length === 2 && unitaDwgValida(unitaSelezionata) && !discordanza ? quoteInserite : [];
  const suggerita = (discordanza || !unitaDwgValida(unitaSelezionata)) && unitaCompatibili.length === 1 ? unitaCompatibili[0] : null;
  const scegliQuota = (i: number, id: string, metri: string) =>
    setQuoteScelte(correnti => correnti.map((r, j) => (i === j ? { id, metri } : r)));
  const metri = Number(altezza);
  const righeValide = piani.every((p) => p.nome.trim() && p.quotaMetri.trim() && Number.isFinite(Number(p.quotaMetri)));
  const aggiungi = () => {
    if (!ritaglio || piani.some((p) => stessoRitaglio(p.ritaglio, ritaglio)) || numero >= MASSIMO_PIANI_DWG) return;
    const nomi = ["Piano terra", "Primo piano", "Secondo piano", "Terzo piano", "Quarto piano", "Quinto piano"];
    let quota = numero * 3;
    while (quotaGiaUsata(quota)) quota += 3;
    setPiani([...piani, { id: crypto.randomUUID(), nome: nomi[numero], quotaMetri: String(quota), ritaglio }]);
    onAggiunto();
  };
  const ricostruisci = () => {
    if (!unitaDwgValida(unitaSelezionata) || !numero || !righeValide || discordanza || quoteNonValide) return;
    const richiesta = {
      unita: unitaSelezionata,
      altezza: Math.round(metri * 100),
      layerMuri,
      piani: piani.map((p) => ({
        nome: p.nome,
        quota: Math.round(Number(p.quotaMetri) * 100),
        rettangolo: ritaglioInCoordinateDwg(riferimento.rettangolo, p.ritaglio),
      })),
    };
    onRicostruisci(richiesta, piani.map((p) => p.ritaglio), quoteConfermate);
  };
  const proposta = riferimento.pianiProposti;
  const selezioniProposte = (): SelezionePiano[] => proposta?.piani.map((p) => ({
    id: crypto.randomUUID(), nome: p.nome, quotaMetri: String(p.quota / 100), ritaglio: rettangoloInRitaglio(riferimento.rettangolo, p.rettangolo),
  })) ?? [];
  // Un clic: i piani trovati, con l'unità e il layer letti, vanno direttamente alla ricostruzione.
  const ricavaProposti = () => {
    if (!proposta || !(metri >= 2 && metri <= 8)) return;
    const selezioni = selezioniProposte();
    onRicostruisci({ unita: proposta.unita, altezza: Math.round(metri * 100), layerMuri: proposta.layerMuri, piani: proposta.piani },
      selezioni.map((p) => p.ritaglio), []);
  };
  const correggiProposti = () => {
    if (!proposta) return;
    setPiani(selezioniProposte());
    setUnita(String(proposta.unita));
    setLayerMuri(proposta.layerMuri);
  };
  const modifica = (id: string, patch: Partial<Pick<SelezionePiano, "nome" | "quotaMetri">>) =>
    setPiani((correnti) => correnti.map((p) => p.id === id ? { ...p, ...patch } : p));
  const selezioneAggiunta = ritaglio && piani.some((p) => stessoRitaglio(p.ritaglio, ritaglio));

  return (
    <section aria-labelledby="titolo-modello-dwg" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Layers3 className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="titolo-modello-dwg" className="font-semibold">{t("Pianta modificabile e 3D")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("Ritaglia e aggiungi ogni piano, poi verifica le quote.")}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={aggiungi}
          disabled={occupato || !ritaglio || !!selezioneAggiunta || numero >= MASSIMO_PIANI_DWG}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {selezioneAggiunta ? t("Ritaglio aggiunto") : t("Aggiungi ritaglio come piano")}
        </Button>
      </div>

      {proposta && numero === 0 && (
        <div role="status" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">{proposta.piani.length === 1 ? t("Ho trovato 1 pianta nella tavola") : t("Ho trovato {n} piante nella tavola", { n: proposta.piani.length })}</p>
          <ul className="text-sm text-muted-foreground">
            {proposta.piani.map((p) => <li key={p.quota}>{p.nome} · {t("quota {m} m", { m: (p.quota / 100).toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) })}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">
            {t("Muri dal layer «{layer}», misure in {unita}.", { layer: proposta.layerMuri, unita: t(UNITA_DWG[proposta.unita]).toLowerCase() })}
            {riferimento.unita !== null && riferimento.unita !== proposta.unita && ` ${t("Il file dichiara {unita}, ma le stanze tornano solo così.", { unita: t(UNITA_DWG[riferimento.unita]).toLowerCase() })}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-1.5" disabled={occupato || metri < 2 || metri > 8} onClick={ricavaProposti}>
              <Box className="h-4 w-4" aria-hidden="true" />
              {proposta.piani.length === 1 ? t("Ricava la pianta trovata") : t("Ricava i {n} piani trovati", { n: proposta.piani.length })}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={occupato} onClick={correggiProposti}>{t("Correggi prima")}</Button>
          </div>
        </div>
      )}

      {numero > 0 && (
        <ul className="space-y-2">
          {piani.map((p, indice) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2 rounded-lg bg-muted/45 p-2.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_auto]">
              <div className="space-y-1">
                <Label htmlFor={`${p.id}-nome`} className="text-xs">{t("Piano {n}", { n: indice + 1 })}</Label>
                <Input id={`${p.id}-nome`} value={p.nome} maxLength={70} onChange={(event) => modifica(p.id, { nome: event.target.value })} className="bg-card" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${p.id}-quota`} className="text-xs">{t("Quota (m)")}</Label>
                <Input id={`${p.id}-quota`} aria-label={t("Quota del piano {n} in metri", { n: indice + 1 })} type="number" step="0.01" value={p.quotaMetri}
                  onChange={(event) => modifica(p.id, { quotaMetri: event.target.value })} className="bg-card" />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-10 w-9" aria-label={t("Rimuovi {nome}", { nome: p.nome || t("piano {n}", { n: indice + 1 }) })}
                onClick={() => setPiani((correnti) => correnti.filter((selezione) => selezione.id !== p.id))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="unita-dwg" className="text-xs">{t("Unità del DWG")}</Label>
          <select id="unita-dwg" value={unita} onChange={(event) => setUnita(event.target.value)} className={classeSelect} disabled={occupato}>
            <option value="">{t("Scegli l’unità")}</option>
            {Object.entries(UNITA_DWG).map(([id, nome]) => <option key={id} value={id}>{t(nome)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altezza-muri-dwg" className="text-xs">{t("Altezza dei muri (m)")}</Label>
          <Input id="altezza-muri-dwg" type="number" step="0.01" min={2} max={8} value={altezza} onChange={(event) => setAltezza(event.target.value)} />
        </div>
      </div>
      {larghezzaMetri !== null && <p className="text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {piani.length ? t("Larghezza del primo piano ritagliato con questa unità") : t("Larghezza del ritaglio con questa unità")}{" "}
        <strong className="font-semibold tabular-nums text-foreground">{misuraRitaglio().format(larghezzaMetri)} m</strong>.
      </p>}
      <fieldset className="space-y-2.5 rounded-lg border bg-muted/20 p-3" disabled={occupato}>
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold"><Ruler className="h-4 w-4 text-primary" aria-hidden="true" /> {t("Verifica la scala")}</legend>
        {!!quote.length && <>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("Scegli due quote in direzioni diverse e riporta le loro misure in metri.")}</p>
          {righeQuote.map(({ quota, testo, metri }, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`quota-dwg-${i}`} className="text-xs">{t("Quota {n} sulla tavola", { n: i + 1 })}</Label>
                <select id={`quota-dwg-${i}`} className={classeSelect} value={quota?.id ?? ""} onChange={e => scegliQuota(i, e.target.value, "")}>
                  <option value="" disabled>{t("Scegli una quota")}</option>
                  {opzioniQuote(quota, [...quoteNelPiano, ...quote]).map(q => <option key={q.id} value={q.id}>{q.testo} · {direzioneQuota(q)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`quota-dwg-metri-${i}`} className="text-xs">{t("Quota {n} in m", { n: i + 1 })}</Label>
                <Input id={`quota-dwg-metri-${i}`} value={testo} type="text" inputMode="decimal" maxLength={14}
                  placeholder="m" aria-invalid={!!testo.trim() && metri === null} disabled={!quota}
                  onChange={e => quota && scegliQuota(i, quota.id, e.target.value)} />
              </div>
            </div>
          ))}
        </>}
        {riferimento.unita !== null && <p className="text-xs text-muted-foreground">{t("Unità dichiarata dal file · {unita}", { unita: t(UNITA_DWG[riferimento.unita]) })}</p>}
        {quoteNonValide ? <p role="alert" className="text-xs text-destructive">{t("Inserisci le quote in metri, per esempio 3,50.")}</p>
          : discordanza || suggerita ? <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
            <p>{suggerita ? t("Unità compatibile con le quote inserite · {unita}", { unita: t(UNITA_DWG[suggerita]) }) : t("Le quote indicano scale diverse. Controlla i valori in metri sulla tavola.")}</p>
            {suggerita && <Button type="button" size="sm" variant="outline" className="mt-2 h-8" onClick={() => setUnita(String(suggerita))}>{t("Usa {unita}", { unita: t(UNITA_DWG[suggerita]).toLowerCase() })}</Button>}
          </div> : quoteConfermate.length ? <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t("Scala coerente su due quote")}</p>
            : <p role="status" className="text-xs text-muted-foreground">
              {quoteInserite.length === 2 && !doppiaDirezione ? `${t("Scegli due quote in direzioni diverse per completare il riscontro.")} ` :
                !quote.length ? `${t("Quote CAD leggibili assenti.")} ` : ""}{t("Puoi aprire la pianta e completare il riscontro nell’editor. Le quantità metriche restano sospese nel computo.")}
            </p>}
      </fieldset>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Layer dei muri")}</summary>
        <Input aria-label={t("Nome del layer dei muri")} value={layerMuri} onChange={(event) => setLayerMuri(event.target.value)}
          placeholder={t("Automatico")} maxLength={120} className="mt-2 max-w-xs" />
      </details>
      <Button type="button" className="w-full gap-2 sm:w-auto" disabled={occupato || !numero || !unitaDwgValida(unitaSelezionata)
        || !righeValide || metri < 2 || metri > 8 || discordanza || quoteNonValide} onClick={ricostruisci}>
        <Box className="h-4 w-4" aria-hidden="true" />
        {t("Ricava pianta e 3D")}
      </Button>
    </section>
  );
}
