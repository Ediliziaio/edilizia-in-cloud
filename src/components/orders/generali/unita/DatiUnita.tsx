// src/components/orders/generali/unita/DatiUnita.tsx
// I dati dell'unità: sigla, dove sta, m² e millesimi, prezzi, agenzia. Solo da tablet e computer.
// Si salvano solo i campi cambiati; prezzi e provvigione solo a chi vede gli importi.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inCampo, leggiCampo } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useSalvaUnita, type DatiUnita as Dati } from "@/hooks/useGeneraleUnita";
import { TIPOLOGIE_SUGGERITE, type UnitaGenerale } from "@/lib/orders/generali/unita";

type Campo = "sigla" | "edificio" | "piano" | "tipologia" | "mq" | "millesimi" | "listino" | "trattato" | "rogito" | "agenzia" | "provvigione" | "note";
const NUMERICI: Campo[] = ["mq", "millesimi", "listino", "trattato", "rogito", "provvigione"];
const CHIAVE: Record<Campo, keyof Dati> = {
  sigla: "sigla", edificio: "edificio", piano: "piano", tipologia: "tipologia", mq: "mq_commerciali", millesimi: "millesimi",
  listino: "prezzo_listino", trattato: "prezzo_trattato", rogito: "prezzo_rogito", agenzia: "agenzia", provvigione: "provvigione_agenzia", note: "note",
};

const iniziali = (u: UnitaGenerale): Record<Campo, string> => ({
  sigla: u.sigla, edificio: u.edificio ?? "", piano: u.piano ?? "", tipologia: u.tipologia ?? "",
  mq: inCampo(u.mq), millesimi: inCampo(u.millesimi), listino: inCampo(u.listino), trattato: inCampo(u.trattato),
  rogito: inCampo(u.rogito), agenzia: u.agenzia ?? "", provvigione: inCampo(u.provvigione), note: u.note ?? "",
});

export function DatiUnita({ generaleId, unita: u, vedeImporti }: { generaleId: string; unita: UnitaGenerale; vedeImporti: boolean }) {
  const salva = useSalvaUnita(generaleId);
  const prima = iniziali(u);
  const [v, setV] = useState(prima);
  const cambia = (c: Campo) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [c]: ev.target.value }));

  const cambiati = (Object.keys(v) as Campo[]).filter((c) => v[c].trim() !== prima[c].trim());
  const sbagliati = NUMERICI.filter((c) => cambiati.includes(c) && Number.isNaN(leggiCampo(v[c]) ?? 0));
  const negativi = NUMERICI.filter((c) => (leggiCampo(v[c]) ?? 0) < 0);
  const errore = v.sigla.trim() === "" ? "Scrivi la sigla (es. A1)." : sbagliati.length || negativi.length ? "Controlla i numeri: m², millesimi e prezzi." : null;

  const conferma = () => {
    if (errore || cambiati.length === 0 || salva.isPending) return;
    const dati: Dati = {};
    for (const c of cambiati) {
      (dati as Record<string, unknown>)[CHIAVE[c]] = NUMERICI.includes(c) ? leggiCampo(v[c]) : v[c].trim() || null;
    }
    salva.mutate(
      { orderId: u.orderId, dati },
      {
        onSuccess: () => toast.success(`${v.sigla.trim()} salvata`),
        onError: (e) => toast.error(messaggioGenerale(e, "l'unità")),
      },
    );
  };

  const id = (c: Campo) => `unita-${u.orderId}-${c}`;
  const campo = (c: Campo, etichetta: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={id(c)}>{etichetta}</Label>
      <Input id={id(c)} value={v[c]} onChange={cambia(c)} {...extra} />
    </div>
  );

  return (
    <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); conferma(); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {campo("sigla", "Sigla", { maxLength: 40 })}
        {campo("edificio", "Edificio", { placeholder: "es. Scala A" })}
        {campo("piano", "Piano", { placeholder: "es. T, 1, S1" })}
        {campo("tipologia", "Tipologia", { list: `tipologie-${u.orderId}` })}
        {campo("mq", "m² commerciali", { inputMode: "decimal" })}
        {campo("millesimi", "Millesimi", { inputMode: "decimal" })}
        {vedeImporti && campo("listino", "Prezzo di listino", { inputMode: "decimal" })}
        {vedeImporti && u.stato !== "libera" && campo("trattato", "Prezzo trattato", { inputMode: "decimal" })}
        {vedeImporti && u.stato === "rogitata" && campo("rogito", "Prezzo di rogito", { inputMode: "decimal" })}
        {campo("agenzia", "Agenzia", { placeholder: "nessuna" })}
        {vedeImporti && campo("provvigione", "Provvigione agenzia €", { inputMode: "decimal" })}
      </div>
      <datalist id={`tipologie-${u.orderId}`}>
        {TIPOLOGIE_SUGGERITE.map((t) => <option key={t} value={t} />)}
      </datalist>
      <div className="space-y-1">
        <Label htmlFor={id("note")}>Note</Label>
        <Textarea id={id("note")} value={v.note} onChange={cambia("note")} rows={2} />
      </div>
      {errore && cambiati.length > 0 && <p className="text-xs text-destructive">{errore}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!!errore || cambiati.length === 0 || salva.isPending}>
          {salva.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Salva i dati
        </Button>
      </div>
    </form>
  );
}
