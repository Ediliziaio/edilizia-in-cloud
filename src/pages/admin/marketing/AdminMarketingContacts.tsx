import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { Users, Loader2 } from "lucide-react";

export default function AdminMarketingContacts() {
  const { hasAccess, permLoading } = useAdminMarketing();

  if (permLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!hasAccess) return <div className="flex flex-col items-center justify-center py-20 text-center"><Users className="h-12 w-12 text-muted-foreground/40 mb-4" /><h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" />Contatti & Lead</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestione lead e contatti della piattaforma</p>
      </div>
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Pagina contatti in arrivo (AM4).</div>
    </div>
  );
}
