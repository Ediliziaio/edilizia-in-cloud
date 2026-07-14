import WhatsappLocalePanel from "@/components/admin/settings/whatsapp-locale/WhatsappLocalePanel";

export default function AdminSettingsWhatsappLocalePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp Locale</h1>
        <p className="text-muted-foreground">
          Canale WhatsApp non-ufficiale multi-numero (gateway self-hosted), riservato a
          marketing e outreach della piattaforma — separato dal WhatsApp ufficiale Meta.
        </p>
      </div>
      <WhatsappLocalePanel />
    </div>
  );
}
