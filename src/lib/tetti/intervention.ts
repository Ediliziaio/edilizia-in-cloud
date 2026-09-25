import type { TettiTemplateModuleId } from "@/lib/moduli-vendita/tettiTemplateModules";

/** Operational selection, separate from PDF demo quantities and prices. */
export const TET_INTERVENTION_TYPES: Record<TettiTemplateModuleId, string> = {
  rifacimento: "rifacimento_completo",
  ripasso: "ripasso",
  riparazioni: "riparazioni_infiltrazioni",
  isolamento: "coibentazione",
  impermeabilizzazione: "impermeabilizzazione",
  lattoneria: "lattoneria",
};
