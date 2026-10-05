/**
 * I popup delle schede che prima erano pannelli aperti sopra la griglia di
 * Integrazioni: calendari e caselle di tutto il team, conti bancari, incassi
 * con carta (05/10/2026). Il contenuto è lo stesso di prima; cambia dove sta.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BankConnectionsCard from "./BankConnectionsCard";
import StripePaymentsCard from "./StripePaymentsCard";
import { CalendariDelTeam } from "./CompanyCalendarsOverview";
import { CaselleDelTeam, casellaDaRicollegare, useCaselleDelTeam } from "./CompanyEmailsOverview";
import { AutenticazioneDomini, useAutenticazioneDomini } from "./EmailDomainAuthPanel";
import type { PopupComponentProps } from "./IntegrationsCatalog";

/** Intro di una riga + il pulsante per collegare il proprio account dal profilo. */
function IntroConProfilo({
  testo,
  etichetta,
  scheda,
  onClose,
}: {
  testo: string;
  etichetta: string;
  scheda: "calendari" | "email";
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-muted-foreground">{testo}</p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          onClose();
          navigate(`/azienda/impostazioni/mio-profilo?tab=${scheda}`);
        }}
      >
        {etichetta}
      </Button>
    </div>
  );
}

export function CalendariPopup({ onClose }: PopupComponentProps) {
  return (
    <div className="space-y-4">
      <IntroConProfilo
        testo="Ognuno collega il proprio calendario dal suo profilo: qui vedi chi l'ha fatto e quali calendari del gestionale ci scrivono."
        etichetta="Collega il tuo"
        scheda="calendari"
        onClose={onClose}
      />
      <CalendariDelTeam />
    </div>
  );
}

/** Quante cose non vanno in una sezione: niente se zero. */
function Conteggio({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-[10px] font-medium tabular-nums text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
      {n}
    </span>
  );
}

/** Caselle del team e controllo del dominio, in due sezioni con il conto di quello che non va. */
export function CaselleEmailPopup({ onClose, scheda }: PopupComponentProps) {
  const [attiva, setAttiva] = useState(scheda === "dominio" ? "dominio" : "caselle");
  const { righe } = useCaselleDelTeam();
  const { daSistemare } = useAutenticazioneDomini();
  const guaste = righe.filter((r) => casellaDaRicollegare(r.status)).length;

  return (
    <div className="space-y-4">
      <IntroConProfilo
        testo="Ognuno collega la propria casella dal suo profilo: la posta arriva in Conversazioni e si scrive dal gestionale."
        etichetta="Collega la tua"
        scheda="email"
        onClose={onClose}
      />
      <Tabs value={attiva} onValueChange={setAttiva}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="caselle">
            Caselle{righe.length > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{righe.length}</span>}
            <Conteggio n={guaste} />
          </TabsTrigger>
          <TabsTrigger value="dominio">
            Dominio e consegna
            <Conteggio n={daSistemare.length} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="caselle" className="mt-4">
          <CaselleDelTeam />
        </TabsContent>
        <TabsContent value="dominio" className="mt-4">
          <AutenticazioneDomini />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ContiBancariPopup(_props: PopupComponentProps) {
  return <BankConnectionsCard senzaCornice />;
}

export function IncassiCartaPopup(_props: PopupComponentProps) {
  return <StripePaymentsCard senzaCornice />;
}
