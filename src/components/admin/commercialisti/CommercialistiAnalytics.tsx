import { Building2, Calculator, CheckCircle2, Mail, Users } from "lucide-react";
import { RigaRiepilogo } from "@/components/admin/fatturato/AreaUI";

interface StudioLite {
  status: string | null;
  members_count: number;
  companies: { company_id: string; status: string | null }[];
}

export function CommercialistiAnalytics({ studi, filtri, onAttivi, onInviti }: {
  studi: StudioLite[];
  filtri: { attivi: boolean; inviti: boolean };
  onAttivi: () => void;
  onInviti: () => void;
}) {
  const deleghe = studi.flatMap(s => s.companies);
  const aziende = new Set(deleghe.filter(c => c.status === "active").map(c => c.company_id)).size;
  const inviti = deleghe.filter(c => c.status === "invited").length;
  return (
    <RigaRiepilogo colonne={5} voci={[
      { etichetta: "Studi registrati", valore: studi.length, icona: Calculator },
      {
        etichetta: "Studi attivi", valore: studi.filter(s => s.status === "active").length,
        icona: CheckCircle2, tono: "buono", attivo: filtri.attivi, onClick: onAttivi,
      },
      { etichetta: "Aziende delegate", valore: aziende, dettaglio: "Con delega attiva", icona: Building2 },
      {
        etichetta: "Inviti in attesa", valore: inviti, icona: Mail,
        tono: inviti ? "attenzione" : "neutro", attivo: filtri.inviti, onClick: onInviti,
      },
      { etichetta: "Membri attivi", valore: studi.reduce((somma, s) => somma + s.members_count, 0), icona: Users },
    ]} />
  );
}
