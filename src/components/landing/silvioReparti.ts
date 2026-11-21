import { Brain, BriefcaseBusiness, HardHat, ShieldCheck, Wallet } from "lucide-react";

/** I reparti AI coordinati da Silvio: usati dal cervello in home e nella pagina AI edilizia. */
export const agentGroups = [
  {
    area: "Direzione",
    agents: ["Silvio", "Assistente titolare", "Brain sistema"],
    icon: Brain,
    color: "#F97415",
  },
  {
    area: "Finanza",
    agents: ["CFO", "Controller", "Commercialista", "Amministrazione"],
    icon: Wallet,
    color: "#22c55e",
  },
  {
    area: "Cantieri",
    agents: ["PM cantiere", "Capocantiere", "Tecnico/RSPP", "Acquisti"],
    icon: HardHat,
    color: "#3b82f6",
  },
  {
    area: "Vendite",
    agents: ["Sales", "Direttore vendite", "Marketing", "Cliente tutor"],
    icon: BriefcaseBusiness,
    color: "#8b5cf6",
  },
  {
    area: "Regole",
    agents: ["HR", "Compliance", "Legale", "Assistente cliente"],
    icon: ShieldCheck,
    color: "#f59e0b",
  },
];
