/**
 * Le misure in più delle sagome, accanto a larghezza e altezza: l'altezza dell'arco (freccia) e,
 * nel trapezio, l'altezza del lato basso e da che parte sta. Le altre sagome (lunetta, tonda, triangolo,
 * ogiva) si ricavano da larghezza e altezza e non chiedono nulla.
 */
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPOLOGIE_DISEGNO, type DefinizioneDisegno } from "@/lib/serramenti/disegnoSerramento";
import { tipologiaDaDefinizione } from "@/lib/serramenti/disegnoDaFamiglia";
import { controllaMisure } from "@/lib/serramenti/limitiSerramento";

export interface MisureFormaValori {
  frecciaMm?: number;
  altezzaMinoreMm?: number;
  latoMinore?: "dx" | "sx";
  sopraluceMm?: number;
  sottoluceMm?: number;
}

interface Props {
  /** `disegno_tipologia` dell'articolo. */
  tipologia: string | null | undefined;
  definizione?: DefinizioneDisegno | null;
  larghezzaMm: number;
  altezzaMm: number;
  valori: MisureFormaValori;
  onChange: (v: MisureFormaValori) => void;
}

export function formaDellaTipologia(tipologia: string | null | undefined) {
  return TIPOLOGIE_DISEGNO.find((t) => t.id === tipologia)?.forma;
}

/** La tipologia chiede misure in più? Arco e trapezio, e le tipologie con sopraluce o sottoluce. */
export function chiedeMisureForma(tipologia: string | null | undefined, definizione?: DefinizioneDisegno | null): boolean {
  const t = tipologia === "personalizzata" ? tipologiaDaDefinizione(definizione) : TIPOLOGIE_DISEGNO.find((x) => x.id === tipologia);
  return t?.forma === "arco" || t?.forma === "trapezio" || !!t?.sopraluce || !!t?.sottoluce;
}

const numero = (t: string): number | undefined => {
  const n = Math.round(Number(t.replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function MisureForma({ tipologia, definizione, larghezzaMm, altezzaMm, valori, onChange }: Props) {
  const forma = formaDellaTipologia(tipologia);
  const tip = tipologia === "personalizzata" ? tipologiaDaDefinizione(definizione) : TIPOLOGIE_DISEGNO.find((x) => x.id === tipologia);
  if (tip?.sopraluce || tip?.sottoluce) {
    const campi = [
      ...(tip.sopraluce ? [{ campo: "sopraluceMm" as const, nome: "sopraluce", tipico: tip.sopraluce.altezzaMm ?? Math.round(altezzaMm * 0.25) }] : []),
      ...(tip.sottoluce ? [{ campo: "sottoluceMm" as const, nome: "sottoluce", tipico: tip.sottoluce.altezzaMm ?? Math.round(altezzaMm * 0.2) }] : []),
    ];
    return (
      <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Misure dei campi fissi</p>
        <div className="grid grid-cols-2 gap-2">
          {campi.map(({ campo, nome, tipico }) => <div key={campo} className="col-span-2 sm:col-span-1">
            <Label className="flex h-5 items-center text-xs">Altezza del {nome} (mm)</Label>
            <Input
              type="number"
              aria-label={`Altezza del ${nome} (mm)`}
              min={0}
              className="h-9 text-xs"
              placeholder={`${tipico}`}
              key={`${campo}${valori[campo] ?? ""}`}
              defaultValue={valori[campo] ?? ""}
              onBlur={(e) => onChange({ ...valori, [campo]: numero(e.target.value) })}
            />
          </div>)}
        </div>
      </div>
    );
  }
  if (forma !== "arco" && forma !== "trapezio") return null;
  const avvisi = controllaMisure({
    larghezzaMm,
    altezzaMm,
    ante: [{ tipo: "fisso" }],
    forma,
    frecciaMm: valori.frecciaMm,
    altezzaMinoreMm: valori.altezzaMinoreMm,
    latoMinore: valori.latoMinore,
  }).filter((a) => /freccia|trapezio/.test(a.codice));

  return (
    <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{forma === "arco" ? "Misura dell'arco" : "Misure del trapezio"}</p>
      <div className="grid grid-cols-2 gap-2">
        {forma === "arco" ? (
          <div className="col-span-2 sm:col-span-1">
            <Label className="flex h-5 items-center text-xs">Altezza dell'arco (mm)</Label>
            <Input
              type="number"
              min={0}
              className="h-9 text-xs"
              placeholder={`tutto sesto: ${Math.round(larghezzaMm / 2)}`}
              key={`f${valori.frecciaMm ?? ""}`}
              defaultValue={valori.frecciaMm ?? ""}
              onBlur={(e) => onChange({ ...valori, frecciaMm: numero(e.target.value) })}
            />
          </div>
        ) : (
          <>
            <div>
              <Label className="flex h-5 items-center text-xs">Altezza lato basso (mm)</Label>
              <Input
                type="number"
                min={0}
                className="h-9 text-xs"
                placeholder={`${Math.round(altezzaMm * 0.7)}`}
                key={`m${valori.altezzaMinoreMm ?? ""}`}
                defaultValue={valori.altezzaMinoreMm ?? ""}
                onBlur={(e) => onChange({ ...valori, altezzaMinoreMm: numero(e.target.value) })}
              />
            </div>
            <div>
              <Label className="flex h-5 items-center text-xs">Lato basso (da dentro)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                value={valori.latoMinore ?? "dx"}
                onChange={(e) => onChange({ ...valori, latoMinore: e.target.value === "sx" ? "sx" : "dx" })}
              >
                <option value="dx">A destra</option>
                <option value="sx">A sinistra</option>
              </select>
            </div>
          </>
        )}
      </div>
      {avvisi.map((a) => (
        <p key={a.codice} className={"flex items-start gap-1 text-[11px] " + (a.gravita === "errore" ? "text-rose-700" : "text-amber-700")}>
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {a.testo}
        </p>
      ))}
    </div>
  );
}
