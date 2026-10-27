import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SrCard } from "@/lib/serramenti/wizardUI";
import { ClipboardCheck } from "lucide-react";
import { LAVORAZIONI_POSA, POSA_STANDARD, PROBLEMI_INFISSI, SCENARI_ESISTENTI, leggiAnalisiIntervento, nuovaAnalisiIntervento, type AnalisiIntervento } from "@/lib/serramenti/analisiIntervento";

function UwInput({ id, value, onChange }: { id: string; value: number | null; onChange: (v: number | null) => void }) {
  const [bozza, setBozza] = useState(value?.toString() ?? "");
  useEffect(() => setBozza(value?.toString() ?? ""), [value]);
  const n = Number(bozza.replace(",", "."));
  const errore = bozza !== "" && (!Number.isFinite(n) || n < 0 || n > 20);
  return <><Input id={id} inputMode="decimal" value={bozza} aria-invalid={errore} onChange={e => {
    const s = e.target.value; setBozza(s); const next = Number(s.replace(",", "."));
    if (!s.trim()) onChange(null); else if (Number.isFinite(next) && next >= 0 && next <= 20) onChange(next);
  }} />{errore && <p className="text-xs text-destructive">Inserisci un valore tra 0 e 20.</p>}</>;
}

export function AnalisiInterventoEditor({ value, onChange, disabled = false }: { value: unknown; onChange: (next: AnalisiIntervento | null) => void; disabled?: boolean }) {
  const id = useId();
  const a = leggiAnalisiIntervento(value);
  const set = (patch: Partial<AnalisiIntervento>) => onChange({ ...(a ?? nuovaAnalisiIntervento()), ...patch });
  return <SrCard title="Prima, dopo e posa" icon={<ClipboardCheck className="h-4 w-4" />}>
    {!a?.attiva ? <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ ...(a ?? nuovaAnalisiIntervento()), attiva: true })}>Aggiungi valutazione dell'infisso esistente</Button> : <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <label className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={a.mostraConfronto} onCheckedChange={v => set({ mostraConfronto: v === true })} />Includi confronto nel PDF</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`${id}-esistente`}>Serramento attuale</Label><select id={`${id}-esistente`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={a.esistente} onChange={e => set({ esistente: e.target.value as AnalisiIntervento["esistente"] })}>
          {Object.entries(SCENARI_ESISTENTI).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
        </select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-vetro`}>Vetro esistente</Label><select id={`${id}-vetro`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={a.vetro} onChange={e => set({ vetro: e.target.value as AnalisiIntervento["vetro"] })}>
          <option value="da_rilevare">Da rilevare</option><option value="singolo">Singolo</option><option value="doppio">Doppio</option><option value="triplo">Triplo</option>
        </select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(PROBLEMI_INFISSI).map(([k, label]) => <label key={k} className="flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={a.problemi.includes(k as AnalisiIntervento["problemi"][number])} onCheckedChange={checked => set({ problemi: checked ? [...a.problemi, k as AnalisiIntervento["problemi"][number]] : a.problemi.filter(p => p !== k) })} />{label}</label>)}</div>
      <div className="space-y-2"><Label htmlFor={`${id}-note`}>Osservazioni del rilievo</Label><Textarea id={`${id}-note`} maxLength={1200} value={a.noteRilievo} onChange={e => set({ noteRilievo: e.target.value })} /></div>
      <details open={Boolean(a.uwPrima || a.uwDopo || a.fontePrima || a.fonteDopo)} className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Dati tecnici e fonti (facoltativi)</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{(["Prima", "Dopo"] as const).map(lato => <div key={lato} className="space-y-2">
        <Label htmlFor={`${id}-uw${lato}`}>Uw {lato.toLowerCase()} (W/m²K), se disponibile</Label>
        <UwInput id={`${id}-uw${lato}`} value={a[`uw${lato}`]} onChange={v => set({ [`uw${lato}`]: v })} />
        <Label htmlFor={`${id}-fonte${lato}`}>Fonte del valore {lato.toLowerCase()}</Label><Input id={`${id}-fonte${lato}`} maxLength={300} value={a[`fonte${lato}`]} onChange={e => set({ [`fonte${lato}`]: e.target.value })} />
      </div>)}</div>
      </details>
      <div className="space-y-2"><Label htmlFor={`${id}-motivo`}>Perche questa soluzione per il cliente</Label><Textarea id={`${id}-motivo`} maxLength={1200} value={a.motivo} onChange={e => set({ motivo: e.target.value })} /></div>
      <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Lavorazioni previste · {Object.values(a.posa).filter(v => v === "inclusa").length} incluse</summary><div className="mt-4 space-y-3">{Object.entries(LAVORAZIONI_POSA).map(([k, label]) => <div key={k} className="grid items-center gap-2 border-b pb-3 sm:grid-cols-2">
        <Label htmlFor={`${id}-posa-${k}`}>{label}</Label><select id={`${id}-posa-${k}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={a.posa[k as keyof typeof a.posa]} onChange={e => set({ posa: { ...a.posa, [k]: e.target.value } })}>
          <option value="da_definire">Da definire</option><option value="inclusa">Inclusa</option><option value="esclusa">Esclusa</option>
        </select>
      </div>)}<Button type="button" variant="outline" onClick={() => set({ posa: { ...POSA_STANDARD } })}>Ripristina posa standard</Button></div></details>
      <Button type="button" variant="ghost" onClick={() => set({ attiva: false })}>Rimuovi valutazione dal preventivo</Button>
    </fieldset>}
  </SrCard>;
}
