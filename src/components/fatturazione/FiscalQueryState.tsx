import { Button } from "@/components/ui/button";
export function FiscalQueryState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 p-5"
      >
        <p className="font-medium">Dati fiscali non disponibili</p>
        <p className="mt-1 text-sm">
          La lettura non è riuscita. Nessun elenco vuoto o saldo zero può essere
          considerato valido.
        </p>
        <Button className="mt-3" variant="outline" onClick={onRetry}>
          Riprova caricamento
        </Button>
      </div>
    );
  return loading ? (
    <p
      role="status"
      className="rounded-xl border p-6 text-sm text-muted-foreground"
    >
      Caricamento dei dati fiscali…
    </p>
  ) : null;
}
