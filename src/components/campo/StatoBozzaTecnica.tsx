import { Button } from "@/components/ui/button";

export function StatoBozzaTecnica({ errore, stato, riprova }: {
  errore: string; stato: "iniziale" | "salvataggio" | "salvata"; riprova: () => void;
}) {
  if (errore) return <div role="alert" className="flex flex-wrap items-center gap-x-2 rounded-md bg-destructive/10 px-2.5 text-sm text-destructive">
    <p className="flex-1 py-2">{errore}</p>
    <Button type="button" variant="ghost" className="min-h-11 px-2" onClick={riprova}>
      {errore.startsWith("Questa bozza") ? "Ricarica bozza" : "Riprova"}
    </Button>
  </div>;
  if (stato === "iniziale") return null;
  return <p role="status" className="text-xs text-muted-foreground">
    {stato === "salvata" ? "Bozza salvata sul telefono" : "Salvo la bozza…"}
  </p>;
}
