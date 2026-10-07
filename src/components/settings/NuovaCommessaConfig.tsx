// src/components/settings/NuovaCommessaConfig.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { CONTROLLI_AVVIO, CONTROLLI_DI_PARTENZA, type ControlloAvvio } from "@/lib/orders/nuovaCommessa";

const NESSUNO = "__nessuno__";

/** «Quando apri una commessa»: le fasi di partenza e cosa controllare. Tutto facoltativo. */
export default function NuovaCommessaConfig({ puoModificare }: { puoModificare: boolean }) {
  const { modelli } = useModelliFasi();
  const { modelloFasi, controlli, salva } = useImpostazioniAvvio();
  // Solo i modelli già dell'azienda si possono scegliere: quelli di partenza lo diventano la prima volta che si apre questa pagina.
  const propri = modelli.filter((m) => m.origine === "azienda");

  const cambiaControllo = (chiave: ControlloAvvio, attivo: boolean) => {
    const scelti = new Set(attivo ? [...controlli, chiave] : controlli.filter((c) => c !== chiave));
    salva.mutate({ controlli: CONTROLLI_DI_PARTENZA.filter((c) => scelti.has(c)) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quando apri una commessa</CardTitle>
        <CardDescription>
          Due scelte, entrambe facoltative: con quali fasi parte una commessa nuova, e cosa deve ricordarti il riquadro «Cantiere da organizzare».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="fasi-di-partenza" className="text-sm font-medium">Fasi di partenza</Label>
          <Select
            value={modelloFasi ?? NESSUNO}
            onValueChange={(v) => salva.mutate({ modelloFasi: v === NESSUNO ? null : v })}
            disabled={!puoModificare}
          >
            <SelectTrigger id="fasi-di-partenza" className="max-w-sm" aria-label="Fasi di partenza">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NESSUNO}>Nessuna: le scelgo io, commessa per commessa</SelectItem>
              {propri.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Una commessa che nasce senza fasi le riceve da questo modello (si può cambiare o togliere nel modulo di nuova commessa). Le commesse che hai già non cambiano.
          </p>
        </div>

        <fieldset className="space-y-2" disabled={!puoModificare}>
          <legend className="text-sm font-medium">Cosa ti ricorda «Cantiere da organizzare»</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTROLLI_AVVIO.map((c) => (
              <div key={c.chiave} className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id={`controllo-${c.chiave}`}
                  checked={controlli.includes(c.chiave)}
                  onCheckedChange={(v) => cambiaControllo(c.chiave, v === true)}
                  disabled={!puoModificare}
                />
                <Label htmlFor={`controllo-${c.chiave}`} className="cursor-pointer text-sm font-normal">{c.etichetta}</Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Il riquadro compare nella panoramica di una commessa solo se manca qualcosa di quello che spunti qui. Togli quello che non usi.
          </p>
        </fieldset>
      </CardContent>
    </Card>
  );
}
