/**
 * La tendina di una variante nel preventivo: i valori del listino e, dentro
 * quelli che hanno un elenco, le loro voci.
 *
 * «Colore Standard +10%» è la fascia di prezzo; dentro si sceglie il colore
 * vero (Grigio antracite RAL 7016). Si può scegliere anche solo la fascia,
 * «da decidere», e il colore più avanti. Un valore o una voce tolti dal
 * listino restano leggibili sulla riga che li aveva scelti.
 */
import { Fragment } from "react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { AxisValue } from "@/types/articleFamily";
import { suffissoMaggiorazione } from "@/lib/listino/maggiorazione";
import { codificaScelta, decodificaScelta, testoScelta, vociDi } from "@/lib/listino/scelteVariante";

interface Props {
  values: AxisValue[];
  valueId: string | null | undefined;
  /** La voce scelta dentro il valore (scelte_assi della riga). */
  scelta: string | null | undefined;
  onChange: (valueId: string, scelta: string | null) => void;
  placeholder?: string;
  className?: string;
  /** Scrive «· standard» accanto al valore di serie. */
  mostraStandard?: boolean;
  "aria-label"?: string;
}

const conMaggiorazione = (v: AxisValue) => `${v.label}${suffissoMaggiorazione(v.maggiorazione_tipo, v.maggiorazione_valore)}`;

export function SceltaVariante({
  values, valueId, scelta, onChange, placeholder = "Seleziona…", className, mostraStandard = false,
  "aria-label": ariaLabel,
}: Props) {
  const corrente = valueId ? values.find((v) => v.id === valueId) ?? null : null;
  const visibili = values.filter((v) => v.attivo || v.id === valueId);
  const valore = valueId ? codificaScelta(valueId, scelta, corrente ? vociDi(corrente) : []) : "";
  const testoChiuso = corrente
    ? `${testoScelta(corrente.label, scelta)}${suffissoMaggiorazione(corrente.maggiorazione_tipo, corrente.maggiorazione_valore)}${corrente.attivo ? "" : " · non più a listino"}`
    : valueId
      ? "Scelta tolta dal listino"
      : undefined;

  return (
    <Select
      value={valore}
      onValueChange={(codice) => {
        const scelto = decodificaScelta(codice, values);
        if (scelto) onChange(scelto.valoreId, scelto.scelta);
      }}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder}>{testoChiuso}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {visibili.map((v, i) => {
          const voci = vociDi(v);
          const etichetta = `${conMaggiorazione(v)}${mostraStandard && v.is_default ? " · standard" : ""}${v.attivo ? "" : " · non più a listino"}`;
          const dopoUnElenco = i > 0 && vociDi(visibili[i - 1]).length > 0;
          if (voci.length === 0) {
            return (
              <Fragment key={v.id}>
                {dopoUnElenco && <SelectSeparator />}
                <SelectItem value={`v:${v.id}`} className="text-xs">
                  {etichetta}
                </SelectItem>
              </Fragment>
            );
          }
          const vocePersa = v.id === valueId && !!scelta && !voci.includes(scelta);
          return (
            <Fragment key={v.id}>
              {i > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectLabel className="py-1 text-[11px] font-semibold text-muted-foreground">{etichetta}</SelectLabel>
                <SelectItem value={`v:${v.id}`} className="text-xs italic">
                  Da decidere
                </SelectItem>
                {voci.map((voce, j) => (
                  <SelectItem key={voce} value={`o:${v.id}:${j}`} className="text-xs">
                    {voce}
                  </SelectItem>
                ))}
                {vocePersa && (
                  <SelectItem value={`x:${v.id}`} disabled className="text-xs italic">
                    {scelta} · non più a listino
                  </SelectItem>
                )}
              </SelectGroup>
            </Fragment>
          );
        })}
        {valueId && !corrente && (
          <SelectItem value={valore} disabled className="text-xs italic">
            Scelta tolta dal listino
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
