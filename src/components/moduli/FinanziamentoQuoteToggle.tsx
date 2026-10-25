/**
 * FinanziamentoQuoteToggle — la rata nel PDF, scelta PER-PREVENTIVO.
 *
 * Prima il toggle appariva SEMPRE con un testo astratto ("vale solo se la
 * promo è attiva nel template"): il venditore non poteva sapere se la promo
 * fosse configurata, e accenderlo poteva essere un no-op silenzioso. Ora:
 *   - se la company NON ha configurato la promo nel template → NON compare
 *     (niente scelta finta);
 *   - se è configurata → mostra la rata CONCRETA calcolata sul totale attuale,
 *     così il venditore vede esattamente cosa uscirà, e può spegnerla per i
 *     clienti che pagano subito;
 *   - acceso, sotto l'interruttore si sceglie il NUMERO DI RATE (06/10/2026):
 *     una fila di tasti con la rata di ciascuno già scritta, così si confronta
 *     e si sceglie con un tocco. Finché non se ne sceglie uno vale quello del
 *     modello; il TAN è quello del modello.
 *   - se l'azienda ha le tabelle delle finanziarie (Impostazioni → Finanziamenti) compare, prima delle rate, la
 *     scelta della FINANZIARIA (24/10/2026): con quella scelta i tasti sono le durate della sua tabella, ognuno con
 *     la rata vera della tabella per il totale di adesso, e il preventivo ricorda tabella, TAN, rata e importo.
 *     Una azienda con le tabelle ma senza promo nel modello vede comunque la scelta.
 */
import { useEffect, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BadgeEuro } from "lucide-react";
import {
  parseFinanziamentoPromo,
  calcolaRataMensile,
  opzioniRate,
  rateDelPreventivo,
  type SceltaFinanziaria,
} from "@/lib/preventivi/finanziamentoLite";
import { durateConRata } from "@/lib/serramenti/pianoFinanziamento";
import {
  useTabelleFinanziamentoAttive, useTabellaFinanziamentoRighe,
  type TabellaFinanziamento, type RigaFinanziamento,
} from "@/hooks/useTabelleFinanziamento";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { percentualeIt } from "@/lib/preventivi/percentuale";

/** Quello che il preventivo ricorda della finanziaria scelta. */
export interface ScelteFinanziamento {
  rate: number | null;
  tabellaId: string | null;
  tanPct: number | null;
  rata: number | null;
  importo: number | null;
}

interface Props {
  /** Valore grezzo finanziamento_promo dal template del modulo. */
  rawPromo: unknown;
  /** Totale del preventivo corrente (per la rata di anteprima). */
  total: number;
  /** null/true = mostra, false = nascondi (default mostra se promo attiva). */
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  /** Le rate scelte per questo preventivo (null/undefined = quelle del modello). */
  rateScelte?: number | null;
  /** Se c'è, sotto l'interruttore compare la scelta del numero di rate. */
  onChangeRate?: (rate: number) => void;
  /** La finanziaria già scelta sul preventivo (tabella, TAN, rata e importo). */
  finanziaria?: (SceltaFinanziaria & { tabellaId: string | null }) | null;
  /** Se c'è e l'azienda ha tabelle di finanziarie, compare la scelta della finanziaria. */
  onChangeFinanziaria?: (scelte: ScelteFinanziamento) => void;
}

const alCentesimo = (n: number) => Math.round(n * 100) / 100;

const NESSUNA_TABELLA: TabellaFinanziamento[] = [];
const NESSUNA_RIGA: RigaFinanziamento[] = [];

/**
 * Senza `onChangeFinanziaria` (o per un modulo che non la offre) il selettore non legge le finanziarie: resta
 * quello di sempre, a rate e TAN del modello. Con la scelta delle finanziarie legge le tabelle dell'azienda.
 */
export function FinanziamentoQuoteToggle(props: Props) {
  return props.onChangeFinanziaria
    ? <ConTabelle {...props} />
    : <Selettore {...props} tutteLeTabelle={NESSUNA_TABELLA} righe={NESSUNA_RIGA} righeInCaricamento={false} />;
}

function ConTabelle(props: Props) {
  const { data: tutteLeTabelle = NESSUNA_TABELLA } = useTabelleFinanziamentoAttive();
  const tabellaId = tutteLeTabelle.find((t) => t.id === props.finanziaria?.tabellaId)?.id;
  const { data: righe = NESSUNA_RIGA, isLoading } = useTabellaFinanziamentoRighe(tabellaId);
  return <Selettore {...props} tutteLeTabelle={tutteLeTabelle} righe={righe} righeInCaricamento={isLoading && !!tabellaId} />;
}

function Selettore({
  rawPromo, total, value, onChange, rateScelte, onChangeRate, finanziaria, onChangeFinanziaria,
  tutteLeTabelle, righe, righeInCaricamento,
}: Props & { tutteLeTabelle: TabellaFinanziamento[]; righe: RigaFinanziamento[]; righeInCaricamento: boolean }) {
  const promo = parseFinanziamentoPromo(rawPromo);
  const conFinanziarie = !!onChangeFinanziaria && tutteLeTabelle.length > 0;
  // Una tabella scelta e poi disattivata o cancellata non conta più: si torna al modello.
  const tabella = conFinanziarie ? tutteLeTabelle.find((t) => t.id === finanziaria?.tabellaId) ?? null : null;

  const scelte = rateDelPreventivo(rateScelte);
  const rate = scelte ?? promo?.rate ?? 84;
  const importo = alCentesimo(Math.max(0, Number(total) || 0));
  const durate = useMemo(() => (tabella ? durateConRata(righe, importo) : []), [tabella, righe, importo]);
  const durataScelta = tabella
    ? durate.find((d) => d.durataMesi === rate) ?? durate.find((d) => d.durataMesi >= rate) ?? durate[durate.length - 1] ?? null
    : null;

  // La rata, il TAN e l'importo del preventivo seguono la tabella e il totale di adesso: dopo uno sconto o
  // un cambio di prezzo il PDF non resta alla rata di prima.
  useEffect(() => {
    if (!onChangeFinanziaria || !tabella || !durataScelta || !(importo > 0)) return;
    const riga = durataScelta.riga;
    const tanPct = riga.tan ?? tabella.tan_base ?? null;
    const uguale = scelte === durataScelta.durataMesi
      && (finanziaria?.tanPct ?? null) === tanPct
      && (finanziaria?.rata ?? null) === riga.importo_rata
      && (finanziaria?.importo ?? null) === importo;
    if (uguale) return;
    onChangeFinanziaria({ rate: durataScelta.durataMesi, tabellaId: tabella.id, tanPct, rata: riga.importo_rata, importo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabella?.id, durataScelta?.durataMesi, durataScelta?.riga.importo_rata, durataScelta?.riga.tan, importo, scelte, finanziaria?.tanPct, finanziaria?.rata, finanziaria?.importo]);

  if (!promo && !conFinanziarie) return null; // company senza promo né finanziarie → nessun toggle fuorviante

  const checked = value !== false;
  const rataModello = promo ? calcolaRataMensile(total, rate, promo.tan_pct) : 0;
  const rata = durataScelta ? durataScelta.riga.importo_rata : rataModello;
  const rateMostrate = durataScelta ? durataScelta.durataMesi : rate;
  const tanMostrato = durataScelta ? (durataScelta.riga.tan ?? tabella?.tan_base ?? null) : promo?.tan_pct ?? null;
  const nomeFinanziaria = tabella ? [tabella.finanziaria_nome, tabella.nome_prodotto].filter(Boolean).join(" · ") : null;

  const scegliFinanziaria = (id: string) => {
    if (!onChangeFinanziaria) return;
    if (id === "__modello__") {
      onChangeFinanziaria({ rate: scelte, tabellaId: null, tanPct: null, rata: null, importo: null });
    } else {
      // Tabella nuova: i numeri si riempiono appena se ne leggono le righe.
      onChangeFinanziaria({ rate: scelte, tabellaId: id, tanPct: null, rata: null, importo: null });
    }
  };

  return (
    <div className="rounded-lg border">
      <label className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" />
            Mostra la rata nel PDF
          </span>
          <span className="block text-[10px] text-muted-foreground">
            {rata > 0 ? (
              <>
                <span className="max-sm:hidden">
                  {`“da ${formatCurrency(rata)}/mese” in ${rateMostrate} rate${tanMostrato != null && tanMostrato > 0 ? ` (TAN ${percentualeIt(tanMostrato)})` : " a tasso zero"}${nomeFinanziaria ? ` con ${nomeFinanziaria}` : ""} — spegni per chi paga subito.`}
                </span>
                {/* Telefono: la rata e basta. */}
                <span className="sm:hidden">{`da ${formatCurrency(rata)}/mese · ${rateMostrate} rate`}</span>
              </>
            ) : conFinanziarie && !promo && !tabella ? (
              "Scegli la finanziaria qui sotto: la rata nel PDF viene dalla sua tabella."
            ) : (
              `Aggiungi voci al computo per calcolare la rata (${rateMostrate} rate).`
            )}
          </span>
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </label>

      {checked && conFinanziarie && (
        <div className="border-t px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-slate-700">Finanziaria</p>
          <Select value={tabella?.id ?? (promo ? "__modello__" : "")} onValueChange={scegliFinanziaria}>
            <SelectTrigger className="h-9 text-xs" aria-label="Finanziaria">
              <SelectValue placeholder="Scegli la finanziaria" />
            </SelectTrigger>
            <SelectContent>
              {promo && (
                <SelectItem value="__modello__">
                  {`Condizioni del modello (${rate} rate${promo.tan_pct > 0 ? `, TAN ${percentualeIt(promo.tan_pct)}` : ", tasso zero"})`}
                </SelectItem>
              )}
              {tutteLeTabelle.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {[t.finanziaria_nome, t.nome_prodotto].filter(Boolean).join(" · ") || "Tabella"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {checked && tabella && (
        <div className="border-t px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-slate-700">Numero di rate</p>
          {righeInCaricamento ? (
            <p className="text-[11px] text-muted-foreground">Carico la tabella…</p>
          ) : durate.length === 0 ? (
            <p role="alert" className="text-[11px] text-amber-700">
              {importo > 0
                ? "Per questo importo la tabella non ha una rata: scegli un'altra finanziaria o le condizioni del modello."
                : "Aggiungi voci al computo per calcolare la rata."}
            </p>
          ) : (
            <div role="group" aria-label="Numero di rate" className="flex flex-wrap gap-1.5">
              {durate.map((d) => {
                const attivo = durataScelta?.durataMesi === d.durataMesi;
                return (
                  <button
                    key={d.durataMesi}
                    type="button"
                    aria-pressed={attivo}
                    onClick={() => onChangeFinanziaria?.({
                      rate: d.durataMesi, tabellaId: tabella.id, tanPct: d.riga.tan ?? tabella.tan_base ?? null,
                      rata: d.riga.importo_rata, importo,
                    })}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left leading-tight transition-colors",
                      attivo
                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50",
                    )}
                  >
                    <span className="block text-xs font-semibold">{`${d.durataMesi} rate`}</span>
                    <span className="block text-[10px] tabular-nums text-muted-foreground">{`${formatCurrency(d.riga.importo_rata)}/mese`}</span>
                  </button>
                );
              })}
            </div>
          )}
          {durataScelta && (
            <p className="mt-1.5 text-[10px] text-muted-foreground max-sm:hidden">
              {`Finanziato ${formatCurrency(importo)} · ${durataScelta.riga.numero_rate} rate da ${formatCurrency(durataScelta.riga.importo_rata)}`}
              {durataScelta.riga.importo_totale_dovuto ? ` · totale dovuto ${formatCurrency(durataScelta.riga.importo_totale_dovuto)}` : ""}
              {durataScelta.riga.taeg != null ? ` · TAEG ${percentualeIt(durataScelta.riga.taeg)}` : ""}
            </p>
          )}
        </div>
      )}

      {checked && !tabella && promo && onChangeRate && (
        <div className="border-t px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-slate-700">Numero di rate</p>
          <div role="group" aria-label="Numero di rate" className="flex flex-wrap gap-1.5">
            {opzioniRate(promo.rate, scelte).map((n) => {
              const rataN = calcolaRataMensile(total, n, promo.tan_pct);
              const attivo = n === rate;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={attivo}
                  onClick={() => onChangeRate(n)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-left leading-tight transition-colors",
                    attivo
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50",
                  )}
                >
                  <span className="block text-xs font-semibold">{`${n} rate`}</span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {rataN > 0 ? `${formatCurrency(rataN)}/mese` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Telefono no: la nota sul TAN è per chi sta alla scrivania. */}
          <p className="mt-1.5 text-[10px] text-muted-foreground max-sm:hidden">
            {promo.tan_pct > 0 ? `TAN ${percentualeIt(promo.tan_pct)}` : "Tasso zero"}, come nel modello.
            {scelte != null && scelte !== promo.rate ? ` Il modello propone ${promo.rate} rate.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
