import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { schedeManodopera, type SchedaManodopera } from "@/lib/manodopera/schede";

/**
 * Le schede di Manodopera e Mezzi che la persona può aprire. Mentre permessi e
 * piano si caricano restituisce `inCaricamento`: il menu tiene la voce, la
 * pagina aspetta.
 */
export function useSchedeManodopera(): { schede: SchedaManodopera[]; inCaricamento: boolean } {
  const perms = usePermissions();
  const { isModuleEnabled, getFeatureAccessLevel, limitsLoading, flagsLoading, currentPlan, isDemoBaseline, isLimitedPlan } =
    useStatoPiano();

  const inCaricamento = perms.isLoading || limitsLoading || flagsLoading;

  const schede = useMemo(() => {
    // Stessa regola del menu: il modulo fuori piano nasconde la scheda solo
    // quando il piano è completo e noto; demo e piani limitati la mostrano.
    const tuttoAperto = isDemoBaseline || isLimitedPlan || !currentPlan;
    const livello = (k: string) => getFeatureAccessLevel(k);
    return schedeManodopera({
      permessi: {
        operai: perms.canViewOperai === true,
        subappaltatori: perms.canViewSubappaltatori === true,
        mezzi: perms.canViewMezzi === true,
      },
      modulo: (k) => tuttoAperto || isModuleEnabled(k),
      // Il menu guardava «subappaltatori», la pagina «cantieri_avanzati»: ora
      // servono entrambe, così voce e pagina non si contraddicono più.
      subappaltatoriNelPiano: livello("subappaltatori") !== "disabled" && livello("cantieri_avanzati") !== "disabled",
    });
  }, [perms.canViewOperai, perms.canViewSubappaltatori, perms.canViewMezzi, isModuleEnabled, getFeatureAccessLevel,
      currentPlan, isDemoBaseline, isLimitedPlan]);

  return { schede, inCaricamento };
}
