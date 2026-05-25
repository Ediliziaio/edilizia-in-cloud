import { EmailLayout } from "@/pages/azienda/email/EmailLayout";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export default function AdminEmailClientPage() {
  return (
    <div className="-m-3 md:-m-6">
      <EmailLayout
        companyIdOverride={PLATFORM_ADMIN_COMPANY_ID}
        settingsPath="/admin/impostazioni/email"
      />
    </div>
  );
}
