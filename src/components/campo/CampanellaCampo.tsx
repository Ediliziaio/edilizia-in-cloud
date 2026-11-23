import { NotificationsBellPopover } from "@/components/notifications/NotificationsBellPopover";
import { linkPerCampo, linkPerTecnico } from "@/lib/notifiche/linkCampo";
// Scala dei testi del telefono per tutta l'area campo: la campanella è l'aggancio (`header:has([data-campo-campanella])`,
// vedi il file). Con la campanella comune dell'ufficio l'attributo sta sul contenitore.
import "./scalaTelefonoCampo.css";

export function CampanellaCampo({ className, tecnico = false }: { className?: string; tecnico?: boolean }) {
  return (
    <span data-campo-campanella="" className="contents">
      <NotificationsBellPopover className={className} avvisiAzienda={false}
        trasformaLink={tecnico ? linkPerTecnico : linkPerCampo} preferenze="/campo/impostazioni/notifiche" />
    </span>
  );
}
