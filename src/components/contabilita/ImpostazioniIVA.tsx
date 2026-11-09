import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import {
  impostazioniMancanti,
  useImpostazioniIVA,
  type ImpostazioniIVA as Valori,
} from "@/hooks/useImpostazioniIVA";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";

const VUOTE: Valori = {
  periodicita: "trimestrale",
  regime: "ordinario",
  iva_per_cassa: false,
  pro_rata_percentuale: null,
  attivita_separate: false,
  credito_anno_precedente: 0,
  metodo_acconto: "storico",
  cf_contribuente: null,
  cf_dichiarante: null,
  codice_carica: "1",
  cf_intermediario: null,
  note: null,
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60";

/** Fase 0 della liquidazione IVA: le scelte dell'azienda per l'anno. */
export function ImpostazioniIVA({ anno, onSalvate }: { anno: number; onSalvate?: () => void }) {
  const s = useImpostazioniIVA(anno);
  const { data: azienda, isLoading: aziendaInArrivo } = useAnagraficaAzienda();
  if (s.isLoading || s.isError || aziendaInArrivo)
    return <FiscalQueryState loading={s.isLoading || aziendaInArrivo} error={s.isError} onRetry={() => void s.refetch()} />;
  // La prima volta il codice fiscale si prende dall'anagrafica: uno in meno da scrivere.
  const cfAzienda = String(azienda?.codice_fiscale || azienda?.partita_iva || "").replace(/^IT/i, "").trim().toUpperCase() || null;
  // La chiave rimonta il modulo quando cambiano anno o riga salvata: i valori
  // iniziali vengono sempre dal database, mai da quelli dell'anno prima.
  return <Modulo key={`${anno}:${s.impostazioni?.aggiornato_il ?? "nuova"}`} anno={anno} s={s} cfAzienda={cfAzienda} onSalvate={onSalvate} />;
}

function iniziali(s: ReturnType<typeof useImpostazioniIVA>, cfAzienda: string | null): Valori {
  if (!s.impostazioni) return { ...VUOTE, cf_contribuente: cfAzienda };
  const { aggiornato_il: _ignora, ...resto } = s.impostazioni;
  return { ...resto, credito_anno_precedente: Number(resto.credito_anno_precedente) || 0 };
}

function Modulo({ anno, s, cfAzienda, onSalvate }: { anno: number; s: ReturnType<typeof useImpostazioniIVA>; cfAzienda: string | null; onSalvate?: () => void }) {
  const [v, setV] = useState<Valori>(() => iniziali(s, cfAzienda));
  const nuova = !s.impostazioni;

  const mancanti = impostazioniMancanti(nuova ? null : v);
  const off = !s.puoModificare || s.isSalvando;
  const set = <K extends keyof Valori>(k: K, x: Valori[K]) => setV((p) => ({ ...p, [k]: x }));
  const testo = (x: string) => (x.trim() ? x : null);

  return (
    <form
      className="space-y-5 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        // Prima compilazione: si torna dritti alla liquidazione.
        void s.salva(v).then(() => { if (nuova) onSalvate?.(); }).catch((): undefined => undefined);
      }}
    >
      <div>
        <h3 className="font-semibold">Impostazioni IVA {anno}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Servono alla liquidazione e al file LIPE: periodo, regime, credito di partenza e chi firma.
          {s.impostazioni && <> Ultima modifica {fiscalDate(s.impostazioni.aggiornato_il.slice(0, 10))}.</>}
        </p>
      </div>

      {mancanti.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <strong>Mancano ancora:</strong> {mancanti.join(" · ")}. Finché mancano, la liquidazione non si può confermare.
        </div>
      )}
      {v.regime === "forfettario" && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm">
          In regime forfettario non c'è liquidazione IVA periodica né LIPE: EiC non calcolerà saldi per quest'anno.
        </p>
      )}
      {v.attivita_separate && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">
          Contabilità separate per più attività: caso non gestito. Il calcolo si fermerà e lo dirà.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="iva-periodicita">Liquidazione</Label>
          <select id="iva-periodicita" className={selectClass} disabled={off} value={v.periodicita}
            onChange={(e) => set("periodicita", e.target.value as Valori["periodicita"])}>
            <option value="mensile">Mensile (versamento il 16 del mese dopo)</option>
            <option value="trimestrale">Trimestrale su opzione (+1% di interessi)</option>
            <option value="trimestrale_speciale">Trimestrale per natura (senza interessi)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="iva-regime">Regime</Label>
          <select id="iva-regime" className={selectClass} disabled={off} value={v.regime}
            onChange={(e) => set("regime", e.target.value as Valori["regime"])}>
            <option value="ordinario">Ordinario</option>
            <option value="forfettario">Forfettario</option>
            <option value="altro">Altro regime speciale</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="iva-credito">Credito IVA dell'anno precedente (€)</Label>
          <Input id="iva-credito" type="number" min={0} step="0.01" disabled={off}
            value={v.credito_anno_precedente}
            onChange={(e) => set("credito_anno_precedente", Math.max(0, Number(e.target.value) || 0))} />
          <p className="text-xs text-muted-foreground">Dalla dichiarazione IVA dell'anno prima, quello da usare in detrazione.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="iva-prorata">Pro-rata di detrazione (%)</Label>
          <Input id="iva-prorata" type="number" min={0} max={100} step="1" disabled={off}
            placeholder="Nessuno" value={v.pro_rata_percentuale ?? ""}
            onChange={(e) => set("pro_rata_percentuale", e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))))} />
          <p className="text-xs text-muted-foreground">Vuoto se l'azienda non fa operazioni esenti.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="iva-acconto">Metodo dell'acconto di dicembre</Label>
          <select id="iva-acconto" className={selectClass} disabled={off} value={v.metodo_acconto}
            onChange={(e) => set("metodo_acconto", e.target.value as Valori["metodo_acconto"])}>
            <option value="storico">Storico (88% dell'anno prima)</option>
            <option value="previsionale">Previsionale (88% del previsto)</option>
            <option value="analitico">Analitico (operazioni al 20 dicembre)</option>
          </select>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.iva_per_cassa} disabled={off} onCheckedChange={(x) => set("iva_per_cassa", x)} />
            IVA per cassa (art. 32-bis)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.attivita_separate} disabled={off} onCheckedChange={(x) => set("attivita_separate", x)} />
            Contabilità separate per più attività
          </label>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Frontespizio della LIPE</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="iva-cf">Codice fiscale dell'azienda</Label>
            <Input id="iva-cf" disabled={off} placeholder="11 cifre, o 16 caratteri per le ditte individuali" value={v.cf_contribuente ?? ""}
              onChange={(e) => set("cf_contribuente", testo(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="iva-dich">Codice fiscale di chi firma</Label>
            <Input id="iva-dich" disabled={off} placeholder="Legale rappresentante" value={v.cf_dichiarante ?? ""}
              onChange={(e) => set("cf_dichiarante", testo(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="iva-carica">Codice carica</Label>
            <Input id="iva-carica" disabled={off} inputMode="numeric" value={v.codice_carica ?? ""}
              onChange={(e) => set("codice_carica", testo(e.target.value))} />
            <p className="text-xs text-muted-foreground">1 = rappresentante legale.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="iva-interm">Codice fiscale dell'intermediario (facoltativo)</Label>
            <Input id="iva-interm" disabled={off} placeholder="Commercialista che invia" value={v.cf_intermediario ?? ""}
              onChange={(e) => set("cf_intermediario", testo(e.target.value))} />
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {!s.puoModificare && <p className="text-sm text-muted-foreground">Solo l'amministrazione può modificarle.</p>}
        <Button type="submit" disabled={off}>
          {s.isSalvando ? "Salvataggio…" : nuova ? "Salva impostazioni" : "Aggiorna impostazioni"}
        </Button>
      </div>
    </form>
  );
}
