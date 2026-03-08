import ProfileTab from "@/components/admin/settings/ProfileTab";

export default function AdminSettingsProfile() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profilo</h1>
        <p className="text-muted-foreground">Gestisci il tuo account personale</p>
      </div>
      <ProfileTab />
    </div>
  );
}
