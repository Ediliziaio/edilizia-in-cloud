import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function StatoBozzaTecnica({ errore, stato, riprova }: {
  errore: string; stato: "iniziale" | "salvataggio" | "salvata"; riprova: () => void;
}) {
  const t = useT();
  if (errore) return <div role="alert" className="flex flex-wrap items-center gap-x-2 rounded-md bg-destructive/10 px-2.5 text-sm text-destructive">
    <p className="flex-1 py-2">{t(errore)}</p>
    <Button type="button" variant="ghost" className="min-h-11 px-2" onClick={riprova}>
      {errore.startsWith("Questa bozza") ? t("Ricarica bozza") : t("Riprova")}
    </Button>
  </div>;
  if (stato === "iniziale") return null;
  return <p role="status" className="text-xs text-muted-foreground">
    {stato === "salvata" ? t("Bozza salvata sul telefono") : t("Salvo la bozza…")}
  </p>;
}
