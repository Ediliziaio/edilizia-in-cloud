/**
 * I complementi di una finestra, dentro il suo box nella composizione
 * dell'offerta: tapparella, zanzariera, cassonetto, persiana.
 *
 * Ogni riga ha le sue misure (il cassonetto anche la profondità), i pezzi, le
 * varianti e il prezzo del listino, che si rifà quando cambiano. «Cambia
 * modello» riapre il listino sulla sua tipologia: la tapparella blindata su una
 * finestra sola. Le regole stanno in lib/serramenti/complementiFinestra.
 */
import { useEffect, useMemo, useRef } from "react";
import { ExternalLink, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { useFamily } from "@/hooks/useFamilies";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import { scelteDopo } from "@/lib/listino/scelteVariante";
import { haProfondita, nomeBreve, nomeComplemento, prezzoComplemento } from "@/lib/serramenti/complementiFinestra";
import { formatEuro } from "@/lib/serramenti/format";
import { useListinoGriglia } from "@/lib/serramenti/queries";
import { misuraDaTesto, quantitaDaTesto } from "@/lib/serramenti/righePreventivo";
import { cn } from "@/lib/utils";
import { SR_ACCESSORI_TIPI, type SrAccessorioRow, type SrSerramentoRow } from "@/types/serramenti";
import { BarraComplementi } from "./BarraComplementi";
import { SceltaVariante } from "./SceltaVariante";

type PatchComplemento = (patch: Partial<SrAccessorioRow>) => void;

/**
 * Il prezzo di un complemento del listino, rifatto quando cambiano misure, pezzi
 * o varianti: prima una tapparella allargata o passata a motorizzata restava al
 * prezzo di prima. «Misura libera» resta al prezzo scritto dal commerciale.
 */
function useRicalcoloComplemento(
  a: SrAccessorioRow,
  tariffePrezzi: Map<string, number>,
  supplierLineMap: Map<string, SupplierProductLine>,
  onPatch: PatchComplemento,
) {
  const { data: griglia = [], isLoading: grigliaInCaricamento } = useListinoGriglia(a.family_id);
  const { family: famiglia, isLoading: famigliaInCaricamento } = useFamily(a.family_id);
  const modalita = famiglia?.modalita_prezzo_base ?? a.modalita_prezzo ?? null;
  const prezzoAutomatico = !!a.family_id && modalita !== "misura_libera";
  const datiInArrivo = !!a.family_id && (grigliaInCaricamento || famigliaInCaricamento);
  const ricalcoloInSospeso = useRef<{
    L: number | null;
    H: number | null;
    Q: number;
    scelte: Record<string, string>;
  } | null>(null);
  const lineaFornitore = a.supplier_product_line_id
    ?? griglia.find((g) => g.id === a.listino_voce_id)?.supplier_product_line_id
    ?? null;

  /** Prezzo unitario dal listino con varianti e posa; null se adesso non si può calcolare. */
  const prezzoDaListino = (L: number | null, H: number | null, Q: number, scelte: Record<string, string>) => {
    if (!famiglia || !prezzoAutomatico) return null;
    if (famiglia.modalita_prezzo_base === "griglia" && griglia.length === 0) return null;
    const esito = prezzoComplemento({
      famiglia,
      valori: scelte,
      larghezza: L,
      altezza: H,
      quantita: Q || 1,
      posaEsclusa: a.posa_esclusa,
      griglia,
      tariffePrezzi,
      supplierLines: supplierLineMap,
      lineaFornitore,
    });
    return "errore" in esito ? null : esito;
  };

  const aggiorna = (patch: Partial<SrAccessorioRow>) => {
    const L = patch.larghezza_mm !== undefined ? patch.larghezza_mm : a.larghezza_mm;
    const H = patch.altezza_mm !== undefined ? patch.altezza_mm : a.altezza_mm;
    const Q = patch.quantita ?? a.quantita ?? 1;
    const scelte = patch.valori_assi ?? a.valori_assi ?? {};
    const prezzo = prezzoDaListino(L, H, Q, scelte);
    if (prezzo) {
      onPatch({ ...patch, prezzo_unitario: prezzo.unitario, ...(prezzo.voce ? { listino_voce_id: prezzo.voce } : {}) });
      return;
    }
    if (prezzoAutomatico && datiInArrivo) ricalcoloInSospeso.current = { L, H, Q, scelte };
    onPatch(patch);
  };

  // Il ricalcolo chiesto mentre griglia e varianti erano in arrivo si rifà appena
  // arrivano, con misure e scelte di quel momento.
  useEffect(() => {
    const attesa = ricalcoloInSospeso.current;
    if (!attesa || datiInArrivo) return;
    ricalcoloInSospeso.current = null;
    const prezzo = prezzoDaListino(attesa.L, attesa.H, attesa.Q, attesa.scelte);
    if (!prezzo) return;
    onPatch({
      larghezza_mm: attesa.L,
      altezza_mm: attesa.H,
      quantita: attesa.Q,
      valori_assi: attesa.scelte,
      prezzo_unitario: prezzo.unitario,
      ...(prezzo.voce ? { listino_voce_id: prezzo.voce } : {}),
    });
    // Scatta solo quando i dati arrivano: il ricalcolo usa la richiesta salvata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datiInArrivo]);

  const fuoriMisura = useMemo(() => {
    if (!famiglia || famiglia.modalita_prezzo_base !== "griglia" || griglia.length === 0) return false;
    if (!a.larghezza_mm || !a.altezza_mm) return false;
    const esito = prezzoComplemento({
      famiglia,
      valori: {},
      larghezza: a.larghezza_mm,
      altezza: a.altezza_mm,
      quantita: a.quantita || 1,
      posaEsclusa: true,
      griglia,
      tariffePrezzi,
      supplierLines: supplierLineMap,
      lineaFornitore,
    });
    return "errore" in esito && esito.motivo === "fuori_listino";
  }, [famiglia, griglia, a.larghezza_mm, a.altezza_mm, a.quantita, tariffePrezzi, supplierLineMap, lineaFornitore]);

  const conMisure = modalita === "mq" || modalita === "griglia";
  const scelteRiga = a.valori_assi ?? {};
  // Le varianti con un valore acceso, o già scelte sulla riga.
  const assi = (famiglia?.axes ?? []).filter((ax) => ax.values.some((v) => v.attivo) || !!scelteRiga[ax.codice]);
  return {
    aggiorna,
    fuoriMisura,
    assi,
    scelteRiga,
    prezzoAutomatico,
    mancaMisura: prezzoAutomatico && conMisure && (!a.larghezza_mm || !a.altezza_mm),
  };
}

function CampoMisura({
  id, etichetta, valore, onCambia, manca = false,
}: {
  id: string;
  etichetta: string;
  valore: number | null;
  onCambia: (mm: number | null) => void;
  /** La misura serve e manca: il campo si vede. */
  manca?: boolean;
}) {
  return (
    <div className="w-[4.75rem]">
      <Label htmlFor={id} className={cn("text-[10px]", manca ? "font-semibold text-amber-700" : "text-muted-foreground")}>
        {etichetta}
      </Label>
      <Input
        id={id}
        // Anche la finestra cambia le misure dei suoi complementi: il campo riparte dal valore salvato.
        key={`${id}-${valore ?? ""}`}
        type="number"
        inputMode="numeric"
        min={1}
        defaultValue={valore ?? ""}
        placeholder="mm"
        onBlur={(e) => {
          const mm = misuraDaTesto(e.target.value);
          // Non valida torna quella salvata; uguale non ricalcola.
          e.target.value = String((mm === undefined ? valore : mm) ?? "");
          if (mm !== undefined && mm !== valore) onCambia(mm);
        }}
        className={cn("h-8 px-2 text-xs", manca && "border-amber-300 bg-amber-50/60")}
      />
    </div>
  );
}

interface RigaProps {
  a: SrAccessorioRow;
  tariffePrezzi: Map<string, number>;
  supplierLineMap: Map<string, SupplierProductLine>;
  onPatch: PatchComplemento;
  onElimina: () => void;
  /** Riapre il listino sulla tipologia del complemento. */
  onCambiaModello?: () => void;
  /** Per un complemento senza finestra: le finestre a cui agganciarlo, numerate come nella composizione. */
  finestre?: ReadonlyArray<{ id: string; etichetta: string }>;
}

/** Un complemento: nome, misure, pezzi, prezzo, varianti. */
export function ComplementoRiga({
  a, tariffePrezzi, supplierLineMap, onPatch, onElimina, onCambiaModello, finestre,
}: RigaProps) {
  const { aggiorna, fuoriMisura, assi, scelteRiga, prezzoAutomatico, mancaMisura } =
    useRicalcoloComplemento(a, tariffePrezzi, supplierLineMap, onPatch);
  const dalListino = !!a.family_id;
  const nome = a.descrizione || nomeBreve(a.tipo);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
        <div className="min-w-[10rem] flex-1 basis-44">
          {dalListino ? (
            <div className="min-w-0 pb-0.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                <Sparkles className="h-2.5 w-2.5" />
                {nomeComplemento(a)}
              </div>
              <div className="truncate text-xs font-medium text-slate-800" title={nome}>{nome}</div>
            </div>
          ) : (
            <div className="flex min-w-0 gap-1">
              <Select value={a.tipo} onValueChange={(v) => onPatch({ tipo: v })}>
                <SelectTrigger className="h-8 w-32 shrink-0 text-xs" aria-label="Tipo di complemento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SR_ACCESSORI_TIPI.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                defaultValue={a.descrizione ?? ""}
                onBlur={(e) => {
                  const descrizione = e.target.value.trim() || null;
                  if (descrizione !== (a.descrizione ?? null)) onPatch({ descrizione });
                }}
                placeholder="Descrizione"
                aria-label="Descrizione del complemento"
                className="h-8 min-w-0 text-xs"
              />
            </div>
          )}
        </div>

        <CampoMisura
          id={`${a.id}-larghezza`}
          etichetta="Largh."
          valore={a.larghezza_mm}
          onCambia={(mm) => aggiorna({ larghezza_mm: mm })}
          manca={mancaMisura && !a.larghezza_mm}
        />
        <CampoMisura
          id={`${a.id}-altezza`}
          etichetta="Alt."
          valore={a.altezza_mm}
          onCambia={(mm) => aggiorna({ altezza_mm: mm })}
          manca={mancaMisura && !a.altezza_mm}
        />
        {haProfondita(a) && (
          <CampoMisura
            id={`${a.id}-profondita`}
            etichetta="Prof."
            valore={a.profondita_mm ?? null}
            onCambia={(mm) => onPatch({ profondita_mm: mm })}
            manca={!a.profondita_mm}
          />
        )}
        <div className="w-14">
          <Label htmlFor={`${a.id}-pezzi`} className="text-[10px] text-muted-foreground">Pezzi</Label>
          <Input
            id={`${a.id}-pezzi`}
            key={`${a.id}-pezzi-${a.quantita}`}
            type="number"
            min={1}
            defaultValue={a.quantita}
            onBlur={(e) => {
              const pezzi = quantitaDaTesto(e.target.value) ?? a.quantita;
              e.target.value = String(pezzi);
              if (pezzi !== a.quantita) aggiorna({ quantita: pezzi });
            }}
            className="h-8 px-2 text-xs"
          />
        </div>
        <div className="w-24">
          <Label htmlFor={`${a.id}-prezzo`} className="text-[10px] text-muted-foreground">€ cad.</Label>
          <Input
            id={`${a.id}-prezzo`}
            key={`${a.id}-prezzo-${a.prezzo_unitario ?? ""}`}
            type="number"
            step="0.01"
            defaultValue={a.prezzo_unitario ?? ""}
            onBlur={(e) => {
              const valore = e.target.value ? Number(e.target.value) : null;
              if (valore !== a.prezzo_unitario) onPatch({ prezzo_unitario: valore });
            }}
            title={prezzoAutomatico ? "Dal listino: si ricalcola quando cambi misure, pezzi o varianti." : undefined}
            className="h-8 px-2 text-xs"
          />
        </div>
        <div className="w-20 pb-2 text-right text-xs font-semibold tabular-nums text-orange-600">
          {formatEuro(a.prezzo_totale)}
        </div>
        <div className="flex items-center">
          {onCambiaModello && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCambiaModello}
              className="h-8 gap-1 px-2 text-[11px] text-slate-600"
            >
              <RefreshCw className="h-3 w-3" />
              {dalListino ? "Cambia modello" : "Dal listino"}
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onElimina}
            className="h-8 w-8"
            aria-label={`Elimina ${nome}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      </div>

      {fuoriMisura ? (
        <p className="mt-1 text-[10px] font-medium text-rose-700">Misure fuori dal listino: il prezzo non si aggiorna</p>
      ) : mancaMisura ? (
        <p className="mt-1 text-[10px] font-medium text-amber-700">Scrivi larghezza e altezza: il prezzo del listino si calcola da lì</p>
      ) : null}

      {assi.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-1.5">
          {assi.map((axis) => {
            const scelto = scelteRiga[axis.codice] ?? "";
            const manca = axis.obbligatorio && !scelto;
            return (
              <div key={axis.id} className="min-w-[150px] space-y-0.5">
                <Label className={cn("text-[10px]", manca ? "font-semibold text-rose-700" : "text-muted-foreground")}>
                  {axis.nome}
                  {axis.obbligatorio ? " *" : ""}
                </Label>
                <SceltaVariante
                  values={axis.values}
                  valueId={scelto}
                  scelta={(a.scelte_assi ?? {})[axis.codice]}
                  onChange={(valueId, voce) => {
                    const scelte_assi = scelteDopo(a.scelte_assi, axis.codice, voce);
                    // Un altro colore della stessa fascia: il prezzo non cambia.
                    if (valueId === scelto) onPatch({ scelte_assi });
                    else aggiorna({ valori_assi: { ...scelteRiga, [axis.codice]: valueId }, scelte_assi });
                  }}
                  placeholder="Scegli…"
                  aria-label={axis.nome}
                  className={cn("h-7 text-xs", manca && "border-rose-300")}
                />
              </div>
            );
          })}
        </div>
      )}

      {finestre && finestre.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-1.5">
          <span className="text-[10px] text-muted-foreground">Di quale finestra è?</span>
          <Select value="" onValueChange={(id) => onPatch({ serramento_id: id })}>
            <SelectTrigger className="h-7 w-auto min-w-[14rem] text-xs" aria-label={`Aggancia ${nome} a una finestra`}>
              <SelectValue placeholder="Agganciala a una finestra" />
            </SelectTrigger>
            <SelectContent>
              {finestre.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.etichetta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

interface BloccoProps {
  finestra: Pick<SrSerramentoRow, "larghezza_mm" | "altezza_mm" | "quantita">;
  complementi: readonly SrAccessorioRow[];
  /** Le tipologie da complemento del listino: un bottone ciascuna. */
  tipologie: readonly TipologiaListino[];
  tariffePrezzi: Map<string, number>;
  supplierLineMap: Map<string, SupplierProductLine>;
  onAggiungi: (tipologia: TipologiaListino) => void;
  /** Un complemento fuori listino; senza, niente bottoni (una posizione che non prende complementi). */
  onAMano?: () => void;
  onCambiaModello: (a: SrAccessorioRow) => void;
  onPatch: (a: SrAccessorioRow, patch: Partial<SrAccessorioRow>) => void;
  onElimina: (a: SrAccessorioRow) => void;
  /** La tipologia che si sta aggiungendo a questa finestra. */
  inCorso: string | null;
  /** Un'aggiunta è in corso da qualche parte: i bottoni aspettano. */
  occupata: boolean;
  /** «Alla finestra 3», per lo screen reader. */
  destinazione: string;
  /** Le tipologie da complemento che il listino ha ma non propone ancora, col link per completarle. */
  daCompletare?: ReadonlyArray<{ chiave: string; nome: string; indirizzo: string }>;
}

/** Il blocco in fondo al box di una finestra: i suoi complementi e i bottoni per aggiungerne. */
export function ComplementiFinestra({
  finestra, complementi, tipologie, tariffePrezzi, supplierLineMap,
  onAggiungi, onAMano, onCambiaModello, onPatch, onElimina, inCorso, occupata, destinazione,
  daCompletare = [],
}: BloccoProps) {
  const misure = finestra.larghezza_mm && finestra.altezza_mm
    ? `${finestra.larghezza_mm} × ${finestra.altezza_mm} mm · ${finestra.quantita} pz`
    : null;
  return (
    <section aria-label="Complementi di questa finestra" className="rounded-md border border-orange-100 bg-orange-50/40 p-2.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">
          Complementi di questa finestra{complementi.length > 0 ? ` · ${complementi.length}` : ""}
        </h4>
        <p className={cn("text-[10px]", misure ? "text-muted-foreground" : "font-medium text-amber-700")}>
          {misure
            ? `Misure della finestra: ${misure}`
            : "Scrivi le misure della finestra: i complementi le prendono da qui"}
        </p>
      </div>
      {complementi.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {complementi.map((a) => (
            <ComplementoRiga
              key={a.id}
              a={a}
              tariffePrezzi={tariffePrezzi}
              supplierLineMap={supplierLineMap}
              onPatch={(patch) => onPatch(a, patch)}
              onElimina={() => onElimina(a)}
              onCambiaModello={() => onCambiaModello(a)}
            />
          ))}
        </div>
      )}
      {/* Nessun bottone rapido perché il listino non propone i complementi: si dice, e dove si accendono. */}
      {tipologie.length === 0 && daCompletare.length > 0 && (
        <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
          <span>Nel listino, ma non ancora proposti nei preventivi:</span>
          {daCompletare.map((d) => (
            <a
              key={d.chiave}
              href={d.indirizzo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-orange-700 hover:underline"
            >
              {d.nome}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </p>
      )}
      {(tipologie.length > 0 || onAMano) && (
        <BarraComplementi
          tipologie={tipologie}
          onAggiungi={onAggiungi}
          onAMano={onAMano}
          inCorso={inCorso}
          occupata={occupata}
          destinazione={destinazione}
        />
      )}
    </section>
  );
}
