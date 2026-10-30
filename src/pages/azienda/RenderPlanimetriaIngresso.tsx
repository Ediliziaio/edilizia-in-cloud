/**
 * Ingressi verso le altre fasi delle Planimetrie, finché non sono collegate:
 * - «Disegna» (`/nuova?da=disegno`): si dà un nome, si crea la pianta vuota e si va
 *   all'editor (fase 2) su `/:id/modifica`;
 * - «Carica PDF o foto» e «Descrivi a parole» (`/nuova?da=documento|testo`): la
 *   generazione con l'AI (fase 3, `planimetria-genera`);
 * - `/:id/modifica`: l'editor della fase 2.
 *
 * Chi unisce i rami sostituisce queste schermate con le pagine vere (vedi
 * src/lib/planimetrie/render/percorsi.ts). Qui si dice in chiaro cosa manca.
 */
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { useCreaPlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

const TITOLI: Record<ModoNuovaPianta, string> = {
  disegno: "Disegna una pianta",
  documento: "Pianta da un PDF o da una foto",
  testo: "Pianta da una descrizione",
};

function InArrivo({ testo }: { testo: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <Hammer className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Ci stiamo lavorando</p>
        <p className="max-w-md text-sm text-muted-foreground">{testo}</p>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to={percorsiPlanimetrie.elenco}>Torna alle piante</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function RenderPlanimetriaIngresso() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const crea = useCreaPlanimetria();
  const [titolo, setTitolo] = useState("");

  // /:id/modifica — l'editor.
  if (id) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-12">
        <TestataPlanimetrie indietro={percorsiPlanimetrie.pianta(id)} titolo="Modifica la pianta" />
        <InArrivo testo="Qui si aprirà il disegno della pianta: stanze, pareti, porte e finestre, con le misure scritte sulla parete." />
      </div>
    );
  }

  const modo = (["disegno", "documento", "testo"] as const).find((m) => m === params.get("da")) ?? "disegno";

  const creaEDisegna = async () => {
    if (!effectiveCompany?.id) return;
    try {
      const nuovo = await crea.mutateAsync({ companyId: effectiveCompany.id, titolo });
      navigate(percorsiPlanimetrie.modifica(nuovo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pianta non creata: riprova.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <TestataPlanimetrie indietro={percorsiPlanimetrie.elenco} titolo={TITOLI[modo]} />
      {modo === "disegno" ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="titolo-pianta">Come la chiamiamo?</Label>
              <Input
                id="titolo-pianta"
                value={titolo}
                maxLength={200}
                placeholder="Es. Appartamento Rossi, via Roma 12"
                onChange={(e) => setTitolo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && titolo.trim() && creaEDisegna()}
              />
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!titolo.trim() || crea.isPending} onClick={creaEDisegna}>
              {crea.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crea e disegna
            </Button>
          </CardContent>
        </Card>
      ) : (
        <InArrivo
          testo={
            modo === "documento"
              ? "Carichi la catastale, il disegno del tecnico o la foto di uno schizzo: l'AI ne ricava la pianta con le misure, e tu la controlli prima di salvarla."
              : "Scrivi com'è la casa («trilocale di 75 mq, bagno 2 × 2,5, cucina abitabile»): l'AI propone una pianta, con tutte le misure segnate come stimate."
          }
        />
      )}
    </div>
  );
}
