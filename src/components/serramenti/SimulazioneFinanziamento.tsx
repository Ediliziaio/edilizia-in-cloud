/**
 * La simulazione del finanziamento dello step Economia dei Serramenti (06/10/2026). Si sceglie in fretta, con un
 * tocco, e si confrontano le rate senza aprire tendine:
 *  - anticipo: i tasti 0/10/20/30/40% e il campo, con l'importo in € accanto e quanto resta da finanziare;
 *  - durate: un tasto per durata con SOPRA la rata già calcolata («48 rate · € 183/mese»); quella scelta è
 *    evidenziata e il riepilogo (rata × rate, TAN, TAEG, totale dovuto) sta in una riga;
 *  - tabella: se la finanziaria ne ha una sola è già quella, e niente tendina; con più tabelle la tendina resta;
 *  - manuale (TAN libero): resta, compatta, con la rata di ciascun piano;
 *  - fuori fascia: se l'importo da finanziare supera l'ultima fascia della tabella NON si mostra nessuna rata (quella
 *    dell'ultima fascia sarebbe sbagliata) ma un messaggio che dice cosa fare; le durate che non arrivano a quell'importo
 *    non hanno tasto e vengono elencate;
 *  - anticipo e rate: se le rate (negli schemi con finanziamento) dicono un anticipo diverso da quello della scheda,
 *    la scheda lo dice, con un tasto per allinearlo.
 *
 * Il componente non salva niente: legge quello che c'è nel preventivo e dice a chi lo usa cosa è stato scelto. L'unico
 * stato è il testo che si sta scrivendo nel campo dell'anticipo (si può svuotare per riscrivere). I conti (rata, TAN,
 * TAEG, totale dovuto) vengono dalle funzioni di sempre.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/serramenti/format";
import type { RigaFinanziamento, TabellaFinanziamento } from "@/hooks/useTabelleFinanziamento";
import {
  ANTICIPI_VELOCI, importoFinanziatoDa, type DurataConRata, type PianiManuali, type PianoManuale,
} from "@/lib/serramenti/pianoFinanziamento";
import type { SrPianoFinanziamento } from "@/types/serramenti";
import { LinkImpostazione } from "@/components/impostazioni/LinkImpostazione";

export type ModalitaFinanziamento = "tabella" | "manuale";

interface Props {
  /** Il totale del preventivo, IVA inclusa. */
  totale: number;
  anticipoPct: number;
  onAnticipo: (pct: number) => void;
  modalita: ModalitaFinanziamento;
  onModalita: (modalita: ModalitaFinanziamento) => void;
  /** Le tabelle attive della finanziaria. Senza nessuna c'è solo il piano manuale. */
  tabelle: TabellaFinanziamento[];
  tabelleInCaricamento: boolean;
  tabellaId: string | null;
  onTabella: (id: string) => void;
  righeInCaricamento: boolean;
  /** Una durata per tasto, con la riga giusta per l'importo e quindi la rata già calcolata. */
  durate: DurataConRata[];
  /** La durata che sta nel preventivo (quella salvata). */
  durataScelta: number | null;
  onDurata: (durataMesi: number) => void;
  /** La riga che sta nel preventivo, per il riepilogo. */
  rigaScelta: RigaFinanziamento | null;
  /** L'importo che il finanziamento paga (il totale meno l'anticipo), e l'ultima fascia della tabella: per il messaggio «fuori fascia». */
  importoFinanziato: number;
  fasciaMassima: number | null;
  /** Le durate della tabella che per questo importo non hanno una rata (l'importo supera la loro ultima fascia). */
  durateFuoriFascia: number[];
  /** L'anticipo che dicono le rate (percentuale), se lo schema le lega all'anticipo; null altrimenti. */
  anticipoDalleRate: number | null;
  manuale: PianiManuali;
  onManuale: (piani: PianiManuali) => void;
  /** I due piani manuali con la rata calcolata. */
  pianiManuali: SrPianoFinanziamento[];
  /** Il piano manuale c'è già nel preventivo (altrimenti i valori sono quelli di partenza, ancora da confermare). */
  manualeNelPreventivo: boolean;
}

const CHIP = "rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:min-h-9";
const CHIP_ACCESO = "border-orange-400 bg-orange-50 text-orange-800";
const CHIP_SPENTO = "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50";

/** TAN e TAEG come scritti in tabella: «5,9%», «6,45%». */
const percento = (n: number): string => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;

export function SimulazioneFinanziamento(p: Props) {
  const conTabelle = p.tabelle.length > 0;
  return (
    <div className="space-y-3">
      {p.tabelleInCaricamento ? (
        <p className="text-xs text-muted-foreground">Carico le tabelle della finanziaria…</p>
      ) : (
        <>
          {conTabelle ? (
            <div
              role="tablist"
              aria-label="Modalità finanziamento"
              className="flex w-full gap-1 rounded-md bg-muted p-1 md:w-fit"
            >
              {([
                { m: "tabella" as const, corto: "Da tabella", lungo: " configurata" },
                { m: "manuale" as const, corto: "Manuale", lungo: " (TAN libero)" },
              ]).map((t) => (
                <button
                  key={t.m}
                  type="button"
                  role="tab"
                  aria-selected={p.modalita === t.m}
                  onClick={() => { if (p.modalita !== t.m) p.onModalita(t.m); }}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors max-md:flex-1 max-md:min-h-9",
                    p.modalita === t.m ? "bg-white font-semibold text-orange-600 shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.corto}<span className="max-md:hidden">{t.lungo}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Nessuna tabella finanziaria configurata: si usa il piano manuale.{" "}
              <LinkImpostazione to="/azienda/impostazioni/finanziamenti" className="font-semibold underline">Impostazioni → Finanziamenti</LinkImpostazione>
              <span className="max-sm:hidden"> per caricarla.</span>
            </p>
          )}

          {p.modalita === "tabella" && conTabelle && <SceltaTabella {...p} />}

          <Anticipo totale={p.totale} anticipoPct={p.anticipoPct} onAnticipo={p.onAnticipo} anticipoDalleRate={p.anticipoDalleRate} />

          {p.modalita === "tabella" && conTabelle ? <DurateTabella {...p} /> : <Manuale {...p} />}
        </>
      )}
    </div>
  );
}

function Anticipo({ totale, anticipoPct, onAnticipo, anticipoDalleRate }: Pick<Props, "totale" | "anticipoPct" | "onAnticipo" | "anticipoDalleRate">) {
  const anticipoEur = (totale * anticipoPct) / 100;
  // Il campo si può svuotare per riscrivere il numero: finché è vuoto non si scrive niente (non vale «0%», che è «tutto
  // finanziato» e toglie le rate dell'acconto). È solo il testo che si sta scrivendo: uscendo dal campo torna quello salvato.
  const [bozza, setBozza] = useState<string | null>(null);
  const alleRateDiversoDaQui = anticipoDalleRate != null && Math.abs(anticipoDalleRate - anticipoPct) >= 0.005;
  return (
    <div className="space-y-1.5">
      {/* Telefono: cinque colonne uguali (a capo bruttissimo con quattro tasti più uno), l'etichetta sopra. */}
      <div role="group" aria-label="Anticipo" className="grid grid-cols-5 items-center gap-1.5 md:flex md:flex-wrap">
        <span className="col-span-5 text-[11px] text-muted-foreground md:col-auto">Anticipo</span>
        {ANTICIPI_VELOCI.map((pct) => (
          <button
            key={pct}
            type="button"
            aria-pressed={Math.abs(anticipoPct - pct) < 0.005}
            onClick={() => onAnticipo(pct)}
            className={cn(CHIP, "max-md:px-1", Math.abs(anticipoPct - pct) < 0.005 ? CHIP_ACCESO : CHIP_SPENTO)}
          >
            {pct}%
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0} max={100} step={5}
            value={bozza ?? anticipoPct}
            onChange={(e) => {
              setBozza(e.target.value);
              if (e.target.value.trim() !== "") onAnticipo(Math.max(0, Math.min(100, Number(e.target.value) || 0)));
            }}
            onBlur={() => setBozza(null)}
            aria-label="Anticipo in percentuale"
            className="h-9 w-20 px-2 text-right text-xs tabular-nums md:text-xs"
          />
          <span aria-hidden="true">%</span>
          <span className="tabular-nums">= <strong className="text-slate-800">{formatEuro(anticipoEur)}</strong></span>
        </span>
        <span>
          Finanziato <strong className="tabular-nums text-orange-700">{formatEuro(importoFinanziatoDa(totale, anticipoPct))}</strong>
          <span className="max-sm:hidden"> su {formatEuro(totale)}</span>
        </span>
      </div>
      {alleRateDiversoDaQui && anticipoDalleRate != null && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
        >
          <span>
            Le rate sopra hanno un anticipo del <strong>{percento(anticipoDalleRate)}</strong> ({formatEuro((totale * anticipoDalleRate) / 100)}),
            qui è del {percento(anticipoPct)}: il preventivo dice due cose.
          </span>
          <button
            type="button"
            onClick={() => onAnticipo(anticipoDalleRate)}
            className="rounded-full border border-amber-300 bg-white px-3 py-1 font-semibold text-amber-900 transition-colors hover:bg-amber-100 max-md:min-h-9"
          >
            Usa il {percento(anticipoDalleRate)}
          </button>
        </p>
      )}
    </div>
  );
}

function SceltaTabella(p: Props) {
  const etichetta = (t: TabellaFinanziamento) => `${t.nome_prodotto}${t.finanziaria_nome ? ` · ${t.finanziaria_nome}` : ""}`;
  return p.tabelle.length === 1 ? (
    <p className="text-xs text-slate-600">
      Tabella: <strong className="text-slate-800">{etichetta(p.tabelle[0])}</strong>
    </p>
  ) : (
    <Select value={p.tabellaId ?? ""} onValueChange={p.onTabella}>
      <SelectTrigger className="h-9 text-xs" aria-label="Tabella finanziamento">
        <SelectValue placeholder="Scegli la tabella…" />
      </SelectTrigger>
      <SelectContent>
        {p.tabelle.map((t) => <SelectItem key={t.id} value={t.id}>{etichetta(t)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DurateTabella(p: Props) {
  const tabella = p.tabelle.find((t) => t.id === p.tabellaId) ?? null;
  return (
    <div className="space-y-2.5">
      {p.tabellaId == null ? (
        <p className="text-[11px] text-amber-700">Scegli una tabella per vedere le rate.</p>
      ) : p.righeInCaricamento ? (
        <p className="text-xs text-muted-foreground">Carico le rate…</p>
      ) : p.durate.length === 0 && p.fasciaMassima != null ? (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Fuori fascia.</strong> L'importo da finanziare ({formatEuro(p.importoFinanziato)}) supera le fasce della tabella
          (fino a {formatEuro(p.fasciaMassima)}): non c'è nessuna rata da mostrare. Aumenta l'anticipo, scegli un'altra tabella o usa la modalità manuale.
        </p>
      ) : p.durate.length === 0 ? (
        <p className="text-[11px] text-amber-700">
          {tabella ? "Questa tabella non ha ancora righe" : "Tabella senza righe"}: caricale in Impostazioni → Finanziamenti, oppure usa il piano manuale.
        </p>
      ) : (
        <div role="group" aria-label="Quante rate" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
          {p.durate.map((d) => {
            const attiva = p.durataScelta === d.durataMesi;
            return (
              <button
                key={d.durataMesi}
                type="button"
                aria-pressed={attiva}
                title={`Durata ${d.durataMesi} mesi${d.riga.tan != null ? ` · TAN ${percento(d.riga.tan)}` : ""}`}
                onClick={() => p.onDurata(d.durataMesi)}
                className={cn(
                  "rounded-md border px-1.5 py-1.5 text-center transition-colors max-md:min-h-12",
                  attiva ? "border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-300" : "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50",
                )}
              >
                <span className="block whitespace-nowrap text-sm font-semibold leading-tight">{d.riga.numero_rate} rate</span>
                <span className="block whitespace-nowrap text-[11px] tabular-nums leading-tight sm:text-xs">{formatEuro(d.riga.importo_rata)}/mese</span>
              </button>
            );
          })}
        </div>
      )}

      {p.durate.length > 0 && p.durateFuoriFascia.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Senza rata a questo importo (oltre l'ultima fascia): {p.durateFuoriFascia.map((mesi) => `${mesi} mesi`).join(", ")}.
        </p>
      )}

      {p.durate.length > 0 && (
        p.rigaScelta ? (
          <p className="rounded-md border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs text-orange-900" aria-live="polite">
            <strong className="tabular-nums">{p.rigaScelta.numero_rate} rate da {formatEuro(p.rigaScelta.importo_rata)}</strong>
            <span> · TAN {p.rigaScelta.tan != null ? percento(p.rigaScelta.tan) : "—"}</span>
            <span> · TAEG {p.rigaScelta.taeg != null ? percento(p.rigaScelta.taeg) : "—"}</span>
            <span> · totale dovuto <strong className="tabular-nums">
              {formatEuro(p.rigaScelta.importo_totale_dovuto ?? p.rigaScelta.importo_rata * p.rigaScelta.numero_rate)}
            </strong></span>
            <span className="max-sm:hidden text-orange-700/80"> · valori letti dalla tabella ufficiale</span>
          </p>
        ) : (
          <p className="text-[11px] text-amber-700">Scegli le rate: il piano compare nel preventivo.</p>
        )
      )}
    </div>
  );
}

function Manuale(p: Props) {
  const righe: Array<{ chiave: keyof PianiManuali; titolo: string; piano: PianoManuale; calcolato?: SrPianoFinanziamento }> = [
    { chiave: "estesa", titolo: "Piano Estesa", piano: p.manuale.estesa, calcolato: p.pianiManuali[0] },
    { chiave: "standard", titolo: "Piano Standard", piano: p.manuale.standard, calcolato: p.pianiManuali[1] },
  ];
  const cambia = (chiave: keyof PianiManuali, campo: keyof PianoManuale, valore: number) =>
    p.onManuale({ ...p.manuale, [chiave]: { ...p.manuale[chiave], [campo]: valore } });
  return (
    <div className="space-y-2">
      {!p.manualeNelPreventivo && (
        <p className="text-[11px] text-amber-700">
          Non ancora nel preventivo: cambia un valore, o l'anticipo, per inserirlo.
        </p>
      )}
      {righe.map((r) => (
        <div
          key={r.chiave}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md border border-orange-100 bg-orange-50/40 px-3 py-2 md:grid-cols-[7rem_minmax(0,1fr)_auto]"
        >
          <p className="text-xs font-semibold uppercase text-orange-900">{r.titolo}</p>
          <p className="text-right text-sm font-bold tabular-nums text-orange-600 md:order-3">
            {formatEuro(r.calcolato?.rata_mese ?? 0)}/mese
          </p>
          <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-600 md:order-2 md:col-span-1">
            <Input
              type="number"
              inputMode="numeric"
              value={r.piano.mesi}
              onChange={(e) => cambia(r.chiave, "mesi", Number(e.target.value) || 0)}
              aria-label={`${r.titolo}: durata in mesi`}
              className="h-9 w-20 px-2 text-right text-xs tabular-nums md:text-xs"
            />
            <span>mesi</span>
            <span className="ml-1">TAN</span>
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              value={r.piano.tasso}
              onChange={(e) => cambia(r.chiave, "tasso", Number(e.target.value) || 0)}
              aria-label={`${r.titolo}: TAN in percentuale`}
              className="h-9 w-20 px-2 text-right text-xs tabular-nums md:text-xs"
            />
            <span>%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
