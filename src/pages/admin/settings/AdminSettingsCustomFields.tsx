import { PlatformEntityCustomFieldsPanel } from "@/components/admin/settings/PlatformEntityCustomFieldsPanel";

export default function AdminSettingsCustomFields() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campi personalizzati</h1>
        <p className="text-muted-foreground">
          Catalogo dei campi di sistema, copertura per oggetto e campi creati dalle aziende sulla piattaforma.
        </p>
      </div>
      <PlatformEntityCustomFieldsPanel />
    </div>
  );
}
