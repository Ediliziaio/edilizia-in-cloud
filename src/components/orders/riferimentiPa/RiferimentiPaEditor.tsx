/**
 * Editor delle righe «Dati appalto e fatturazione PA» (lotto 3). Controllato: riceve le bozze e
 * restituisce le bozze cambiate. Lo usano la creazione e la modifica della commessa e il riquadro
 * in Panoramica. Nessun campo è obbligatorio: cosa manca si dice come avviso.
 */
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  bozzaDaFonte, bozzaVuota, controllaRiferimento, ETICHETTA_FONTE, MAX_LOTTO, TIPI_RIFERIMENTO_PA,
  type BozzaRiferimentoPa, type FonteRiferimentoEsistente, type TipoRiferimentoPa,
} from "@/lib/orders/riferimentiPa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  bozze: BozzaRiferimentoPa[];
  onChange: (bozze: BozzaRiferimentoPa[]) => void;
  /** CIG/CUP già scritti altrove sulla commessa (contratto della generale, computo). */
  fonti?: FonteRiferimentoEsistente[];
  disabilitato?: boolean;
}

export function RiferimentiPaEditor({ bozze, onChange, fonti = [], disabilitato }: Props) {
  const tr = useT();
  const cambia = (chiave: string, patch: Partial<BozzaRiferimentoPa>) =>
    onChange(bozze.map((b) => (b.chiave === chiave ? { ...b, ...patch } : b)));
  const sposta = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= bozze.length) return;
    const nuove = [...bozze];
    [nuove[i], nuove[j]] = [nuove[j], nuove[i]];
    onChange(nuove);
  };
  // Una fonte già importata in una bozza (anche non ancora salvata) non si ripropone.
  const daImportare = fonti.filter((f) => !f.giaPresente && !bozze.some((b) => b.fonte === f.fonte && b.fonte_id === f.fonte_id));

  return (
    <div className="space-y-4">
      {daImportare.length > 0 && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3" data-testid="fonti-riferimenti-pa">
          <p className="text-sm font-semibold text-blue-950">{tr("Codici già scritti su questa commessa")}</p>
          {daImportare.map((f) => (
            <div key={`${f.fonte}-${f.fonte_id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{f.etichetta}</span>
                <span className="block break-all font-mono text-xs text-slate-700">
                  {f.cig && <>CIG {f.cig} </>}{f.cup && <>CUP {f.cup}</>}
                </span>
                {f.problemi.map((p) => <span key={p} className="block text-xs text-amber-800">{tr("{problema}: correggilo dopo l'importazione.", { problema: p })}</span>)}
              </div>
              <Button type="button" size="sm" variant="outline" disabled={disabilitato} className="shrink-0 bg-white"
                onClick={() => onChange([...bozze, bozzaDaFonte(f)])}>
                <Download className="mr-1.5 h-4 w-4" />{tr("Importa")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {bozze.length === 0 && (
        <p className="text-sm text-muted-foreground">{tr("Nessun riferimento. Aggiungi il contratto, l'ordine d'acquisto o la convenzione: ogni affidamento, lotto o progetto è una riga.")}</p>
      )}

      {bozze.map((b, i) => {
        const { errori, mancanze } = controllaRiferimento(b);
        const id = (campo: string) => `rif-${b.chiave}-${campo}`;
        return (
          <fieldset key={b.chiave} className="space-y-3 rounded-lg border bg-card p-3" aria-label={tr("Riferimento {n}", { n: i + 1 })}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{tr("Riferimento {n}", { n: i + 1 })}</span>
              {b.fonte !== "manuale" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{ETICHETTA_FONTE[b.fonte]}</span>}
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabilitato || i === 0} onClick={() => sposta(i, -1)} aria-label={tr("Sposta su")}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabilitato || i === bozze.length - 1} onClick={() => sposta(i, 1)} aria-label={tr("Sposta giù")}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-700" disabled={disabilitato} onClick={() => onChange(bozze.filter((x) => x.chiave !== b.chiave))} aria-label={tr("Togli riferimento")}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={id("tipo")}>{tr("Tipo")}</Label>
                <Select value={b.tipo} disabled={disabilitato} onValueChange={(v) => cambia(b.chiave, { tipo: v as TipoRiferimentoPa })}>
                  <SelectTrigger id={id("tipo")}><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI_RIFERIMENTO_PA.map((t) => <SelectItem key={t.valore} value={t.valore}>{t.etichetta}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={id("numero")}>{tr("Numero")}</Label>
                <Input id={id("numero")} value={b.numero} disabled={disabilitato} aria-invalid={!!errori.numero} onChange={(e) => cambia(b.chiave, { numero: e.target.value })} placeholder={tr("Es. Rep. 1234/2026")} />
                {errori.numero && <p className="text-xs text-red-700" role="alert">{errori.numero}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor={id("data")}>{tr("Data")}</Label>
                <Input id={id("data")} type="date" value={b.data} disabled={disabilitato} onChange={(e) => cambia(b.chiave, { data: e.target.value })} aria-invalid={!!errori.data} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={id("cig")}>CIG</Label>
                <Input id={id("cig")} value={b.cig} maxLength={12} disabled={disabilitato || b.cig_non_dovuto} className="font-mono uppercase"
                  aria-invalid={!!errori.cig} onChange={(e) => cambia(b.chiave, { cig: e.target.value.toUpperCase() })} placeholder={tr("10 caratteri")} />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={b.cig_non_dovuto} disabled={disabilitato} aria-label={tr("CIG non dovuto")}
                    onCheckedChange={(v) => cambia(b.chiave, { cig_non_dovuto: v === true, cig: v === true ? "" : b.cig })} />
                  {tr("CIG non dovuto")}
                </label>
                {b.cig_non_dovuto && (
                  <Input id={id("cig-motivo")} aria-label={tr("Motivo per cui il CIG non è dovuto")} value={b.cig_motivo_esclusione} disabled={disabilitato}
                    onChange={(e) => cambia(b.chiave, { cig_motivo_esclusione: e.target.value })} placeholder={tr("Motivo (es. esclusione art. …)")} />
                )}
                {errori.cig && <p className="text-xs text-red-700" role="alert">{errori.cig}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor={id("cup")}>CUP</Label>
                <Input id={id("cup")} value={b.cup} maxLength={17} disabled={disabilitato || b.cup_non_dovuto} className="font-mono uppercase"
                  aria-invalid={!!errori.cup} onChange={(e) => cambia(b.chiave, { cup: e.target.value.toUpperCase() })} placeholder={tr("15 caratteri")} />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={b.cup_non_dovuto} disabled={disabilitato} aria-label={tr("CUP non dovuto")}
                    onCheckedChange={(v) => cambia(b.chiave, { cup_non_dovuto: v === true, cup: v === true ? "" : b.cup })} />
                  {tr("CUP non dovuto")}
                </label>
                {errori.cup && <p className="text-xs text-red-700" role="alert">{errori.cup}</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={id("lotto")}>{tr("Lotto")}</Label>
                <Input id={id("lotto")} value={b.lotto} disabled={disabilitato} aria-invalid={!!errori.lotto} onChange={(e) => cambia(b.chiave, { lotto: e.target.value })} placeholder={tr("Es. Lotto 1 (max {max})", { max: MAX_LOTTO })} />
                {errori.lotto && <p className="text-xs text-red-700" role="alert">{errori.lotto}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor={id("determina")}>Determina / atto di affidamento</Label>
                <Input id={id("determina")} value={b.determina} disabled={disabilitato} onChange={(e) => cambia(b.chiave, { determina: e.target.value })} placeholder={tr("Es. Det. n. 45 del 02/03/2026")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={id("impegno")}>Impegno di spesa</Label>
                <Input id={id("impegno")} value={b.impegno_spesa} disabled={disabilitato} onChange={(e) => cambia(b.chiave, { impegno_spesa: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={id("ufficio")}>Codice Univoco Ufficio</Label>
                <Input id={id("ufficio")} value={b.codice_univoco_ufficio} maxLength={8} disabled={disabilitato} className="font-mono uppercase"
                  aria-invalid={!!errori.codice_univoco_ufficio} onChange={(e) => cambia(b.chiave, { codice_univoco_ufficio: e.target.value.toUpperCase() })} placeholder={tr("6 caratteri")} />
                {errori.codice_univoco_ufficio && <p className="text-xs text-red-700" role="alert">{errori.codice_univoco_ufficio}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={id("note")}>{tr("Note per la fatturazione")}</Label>
                <Textarea id={id("note")} rows={2} value={b.note_fatturazione} disabled={disabilitato} onChange={(e) => cambia(b.chiave, { note_fatturazione: e.target.value })} />
              </div>
            </div>

            {mancanze.length > 0 && (
              <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{tr("Manca ancora: {mancanze}. Si salva lo stesso.", { mancanze: mancanze.join(" · ") })}</p>
            )}
          </fieldset>
        );
      })}

      <Button type="button" variant="outline" size="sm" disabled={disabilitato} onClick={() => onChange([...bozze, bozzaVuota(bozze.length ? "ordine_acquisto" : "contratto")])}>
        <Plus className="mr-1.5 h-4 w-4" />{tr("Aggiungi riferimento")}
      </Button>
    </div>
  );
}
