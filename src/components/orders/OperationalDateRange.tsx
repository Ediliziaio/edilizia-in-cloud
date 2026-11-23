import { Input } from "@/components/ui/input";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function OperationalDateRange({ from, to, onChange }: {from:string;to:string;onChange:(values:{da?:string;a?:string})=>void}) {
  const t = useT();
  const invalid = !!from && !!to && from > to;
  return <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs">{t("Dal")}<Input type="date" aria-label={t("Data iniziale")} value={from} max={to || undefined} aria-invalid={invalid} onChange={event=>onChange({da:event.target.value})} className="h-8" /></label><label className="space-y-1 text-xs">{t("Al")}<Input type="date" aria-label={t("Data finale")} value={to} min={from || undefined} aria-invalid={invalid} onChange={event=>onChange({a:event.target.value})} className="h-8" /></label></div>{invalid && <p role="alert" className="text-xs text-destructive">{t("La data finale deve essere uguale o successiva a quella iniziale.")}</p>}</div>;
}
