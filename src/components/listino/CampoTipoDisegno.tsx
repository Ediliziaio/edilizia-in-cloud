/**
 * «Tipo di disegno» dell'articolo: dice al sistema che cosa disegnare (finestra a 2 ante, traslante, persiana a libro…)
 * al posto della foto. Se il tipo non c'è si sceglie «Personalizzata» e si compongono le ante a mano, con il disegno
 * che si aggiorna mentre si lavora. Senza tipo l'articolo usa la foto, come prima.
 */
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnteprimaDisegnoFamiglia } from "@/components/serramenti/AnteprimaDisegnoFamiglia";
import { CONFIGURAZIONI_PERSIANA } from "@/lib/serramenti/assiDisegno";
import {
  TIPOLOGIA_PERSONALIZZATA,
  disegnoDaFamiglia,
  misureTipiche,
} from "@/lib/serramenti/disegnoDaFamiglia";
import type { AntaDisegno, DefinizioneDisegno, TipoAnta } from "@/lib/serramenti/disegnoSerramento";
import type { FamilyWithAxes } from "@/types/articleFamily";

export interface ValoreTipoDisegno {
  tipologia: string | null;
  definizione: DefinizioneDisegno | null;
}

interface Props {
  valore: ValoreTipoDisegno;
  onChange: (v: ValoreTipoDisegno) => void;
}

const GRUPPI: Array<{ titolo: string; voci: Array<[string, string]> }> = [
  { titolo: "Finestre", voci: [["finestra_1_anta", "Finestra 1 anta"], ["finestra_2_ante", "Finestra 2 ante"], ["finestra_3_ante", "Finestra 3 ante"], ["finestra_wasistas", "Finestra wasistas"], ["fisso", "Fisso nel telaio"], ["finestra_scorrevole_2_ante", "Finestra scorrevole 2 ante"]] },
  {
    titolo: "Finestre con sopraluce o sottoluce",
    voci: [
      ["finestra_1_anta_sopraluce", "1 anta con sopraluce"], ["finestra_2_ante_sopraluce", "2 ante con sopraluce"], ["finestra_2_ante_sopraluce_2_sezioni", "2 ante con sopraluce a due sezioni"],
      ["finestra_3_ante_sopraluce", "3 ante con sopraluce"], ["finestra_1_anta_sottoluce", "1 anta con sottoluce"], ["finestra_2_ante_sottoluce", "2 ante con sottoluce"],
    ],
  },
  { titolo: "Porte finestra e portoncini", voci: [["porta_finestra_1_anta", "Porta finestra 1 anta"], ["porta_finestra_2_ante", "Porta finestra 2 ante"], ["porta_finestra_3_ante", "Porta finestra 3 ante"], ["porta_finestra_2_ante_sopraluce", "Porta finestra 2 ante con sopraluce"], ["porta_finestra_libro_3_ante", "Porta finestra a libro 3 ante"], ["porta_finestra_libro_4_ante", "Porta finestra a libro 4 ante"], ["portoncino_1_anta", "Portoncino 1 anta"], ["portoncino_2_ante", "Portoncino 2 ante"]] },
  {
    titolo: "Scorrevoli e alzanti",
    voci: [
      ["traslante_4_ante", "Traslante scorrevole 4 ante"], ["traslante_fisso_telaio", "Traslante con fisso nel telaio"], ["traslante_fisso_anta", "Traslante con fisso nell'anta"],
      ["traslante_su_parete", "Traslante su parete"], ["alzante_as_fa", "Alzante scorrevole AS + FA"], ["alzante_fa_as_as_fa", "Alzante scorrevole FA + AS + AS + FA"],
      ["alzante_scomparsa", "Alzante a scomparsa"], ["scorri_ribalta_patio", "Scorri-ribalta PATIO"], ["slide", "Slide"], ["slide_plus", "Slide Plus"], ["smart_slide", "Smart Slide (in linea)"],
    ],
  },
  { titolo: "Sagome", voci: [["finestra_arco", "Ad arco"], ["finestra_trapezio", "Trapezio"], ["finestra_lunetta", "Lunetta"], ["finestra_tonda", "Tonda / ovale"], ["finestra_triangolo", "Triangolare"], ["finestra_ogiva", "Ogivale"]] },
  { titolo: "Monoblocchi", voci: [["monoblocco_1_anta", "Monoblocco 1 anta"], ["monoblocco_2_ante", "Monoblocco 2 ante"]] },
];

const TIPI_ANTA: Array<[TipoAnta | "fisso_telaio", string]> = [
  ["fisso", "Fisso (anta fissa)"],
  ["fisso_telaio", "Fisso nel telaio"],
  ["battente", "Battente"],
  ["anta_ribalta", "Anta-ribalta"],
  ["vasistas", "Vasistas"],
  ["libro", "A libro (si ripiega)"],
  ["scorrevole", "Scorrevole"],
  ["alzante_scorrevole", "Alzante scorrevole"],
];

const conLato = (t: TipoAnta) => t === "battente" || t === "anta_ribalta" || t === "libro" || t === "scorrevole" || t === "alzante_scorrevole";
const eScorrevole = (a: AntaDisegno) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole";

const numero = (t: string): number | undefined => {
  const n = Math.round(Number(t.replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function CampoTipoDisegno({ valore, onChange }: Props) {
  const { tipologia, definizione } = valore;
  const persiana = tipologia?.startsWith("persiana:") ?? false;
  const codicePersiana = persiana ? tipologia!.split(":")[1] : "";
  const variantePersiana = persiana ? (tipologia!.split(":")[2] ?? "") : "";
  const personalizzata = tipologia === TIPOLOGIA_PERSONALIZZATA;

  const selezione = persiana ? `persiana:${codicePersiana}` : (tipologia ?? "");

  // Il disegno dal vivo: un articolo «finto» con solo il tipo, senza varianti.
  const pseudo = useMemo(
    () => ({ id: "anteprima", disegno_tipologia: tipologia, disegno_definizione: definizione, axes: [] }) as unknown as FamilyWithAxes,
    [tipologia, definizione],
  );
  const disegno = useMemo(() => {
    if (!tipologia) return null;
    const m = misureTipiche(pseudo);
    return disegnoDaFamiglia(pseudo, {}, m.larghezzaMm, m.altezzaMm);
  }, [pseudo, tipologia]);

  const scegli = (v: string) => {
    if (!v) return onChange({ tipologia: null, definizione: null });
    if (v === TIPOLOGIA_PERSONALIZZATA) {
      return onChange({
        tipologia: TIPOLOGIA_PERSONALIZZATA,
        definizione: definizione ?? { larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }] },
      });
    }
    onChange({ tipologia: v + (v.startsWith("persiana:") && variantePersiana ? `:${variantePersiana}` : ""), definizione: null });
  };

  const def = definizione ?? { ante: [] };
  const aggiorna = (patch: Partial<DefinizioneDisegno>) => onChange({ tipologia: TIPOLOGIA_PERSONALIZZATA, definizione: { ...def, ...patch } });
  const aggiornaAnta = (i: number, a: AntaDisegno) => aggiorna({ ante: def.ante.map((x, k) => (k === i ? a : x)) });
  const ciSonoScorrevoli = def.ante.some(eScorrevole);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="f-tipo-disegno">Tipo di disegno</Label>
        <p className="mb-1.5 mt-1 text-xs text-muted-foreground">
          Il sistema disegna da solo questo articolo (da dentro e da fuori, con le quote) nel listino, nel preventivo e nel PDF: non serve caricare
          una foto. Se il tipo non c'è, scegli «Personalizzata» e componi tu le ante.
        </p>
        <select
          id="f-tipo-disegno"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={selezione}
          onChange={(e) => scegli(e.target.value)}
        >
          <option value="">Nessun disegno: uso una foto</option>
          {GRUPPI.map((g) => (
            <optgroup key={g.titolo} label={g.titolo}>
              {g.voci.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </optgroup>
          ))}
          {[...new Set(CONFIGURAZIONI_PERSIANA.map((c) => c.gruppo))].map((gruppo) => (
            <optgroup key={gruppo} label={`Persiane · ${gruppo}`}>
              {CONFIGURAZIONI_PERSIANA.filter((c) => c.gruppo === gruppo).map((c) => <option key={c.codice} value={`persiana:${c.codice}`}>{c.nome}</option>)}
            </optgroup>
          ))}
          <option value={TIPOLOGIA_PERSONALIZZATA}>Personalizzata: la compongo io…</option>
        </select>
        {persiana && (
          <div className="mt-2 max-w-xs">
            <Label htmlFor="f-tipo-persiana" className="flex h-5 items-center text-xs">Tipo di persiana</Label>
            <select
              id="f-tipo-persiana"
              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              value={variantePersiana}
              onChange={(e) => onChange({ tipologia: `persiana:${codicePersiana}${e.target.value ? `:${e.target.value}` : ""}`, definizione: null })}
            >
              <option value="">Lamelle fisse</option>
              <option value="orientabili">Lamelle orientabili</option>
              <option value="gelosia">Gelosia</option>
              <option value="scuro">Scuro pieno (doghe)</option>
              <option value="scuro_cornice">Scuro a cornice</option>
            </select>
          </div>
        )}
      </div>

      {personalizzata && (
        <div className="space-y-3 rounded-md border bg-slate-50/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Componi il disegno</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Label className="flex h-5 items-center text-xs">Larghezza tipica (mm)</Label>
              <Input type="number" min={300} className="h-9 text-xs" key={`w${def.larghezzaMm ?? ""}`} defaultValue={def.larghezzaMm ?? ""} onBlur={(e) => aggiorna({ larghezzaMm: numero(e.target.value) })} />
            </div>
            <div>
              <Label className="flex h-5 items-center text-xs">Altezza tipica (mm)</Label>
              <Input type="number" min={300} className="h-9 text-xs" key={`h${def.altezzaMm ?? ""}`} defaultValue={def.altezzaMm ?? ""} onBlur={(e) => aggiorna({ altezzaMm: numero(e.target.value) })} />
            </div>
            <label className="mt-6 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" className="h-3.5 w-3.5 accent-orange-500" checked={!!def.soglia} onChange={(e) => aggiorna({ soglia: e.target.checked || undefined })} />
              Con soglia (porta)
            </label>
            {ciSonoScorrevoli && (
              <label className="mt-6 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" className="h-3.5 w-3.5 accent-orange-500" checked={!!def.inLinea} onChange={(e) => aggiorna({ inLinea: e.target.checked || undefined })} />
                Ante in linea
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Label className="flex h-5 items-center text-xs">Sopraluce (mm, 0 = no)</Label>
              <Input type="number" min={0} className="h-9 text-xs" key={`so${def.sopraluce?.altezzaMm ?? ""}`} defaultValue={def.sopraluce ? def.sopraluce.altezzaMm ?? "" : 0}
                onBlur={(e) => { const n = Number(e.target.value); aggiorna({ sopraluce: e.target.value !== "" && n === 0 ? undefined : { ...def.sopraluce, altezzaMm: numero(e.target.value) } }); }} />
            </div>
            {def.sopraluce && (
              <div>
                <Label className="flex h-5 items-center text-xs">Sezioni del sopraluce</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={def.sopraluce.sezioni ?? 1} onChange={(e) => aggiorna({ sopraluce: { ...def.sopraluce, sezioni: Number(e.target.value) } })}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className="flex h-5 items-center text-xs">Sottoluce (mm, 0 = no)</Label>
              <Input type="number" min={0} className="h-9 text-xs" key={`sl${def.sottoluce?.altezzaMm ?? ""}`} defaultValue={def.sottoluce ? def.sottoluce.altezzaMm ?? "" : 0}
                onBlur={(e) => { const n = Number(e.target.value); aggiorna({ sottoluce: e.target.value !== "" && n === 0 ? undefined : { altezzaMm: numero(e.target.value) } }); }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ante, da sinistra a destra (viste da dentro)</Label>
            {def.ante.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <select
                  className="h-9 min-w-[10rem] flex-1 rounded-md border bg-background px-2 text-xs"
                  value={a.tipo === "fisso" && a.nelTelaio ? "fisso_telaio" : a.tipo}
                  onChange={(e) => {
                    const v = e.target.value as TipoAnta | "fisso_telaio";
                    const tipo: TipoAnta = v === "fisso_telaio" ? "fisso" : v;
                    aggiornaAnta(i, { tipo, ...(conLato(tipo) ? { lato: a.lato ?? "dx" } : {}), ...(v === "fisso_telaio" ? { nelTelaio: true } : {}), ...(conLato(tipo) ? { maniglia: a.maniglia } : {}) });
                  }}
                  aria-label={`Tipo dell'anta ${i + 1}`}
                >
                  {TIPI_ANTA.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                </select>
                {eScorrevole(a) && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-orange-500" checked={!!a.conRibalta} onChange={(e) => aggiornaAnta(i, { ...a, conRibalta: e.target.checked || undefined })} />
                    Con ribalta
                  </label>
                )}
                {conLato(a.tipo) && (
                  <select
                    className="h-9 w-32 rounded-md border bg-background px-2 text-xs"
                    value={a.lato ?? "dx"}
                    onChange={(e) => aggiornaAnta(i, { ...a, lato: e.target.value === "sx" ? "sx" : "dx" })}
                    aria-label={`Lato dell'anta ${i + 1}`}
                  >
                    <option value="dx">{eScorrevole(a) ? "Scorre a destra" : "Cerniere a destra"}</option>
                    <option value="sx">{eScorrevole(a) ? "Scorre a sinistra" : "Cerniere a sinistra"}</option>
                  </select>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={def.ante.length <= 1} onClick={() => aggiorna({ ante: def.ante.filter((_, k) => k !== i) })} aria-label={`Togli l'anta ${i + 1}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={def.ante.length >= 6} onClick={() => aggiorna({ ante: [...def.ante, { tipo: "fisso" }] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi anta
            </Button>
          </div>

          {ciSonoScorrevoli && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="flex h-5 items-center text-xs">Dove va l'anta aperta</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  value={def.scorrimento?.tipo ?? ""}
                  onChange={(e) => aggiorna({ scorrimento: e.target.value ? { tipo: e.target.value as "scomparsa" | "su_parete", lato: def.scorrimento?.lato ?? "dx" } : undefined })}
                >
                  <option value="">Resta nel vano</option>
                  <option value="scomparsa">Scompare nel muro</option>
                  <option value="su_parete">Scorre davanti alla parete</option>
                </select>
              </div>
              {def.scorrimento && (
                <div>
                  <Label className="flex h-5 items-center text-xs">Da che parte</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                    value={def.scorrimento.lato}
                    onChange={(e) => aggiorna({ scorrimento: { ...def.scorrimento!, lato: e.target.value === "sx" ? "sx" : "dx" } })}
                  >
                    <option value="dx">A destra</option>
                    <option value="sx">A sinistra</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {disegno && (
        <div className="max-w-md">
          <AnteprimaDisegnoFamiglia disegno={disegno} altezza="h-40" />
          <p className="mt-1 text-[11px] text-muted-foreground">Così si disegna con le misure tipiche; nel preventivo prende le misure e le scelte vere.</p>
        </div>
      )}
    </div>
  );
}
