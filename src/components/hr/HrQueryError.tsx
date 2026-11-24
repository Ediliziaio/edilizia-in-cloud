import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** A failed read is never an empty archive or a green compliance indicator. */
export function HrQueryError({ label, onRetry }: { label: string; onRetry: () => unknown }) {
  const t = useT();
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
    <p className="flex-1">{t("{label}. I dati non sono verificabili in questo momento.", { label: String(label ?? "") })}</p>
    <Button size="sm" variant="outline" onClick={() => { void onRetry(); }}>{t("Riprova")}</Button>
  </div>;
}
