import { NotificationsBellPopover } from "@/components/notifications/NotificationsBellPopover";
import { linkPerCampo, linkPerTecnico } from "@/lib/notifiche/linkCampo";

export function CampanellaCampo({ className, tecnico = false }: { className?: string; tecnico?: boolean }) {
  return <NotificationsBellPopover className={className} avvisiAzienda={false}
    trasformaLink={tecnico ? linkPerTecnico : linkPerCampo} preferenze="/campo/impostazioni/notifiche" />;
}
