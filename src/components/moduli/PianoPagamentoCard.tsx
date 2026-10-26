/**
 * «Come paga il cliente» nel preventivo (26/10/2026): le rate di QUESTO preventivo, in due modi —
 * modalità di pagamento (firma, inizio, fine lavori…) oppure a SAL (stati avanzamento). Gli importi si vedono
 * subito sul prezzo del preventivo e finiscono nel PDF al posto della frase generica del modello.
 *
 * Si parte dai modelli di pagamento dell'azienda (Impostazioni → Modelli di pagamento), che sono gli stessi con cui
 * nascono le rate della commessa: il piano si copia nel preventivo, e il modello può cambiare senza toccarlo.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeEuro, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EVENTI_RATA, GRUPPI_EVENTO, type GruppoEvento } from "@/lib/orders/rateEventi";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import {
  MAX_NOME_RATA_PIANO, MAX_RATE_PIANO, cambiaModo, leggiPianoPagamento, pianoCompleto, pianoDaModello,
  pianoRateDiPartenza, pianoSalDiPartenza, quandoSiPaga, rateConImporti, totalePercentuali,
  type ModoPagamento, type PianoPagamento, type RataPreventivo,
} from "@/lib/preventivi/pianoPagamento";

interface Props {
  /** Il piano com'è salvato sul preventivo (null = non ancora deciso). */
  piano: unknown;
  onChange: (piano: PianoPagamento | null) => void;
  /** Il totale IVA inclusa del preventivo: gli importi delle rate si leggono su questo. */
  totale: number;
  /** Il testo del modello, se c'è: senza piano è quello che finisce nel PDF. */
  testoDelModello?: string | null;
}

/** Gli eventi da offrire in ognuno dei due modi. */
const eventiDelModo = (modo: ModoPagamento) =>
  GRUPPI_EVENTO.map((g) => ({
    gruppo: g,
    eventi: EVENTI_RATA.filter((e) => e.gruppo === g.value && e.value !== "stato_commessa"
      && (modo === "sal" || e.value !== "sal_numero")),
  })).filter((g) => g.eventi.length > 0);

const arrotonda2 = (n: number) => Math.round(n * 100) / 100;

export function PianoPagamentoCard({ piano: raw, onChange, totale, testoDelModello }: Props) {
  const piano = leggiPianoPagamento(raw);
  const { modelli } = useModelliPagamento();
  const [modelloScelto, setModelloScelto] = useState("");

  const scrivi = (p: PianoPagamento) => onChange(p);
  const cambiaRiga = (i: number, patch: Partial<RataPreventivo>) => {
    if (!piano) return;
    const righe = piano.righe.map((r, k) => (k === i ? { ...r, ...patch } : r));
    scrivi({ ...piano, righe });
  };

  if (!piano) {
    const senzaTesto = !String(testoDelModello ?? "").replace(/<[^>]*>/g, " ").trim();
    return (
      <div className={cn("rounded-lg border p-3", senzaTesto && "border-amber-300 bg-amber-50")}>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Come paga il cliente
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {senzaTesto
            ? "Nel PDF non compare nessun pagamento: nel modello non è scritto niente. Scrivi qui le rate di questo preventivo."
            : "Nel PDF esce la frase scritta nel modello. Qui puoi fare le rate di questo preventivo, con gli importi."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => scrivi(pianoRateDiPartenza())}>Modalità di pagamento</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => scrivi(pianoSalDiPartenza())}>A SAL</Button>
          {modelli.length > 0 && (
            <Select value={modelloScelto} onValueChange={(v) => { setModelloScelto(v); const m = modelli.find((x) => x.id === v); if (m) scrivi(pianoDaModello(m)); }}>
              <SelectTrigger className="h-8 w-auto min-w-[11rem] text-xs" aria-label="Parti da un modello di pagamento"><SelectValue placeholder="Da un modello…" /></SelectTrigger>
              <SelectContent>{modelli.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </div>
    );
  }

  const righe = rateConImporti(piano, totale);
  const somma = totalePercentuali(piano.righe);
  const completo = pianoCompleto(piano);
  const gruppi = eventiDelModo(piano.modo);

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Come paga il cliente
        </p>
        <div role="group" aria-label="Modo di pagamento" className="flex gap-1.5">
          {([["rate", "Modalità di pagamento"], ["sal", "A SAL"]] as const).map(([modo, etichetta]) => (
            <button
              key={modo}
              type="button"
              aria-pressed={piano.modo === modo}
              onClick={() => scrivi(cambiaModo(piano, modo))}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                piano.modo === modo ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200",
              )}
            >
              {etichetta}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 px-3 py-2">
        {piano.righe.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_4.5rem_auto_auto]">
            <Input
              aria-label={`Nome della rata ${i + 1}`}
              value={r.nome}
              maxLength={MAX_NOME_RATA_PIANO}
              onChange={(e) => cambiaRiga(i, { nome: e.target.value })}
              className="h-8 text-xs"
            />
            <Select value={r.evento} onValueChange={(v) => cambiaRiga(i, { evento: v as RataPreventivo["evento"], numero: v === "sal_numero" ? (r.numero ?? 1) : null })}>
              <SelectTrigger className="h-8 text-xs max-sm:col-span-2" aria-label={`Quando si paga la rata ${i + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {gruppi.map((g) => (
                  <SelectGroup key={g.gruppo.value}>
                    <SelectLabel>{g.gruppo.label}</SelectLabel>
                    {g.eventi.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <div className="relative max-sm:col-span-1">
              <Input
                aria-label={`Percentuale della rata ${i + 1}`}
                inputMode="decimal"
                value={String(r.percent)}
                onChange={(e) => cambiaRiga(i, { percent: arrotonda2(Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0))) })}
                className="h-8 pr-5 text-right text-xs tabular-nums"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
            </div>
            <span className="text-right text-xs font-semibold tabular-nums">{formatCurrency(righe[i]?.importo ?? 0)}</span>
            <button
              type="button"
              aria-label={`Togli la rata ${i + 1}`}
              onClick={() => scrivi({ ...piano, righe: piano.righe.filter((_, k) => k !== i) })}
              disabled={piano.righe.length <= 1}
              className="rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex gap-1.5">
            {piano.righe.length < MAX_RATE_PIANO && (
              <Button
                type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => {
                  const sal = piano.modo === "sal";
                  const prossimo = sal ? Math.max(0, ...piano.righe.map((r) => r.numero ?? 0)) + 1 : null;
                  scrivi({ ...piano, righe: [...piano.righe, {
                    nome: sal ? `SAL ${prossimo}` : "Rata", percent: arrotonda2(Math.max(0, 100 - somma)),
                    evento: sal ? "sal_numero" : "fine_lavori", numero: prossimo,
                  }] });
                }}
              >
                <Plus className="h-3 w-3" />{piano.modo === "sal" ? "Aggiungi un SAL" : "Aggiungi una rata"}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-500" onClick={() => onChange(null)}>
              Togli il piano
            </Button>
          </div>
          <span className={cn("text-[11px] font-semibold tabular-nums", completo ? "text-emerald-700" : "text-amber-700")}>
            {completo ? `Totale ${formatCurrency(totale)}` : `${somma}% di 100 — mancano ${arrotonda2(100 - somma)} punti`}
          </span>
        </div>

        {!completo && (
          <p role="alert" className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            Finché le rate non fanno 100 il piano non esce nel PDF: il cliente vedrebbe un piano che non copre il prezzo.
          </p>
        )}

        <div>
          <Label className="text-[11px] text-muted-foreground" htmlFor="piano-note">Nota sui pagamenti (facoltativa)</Label>
          <Input
            id="piano-note"
            value={piano.note ?? ""}
            placeholder="Es. Bonifico bancario a 30 giorni data fattura."
            onChange={(e) => scrivi({ ...piano, note: e.target.value || null })}
            className="mt-0.5 h-8 text-xs"
          />
        </div>

        <p className="text-[10px] text-muted-foreground max-sm:hidden">
          Le stesse rate diventano quelle della commessa quando il cliente accetta.{" "}
          <Link to="/azienda/impostazioni/modelli-pagamento" className="underline">I modelli dell'azienda</Link> sono il punto di partenza.
        </p>
      </div>
    </div>
  );
}

/** Le righe come si leggono: per l'anteprima e per chi mostra il piano senza modificarlo. */
export function righeDelPiano(raw: unknown, totale: number) {
  const piano = leggiPianoPagamento(raw);
  if (!pianoCompleto(piano)) return [];
  return rateConImporti(piano, totale).map((r) => ({ ...r, quando: quandoSiPaga(r) }));
}
