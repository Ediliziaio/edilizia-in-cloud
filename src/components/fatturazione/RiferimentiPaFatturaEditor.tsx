// Riferimenti PA della fattura (lotto 4, 15/11/2026): contratto, ordine d'acquisto, convenzione,
// con CIG/CUP (o «non dovuto»), lotto, codice commessa/convenzione e righe a cui si applicano.
// Accanto a ogni riga: da dove viene («dall'anagrafica», «dalla commessa», «scritto qui») e se è
// stata cambiata qui. Cambiarla qui non tocca né la commessa né l'anagrafica.
// Lo usano «Crea fattura» dalla commessa e l'editor del modulo Fatturazione.

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cigValido, cupValido, ETICHETTA_TIPO_RIFERIMENTO, etichettaOrigine, modificaRiferimento, numeriLineaDi,
  riferimentoManuale, ripristinaRiferimento, type RiferimentoPaFattura, type TipoRiferimentoFattura,
} from "../../../supabase/functions/_shared/riferimentiPaFattura";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface RigaBreve { id: string; descrizione?: string | null }

interface Props {
  value: RiferimentoPaFattura[];
  onChange: (next: RiferimentoPaFattura[]) => void;
  righe: RigaBreve[];
  disabled?: boolean;
  /** Testo sotto il titolo quando non ci sono riferimenti. */
  vuoto?: string;
}

const codiceInput = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function RiferimentiPaFatturaEditor({ value, onChange, righe, disabled, vuoto }: Props) {
  const tr = useT();
  const cambia = (chiave: string, patch: Partial<RiferimentoPaFattura>) =>
    onChange(value.map((r) => (r.chiave === chiave ? modificaRiferimento(r, patch) : r)));
  const togli = (chiave: string) => onChange(value.filter((r) => r.chiave !== chiave));
  const ripristina = (chiave: string) => onChange(value.map((r) => (r.chiave === chiave ? ripristinaRiferimento(r) : r)));
  const aggiungi = () => onChange([...value, riferimentoManuale(value.some((r) => r.tipo === "contratto") ? "ordine_acquisto" : "contratto")]);

  return (
    <div className="space-y-2" data-testid="riferimenti-pa-fattura">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">{vuoto ?? tr("Nessun riferimento: contratto, ordine o convenzione dell'ente, con CIG e CUP.")}</p>
      )}
      {value.map((r, i) => {
        const linee = numeriLineaDi(r, righe);
        const cigErr = r.cig && !cigValido(r.cig) ? tr("Il CIG ha 10 caratteri (anche lo SmartCIG)") : null;
        const cupErr = r.cup && !cupValido(r.cup) ? tr("Il CUP ha 15 caratteri e comincia con una lettera") : null;
        const numErr = r.numero && r.numero.length > 20 ? tr("L'XML ammette 20 caratteri (qui {n})", { n: r.numero.length }) : null;
        const id = (campo: string) => `rif-${i}-${campo}`;
        return (
          <div key={r.chiave} className="rounded-md border p-2 space-y-2" data-testid="riferimento-pa">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={r.tipo} disabled={disabled} onValueChange={(v) => cambia(r.chiave, { tipo: v as TipoRiferimentoFattura })}>
                <SelectTrigger className="h-7 w-[170px] text-xs" aria-label={tr("Tipo del riferimento {i}", { i: i + 1 })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ETICHETTA_TIPO_RIFERIMENTO) as TipoRiferimentoFattura[]).map((t) => (
                    <SelectItem key={t} value={t}>{ETICHETTA_TIPO_RIFERIMENTO[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant={r.modificato ? "default" : "outline"} className="text-[10px] font-normal" data-testid="origine-riferimento">
                {etichettaOrigine(r)}
              </Badge>
              <div className="ml-auto flex items-center gap-1">
                {r.modificato && !disabled && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => ripristina(r.chiave)}>
                    <RotateCcw className="mr-1 h-3 w-3" /> {r.origine === "anagrafica" ? tr("Come in anagrafica") : tr("Come in commessa")}
                  </Button>
                )}
                {!disabled && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={tr("Togli il riferimento {i}", { i: i + 1 })} onClick={() => togli(r.chiave)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-0.5">
                <Label htmlFor={id("numero")} className="text-[11px] text-muted-foreground">{tr("Numero")}</Label>
                <Input id={id("numero")} value={r.numero ?? ""} disabled={disabled} onChange={(e) => cambia(r.chiave, { numero: e.target.value })} className="h-7 text-xs" placeholder={tr("es. 1234/2026")} />
                {numErr && <p className="text-[10px] text-destructive">{numErr}</p>}
              </div>
              <div className="space-y-0.5">
                <Label htmlFor={id("data")} className="text-[11px] text-muted-foreground">{tr("Data")}</Label>
                <Input id={id("data")} type="date" value={r.data ?? ""} disabled={disabled} onChange={(e) => cambia(r.chiave, { data: e.target.value || null })} className="h-7 text-xs" />
              </div>
              <div className="space-y-0.5">
                <Label htmlFor={id("lotto")} className="text-[11px] text-muted-foreground">{tr("Lotto / voce")}</Label>
                <Input id={id("lotto")} value={r.num_item ?? ""} disabled={disabled} onChange={(e) => cambia(r.chiave, { num_item: e.target.value })} className="h-7 text-xs" />
                {r.num_item && r.num_item.length > 20 && <p className="text-[10px] text-destructive">{tr("L'XML ammette 20 caratteri (qui {n}): accorcialo", { n: r.num_item.length })}</p>}
              </div>
              <div className="space-y-0.5">
                <Label htmlFor={id("conv")} className="text-[11px] text-muted-foreground">{tr("Cod. commessa/convenzione")}</Label>
                <Input id={id("conv")} value={r.codice_commessa_convenzione ?? ""} disabled={disabled} maxLength={100} onChange={(e) => cambia(r.chiave, { codice_commessa_convenzione: e.target.value })} className="h-7 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={id("cig")} className="text-[11px] text-muted-foreground">CIG</Label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Checkbox checked={r.cig_non_dovuto} disabled={disabled} onCheckedChange={(v) => cambia(r.chiave, v ? { cig_non_dovuto: true } : { cig_non_dovuto: false })} aria-label={tr("CIG non dovuto")} />
                    {tr("non dovuto")}
                  </label>
                </div>
                {r.cig_non_dovuto ? (
                  <Input value={r.cig_motivo_esclusione ?? ""} disabled={disabled} onChange={(e) => cambia(r.chiave, { cig_non_dovuto: true, cig_motivo_esclusione: e.target.value })} className="h-7 text-xs" placeholder={tr("Motivo (es. affidamento in house)")} aria-label={tr("Motivo del CIG non dovuto")} />
                ) : (
                  <Input id={id("cig")} value={r.cig ?? ""} disabled={disabled} maxLength={10} onChange={(e) => cambia(r.chiave, { cig: codiceInput(e.target.value) || null })} className="h-7 text-xs font-mono" placeholder={tr("10 caratteri")} />
                )}
                {cigErr && <p className="text-[10px] text-destructive">{cigErr}</p>}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={id("cup")} className="text-[11px] text-muted-foreground">CUP</Label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Checkbox checked={r.cup_non_dovuto} disabled={disabled} onCheckedChange={(v) => cambia(r.chiave, v ? { cup_non_dovuto: true } : { cup_non_dovuto: false })} aria-label={tr("CUP non dovuto")} />
                    {tr("non dovuto")}
                  </label>
                </div>
                {!r.cup_non_dovuto && (
                  <Input id={id("cup")} value={r.cup ?? ""} disabled={disabled} maxLength={15} onChange={(e) => cambia(r.chiave, { cup: codiceInput(e.target.value) || null })} className="h-7 text-xs font-mono" placeholder={tr("15 caratteri")} />
                )}
                {cupErr && <p className="text-[10px] text-destructive">{cupErr}</p>}
              </div>
            </div>
            {righe.length > 1 && (
              <details className="text-xs" open={linee.length > 0}>
                <summary className="cursor-pointer text-muted-foreground">
                  {linee.length ? tr("Vale per: righe {linee}", { linee: linee.join(", ") }) : tr("Vale per: tutta la fattura")}
                </summary>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {righe.map((riga, n) => {
                    const scelta = r.righe_id.includes(riga.id);
                    return (
                      <label key={riga.id} className="flex min-w-0 items-center gap-1.5">
                        <Checkbox
                          checked={scelta}
                          disabled={disabled}
                          onCheckedChange={(v) => {
                            const ids = v ? [...r.righe_id, riga.id] : r.righe_id.filter((x) => x !== riga.id);
                            const ordinati = righe.map((x) => x.id).filter((x) => ids.includes(x));
                            onChange(value.map((x) => (x.chiave === r.chiave
                              ? { ...x, righe_id: ordinati, numeri_linea: numeriLineaDi({ righe_id: ordinati, numeri_linea: [] }, righe) }
                              : x)));
                          }}
                          aria-label={tr("Riga {n}", { n: n + 1 })}
                        />
                        <span className="truncate">{n + 1}. {riga.descrizione || tr("(senza descrizione)")}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        );
      })}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={aggiungi}>
          <Plus className="mr-1 h-3 w-3" /> {tr("Aggiungi riferimento")}
        </Button>
      )}
    </div>
  );
}
