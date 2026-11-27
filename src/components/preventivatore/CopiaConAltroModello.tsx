import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * «Copia con un altro modello» — dal preventivo aperto: si sceglie un altro modello (per esempio da «Ristrutturazione
 * completa» ad «A computo») e si ottiene un nuovo preventivo con gli stessi dati, cliente e computo compresi. Il
 * preventivo di partenza non cambia. Un preventivo non cambia modello strada facendo: il PDF mandato al cliente deve
 * restare quello.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CopyPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { MODULI_VENDITA } from "@/lib/moduli-vendita/config";
import { copiaConAltroModello } from "@/lib/moduli/copiaConAltroModello";
import type { ModuloConModelli } from "@/lib/moduli/modelloPreventivo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
  modulo: ModuloConModelli;
  progetto: { id: string; company_id: string } | null | undefined;
  /** Il modello con cui il preventivo è stato fatto, se ne ha uno. */
  snapshot: { modelId: string } | null | undefined;
  costruisci: (companyId: string, model: { id: string }) => Promise<unknown>;
}

export function CopiaConAltroModello({ modulo, progetto, snapshot, costruisci }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const gruppi = useMemo(
    () => SALES_AREAS.filter((a) => a.sourceModule === modulo)
      .map((a) => ({ area: a.title, interventi: a.interventions.filter((i) => i.id !== snapshot?.modelId) }))
      .filter((g) => g.interventi.length > 0),
    [modulo, snapshot?.modelId],
  );
  if (!progetto) return null;

  const copia = async () => {
    if (!scelto || inCorso) return;
    setInCorso(true);
    try {
      const creata = await copiaConAltroModello({ modulo, sourceId: progetto.id, companyId: progetto.company_id, nuovoModelId: scelto, costruisci });
      const href = MODULI_VENDITA.find((m) => m.slug === modulo)?.href ?? `/azienda/${modulo}`;
      toast.success(t("Creato il preventivo {codice}", { codice: creata.code }), { description: t("Stessi dati e stesso computo, con il nuovo modello. Il preventivo di partenza non è cambiato.") });
      setAperto(false);
      navigate(`${href}/${creata.id}/modifica`);
    } catch (e) {
      toast.error(t("Copia non riuscita"), { description: messaggioErrore(e) });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!inCorso) setAperto(o); }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("Copia con un altro modello")}
          title={t("Copia con un altro modello")}
          className="shrink-0 gap-1.5 max-xl:w-10 max-xl:px-0"
        >
          <CopyPlus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t("Copia con modello")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Copia con un altro modello")}</DialogTitle>
          <DialogDescription>
            {t("Un preventivo non cambia modello: il PDF già visto dal cliente deve restare quello. Qui ne crei uno nuovo con lo stesso cliente, cantiere, immobile, computo e condizioni, e il modello che scegli. Si copia quello che è salvato (le foto del progetto no); il preventivo di partenza resta com'è.")}
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm font-medium" htmlFor="altro-modello">{t("Nuovo modello")}</label>
        <UniformSelect
          id="altro-modello"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={scelto}
          onChange={(e) => setScelto(e.target.value)}
        >
          <option value="">{t("Scegli il modello…")}</option>
          {gruppi.map((g) => (
            <optgroup key={g.area} label={g.area}>
              {g.interventi.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </optgroup>
          ))}
        </UniformSelect>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAperto(false)} disabled={inCorso}>{t("Annulla")}</Button>
          <Button onClick={() => void copia()} disabled={!scelto || inCorso}>
            {inCorso ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{t("Copio…")}</> : t("Crea la copia")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
