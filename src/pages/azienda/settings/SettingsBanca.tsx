/**
 * Impostazioni → Fatturazione → Banca.
 *
 * Prima il collegamento del conto era una piastrella dentro Integrazioni, in mezzo a Meta,
 * Google e Stripe: è la banca dell'azienda, sta vicino alla fatturazione e agli incassi.
 * Qui si collegano i conti, si vede quando scade il consenso e si ricollega quando serve.
 */
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";

export default function SettingsBanca() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 max-sm:text-lg">Banca</h1>
        <p className="text-sm text-muted-foreground">
          Collega i conti correnti dell'azienda in sola lettura: i movimenti arrivano da soli e si
          abbinano a fatture e costi. Le credenziali si inseriscono sul sito della banca, noi non le vediamo mai.
        </p>
      </div>
      <BankConnectionsCard />
    </div>
  );
}
