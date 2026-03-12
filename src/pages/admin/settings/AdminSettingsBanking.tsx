import BankingSettingsTab from "@/components/admin/settings/BankingSettingsTab";

export default function AdminSettingsBanking() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Banking</h1>
        <p className="text-muted-foreground">Gestisci conti bancari e impostazioni pagamenti della piattaforma</p>
      </div>
      <BankingSettingsTab />
    </div>
  );
}
