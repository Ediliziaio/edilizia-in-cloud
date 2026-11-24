import { useId, useState } from "react";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { rotazioneSchermo } from "../../../../shared/planimetrie/orientamento";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function NordPianta({ nord, onCambia }: { nord?: number; onCambia: (nord?: number) => void }) {
  const t = useT();
  const id = useId();
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const valore = testo.trim() ? Number(testo.replace(",", ".")) : NaN;
  return <Popover open={aperto} onOpenChange={v => {
    if (v) setTesto(nord === undefined ? "" : String(nord));
    setAperto(v);
  }}>
    <PopoverTrigger asChild>
      <Button type="button" size="sm" variant="outline" aria-label={t("Nord del progetto")}>
        <Compass aria-hidden="true" /> {nord === undefined ? t("Nord") : t("Nord {nord}°", { nord: String(nord ?? "") })}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-64">
      <form className="space-y-2" onSubmit={e => {
        e.preventDefault();
        if (!Number.isFinite(valore)) return;
        onCambia(rotazioneSchermo(-valore));
        setAperto(false);
      }}>
        <Label htmlFor={id}>{t("Nord del progetto (°)")}</Label>
        <Input id={id} inputMode="decimal" value={testo} onChange={e => setTesto(e.target.value)} placeholder="0" />
        <p className="text-xs text-muted-foreground">{t("0° verso l’alto, 90° verso sinistra. Orienta il sole indicativo del 3D e dei render.")}</p>
        <div className="flex flex-wrap gap-1">
          <Button type="submit" size="sm" disabled={!Number.isFinite(valore)}>{t("Imposta nord")}</Button>
          {nord !== undefined && <Button type="button" size="sm" variant="ghost" onClick={() => { onCambia(undefined); setAperto(false); }}>{t("Azzera")}</Button>}
        </div>
      </form>
    </PopoverContent>
  </Popover>;
}
