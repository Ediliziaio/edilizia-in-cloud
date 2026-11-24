import type { StaffPermissions } from "./PermissionsDialog";
import { permissionChanges, permissionValue } from "@/lib/users/permissionChanges";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PermissionsChangeReview({before,after,pipelines=[]}:{before:StaffPermissions;after:StaffPermissions;pipelines?:{id:string;name:string}[]}) {
  const t = useT();
  const changes=permissionChanges(before,after);
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="max-sm:col-span-2">{t("Rivedi modifiche")} <span className="ml-1 tabular-nums">({changes.length})</span></Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("Modifiche ai permessi")}</DialogTitle><DialogDescription>{t("Confronto con la configurazione salvata. Chiudere questa anteprima non salva: usa “Salva permessi” nella pagina.")}</DialogDescription></DialogHeader>
      <div className="space-y-2">{changes.map(change=><div key={change.key} className="rounded-lg border p-3 text-sm"><h3 className="font-medium">{t(change.label)}</h3><dl className="mt-2 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">{t("Salvato")}</dt><dd className="mt-1 break-words">{permissionValue(change.key,change.before,pipelines)}</dd></div><div><dt className="text-muted-foreground">{t("Da salvare")}</dt><dd className="mt-1 break-words font-medium">{permissionValue(change.key,change.after,pipelines)}</dd></div></dl></div>)}</div>
      <p className="text-xs text-muted-foreground">{t("Sono incluse le autorizzazioni di modifica collegate. Il riepilogo della pagina mostra anche gli accessi impliciti, come i costi inclusi negli acquisti.")}</p>
    </DialogContent>
  </Dialog>;
}
