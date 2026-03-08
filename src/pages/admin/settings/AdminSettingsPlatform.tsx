import PlatformInfoTab from "@/components/admin/settings/PlatformInfoTab";

export default function AdminSettingsPlatform() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Piattaforma</h1>
        <p className="text-muted-foreground">Informazioni sulla piattaforma</p>
      </div>
      <PlatformInfoTab />
    </div>
  );
}
