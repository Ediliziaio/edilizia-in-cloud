import { CheckCircle } from "lucide-react";

interface ConnectionConfirmStepProps {
  hook: any;
}

export function ConnectionConfirmStep({ hook }: ConnectionConfirmStepProps) {
  const { selectedPages } = hook;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
        <CheckCircle className="h-6 w-6" />
        <p className="font-medium">Pagine collegate con successo!</p>
      </div>

      {selectedPages.length > 0 && (
        <div className="border rounded-lg divide-y">
          {selectedPages.map((page: any) => (
            <div key={page.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {page.asset_name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">{page.asset_name}</p>
                <p className="text-xs text-muted-foreground">Pagina Facebook</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <strong>Prossimo step:</strong> Configura la mappatura dei campi per iniziare a sincronizzare i lead nel CRM.
        </p>
      </div>
    </div>
  );
}
