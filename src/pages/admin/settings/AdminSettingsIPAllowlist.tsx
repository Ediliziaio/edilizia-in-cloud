import { IpAutorizzatiPanel } from "@/components/admin/settings/IpAutorizzatiPanel";

/** Pagina a sé della lista IP. Lo stesso contenuto sta nella scheda «IP autorizzati» di Sicurezza (?scheda=ip). */
export default function AdminSettingsIPAllowlist() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IP autorizzati</h1>
        <p className="text-muted-foreground max-sm:hidden">Elenco degli indirizzi da cui si potrà entrare nel pannello di amministrazione.</p>
      </div>
      <IpAutorizzatiPanel />
    </div>
  );
}
