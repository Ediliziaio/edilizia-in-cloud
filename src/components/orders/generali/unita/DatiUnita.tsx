// src/components/orders/generali/unita/DatiUnita.tsx
// I dati dell'unità: sigla, dove sta, m² e millesimi, prezzi, agenzia. Solo da tablet e computer.
// Si salvano solo i campi cambiati; prezzi e provvigione solo a chi vede gli importi.
import { useMemo, useState } from "react";
import { Building2, Loader2, Save, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inCampo, leggiCampo } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useSalvaUnita, type DatiUnita as Dati } from "@/hooks/useGeneraleUnita";
import { TIPOLOGIE_SUGGERITE, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Campo = "sigla" | "edificio" | "piano" | "tipologia" | "mq" | "millesimi" | "listino" | "trattato" | "rogito" | "agenzia" | "provvigione" | "note";
const NUMERICI: Campo[] = ["mq", "millesimi", "listino", "trattato", "rogito", "provvigione"];
const IMPORTI: Campo[] = ["listino", "trattato", "rogito", "provvigione"];
const CHIAVE: Record<Campo, keyof Dati> = {
  sigla: "sigla", edificio: "edificio", piano: "piano", tipologia: "tipologia", mq: "mq_commerciali", millesimi: "millesimi",
  listino: "prezzo_listino", trattato: "prezzo_trattato", rogito: "prezzo_rogito", agenzia: "agenzia", provvigione: "provvigione_agenzia", note: "note",
};

const iniziali = (u: UnitaGenerale): Record<Campo, string> => ({
  sigla: u.sigla, edificio: u.edificio ?? "", piano: u.piano ?? "", tipologia: u.tipologia ?? "",
  mq: inCampo(u.mq), millesimi: inCampo(u.millesimi), listino: inCampo(u.listino), trattato: inCampo(u.trattato),
  rogito: inCampo(u.rogito), agenzia: u.agenzia ?? "", provvigione: inCampo(u.provvigione), note: u.note ?? "",
});
const valoreCampo = (c: Campo, valore: string) => NUMERICI.includes(c) ? leggiCampo(valore) : valore.trim() || null;

export function DatiUnita({ generaleId, unita: u, vedeImporti }: { generaleId: string; unita: UnitaGenerale; vedeImporti: boolean }) {
  const tr = useT();
  const salva = useSalvaUnita(generaleId);
  const prima = useMemo(() => iniziali(u), [u]);
  const [bozza, setBozza] = useState<Partial<Record<Campo, string>>>({});
  const [ultimaLettura, setUltimaLettura] = useState(prima);
  if (ultimaLettura !== prima) {
    setUltimaLettura(prima);
    const campi = Object.keys(bozza) as Campo[];
    const inAttesa = campi.filter(c => valoreCampo(c, bozza[c]!) !== valoreCampo(c, prima[c]));
    if (inAttesa.length !== campi.length) setBozza(Object.fromEntries(inAttesa.map(c => [c, bozza[c]])));
  }
  const v = { ...prima, ...bozza };
  const cambia = (c: Campo) => (ev: { target: { value: string } }) => {
    const valore = ev.target.value;
    setBozza(x => ({ ...x, [c]: valore }));
  };

  const cambiati = (Object.keys(bozza) as Campo[]).filter(c =>
    (vedeImporti || !IMPORTI.includes(c))
    && (c !== "trattato" || u.stato !== "libera")
    && (c !== "rogito" || u.stato === "rogitata")
    && valoreCampo(c, v[c]) !== valoreCampo(c, prima[c]),
  );
  const invalidi = cambiati.filter(c => {
    if (!NUMERICI.includes(c)) return false;
    const n = leggiCampo(v[c]);
    return n !== null && (!Number.isFinite(n) || n < 0);
  });
  const errore = !v.sigla.trim() ? tr("Inserisci la sigla dell’unità.") : invalidi.length ? tr("Controlla i campi numerici evidenziati.") : null;

  const conferma = () => {
    if (errore || cambiati.length === 0 || salva.isPending) return;
    const dati: Dati = {};
    for (const c of cambiati) {
      (dati as Record<string, unknown>)[CHIAVE[c]] = valoreCampo(c, v[c]);
    }
    salva.mutate(
      { orderId: u.orderId, dati },
      {
        onSuccess: () => toast.success(tr("{sigla} salvata", { sigla: v.sigla.trim() })),
        onError: (e) => toast.error(messaggioGenerale(e, "l'unità")),
      },
    );
  };

  const id = (c: Campo) => `unita-${u.orderId}-${c}`;
  const campo = (c: Campo, etichetta: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={id(c)}>{tr(etichetta)}</Label>
      <Input id={id(c)} value={v[c]} onChange={cambia(c)} disabled={salva.isPending}
        aria-invalid={(invalidi.includes(c) || (c === "sigla" && !v.sigla.trim())) || undefined} {...extra} />
    </div>
  );

  return (
    <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); conferma(); }}>
      <datalist id={`tipologie-${u.orderId}`}>
        {TIPOLOGIE_SUGGERITE.map((t) => <option key={t} value={t} />)}
      </datalist>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label={tr("Identificazione e superfici")} className="min-w-0 rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <Building2 className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> {tr("Identificazione e superfici")}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 xl:grid-cols-3">
            {campo("sigla", "Sigla", { maxLength: 40, required: true })}
            {campo("tipologia", "Tipologia", { list: `tipologie-${u.orderId}` })}
            {campo("edificio", "Edificio", { placeholder: tr("Es. Palazzina A") })}
            {campo("piano", "Piano", { placeholder: tr("Es. T, 1, S1") })}
            {campo("mq", "m² commerciali", { inputMode: "decimal" })}
            {campo("millesimi", "Millesimi", { inputMode: "decimal" })}
          </div>
          <div className="space-y-1.5 border-t p-4">
            <Label htmlFor={id("note")}>{tr("Note")}</Label>
            <Textarea id={id("note")} value={v.note} onChange={cambia("note")} rows={2} disabled={salva.isPending} />
          </div>
        </section>
        <section aria-label={tr("Condizioni commerciali")} className="min-w-0 rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <Tag className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> {tr("Condizioni commerciali")}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            {vedeImporti && campo("listino", "Prezzo di listino", { inputMode: "decimal" })}
            {vedeImporti && u.stato !== "libera" && campo("trattato", "Prezzo trattato", { inputMode: "decimal" })}
            {vedeImporti && u.stato === "rogitata" && campo("rogito", "Prezzo di rogito", { inputMode: "decimal" })}
            {campo("agenzia", "Agenzia")}
            {vedeImporti && campo("provvigione", "Provvigione agenzia €", { inputMode: "decimal" })}
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-muted/25 px-4 py-3">
        {cambiati.length > 0 && (errore
          ? <p role="alert" className="mr-auto text-xs text-destructive">{errore}</p>
          : <p role="status" className="mr-auto text-xs text-muted-foreground">{tr("Modifiche da salvare")}</p>)}
        <Button type="button" size="sm" variant="outline" disabled={!cambiati.length || salva.isPending}
          onClick={() => setBozza({})}>{tr("Ripristina")}</Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={!!errore || cambiati.length === 0 || salva.isPending}>
          {salva.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {tr("Salva i dati")}
        </Button>
      </div>
    </form>
  );
}
