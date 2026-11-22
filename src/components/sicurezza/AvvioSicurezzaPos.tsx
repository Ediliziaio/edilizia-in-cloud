import { useId, useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useAvvioSicurezza, useSalvaAvvioSicurezza, type AvvioSicurezza, type StatoAvvioPsc } from "@/hooks/useAvvioSicurezza";
import { usePscCommessa } from "@/hooks/usePscCommessa";
import { RiferimentoPscPos } from "./pos/RiferimentoPscPos";
import { stessoRiferimentoPsc, stessaFontePsc, type RiferimentoPsc } from "../../../supabase/functions/_shared/posPsc";

const STATI: Record<StatoAvvioPsc, string> = {
  da_valutare: "Da valutare",
  previsto: "Previsto per il cantiere",
  non_previsto: "Non previsto per il cantiere",
};

interface Props {
  companyId: string;
  orderId: string;
  solaLettura: boolean;
  usaNelPos?: (riferimento: RiferimentoPsc | null) => void;
  vaiAllaLettura?: () => void;
  idImpostazioni?: string;
}

export function AvvioSicurezzaPos(props: Props) {
  const q = useAvvioSicurezza(props.companyId, props.orderId);
  const [aperto, setAperto] = useState(false);
  const decisione = q.data;
  const originale = decisione?.psc;
  const fonti = usePscCommessa(props.companyId, originale ? props.orderId : "");
  const originaleDisponibile = !!originale && !!fonti.data?.some((f) => stessaFontePsc(originale, f));
  const stato = decisione?.stato ?? "da_valutare";
  const pronto = stato === "non_previsto" || (stato === "previsto" && originaleDisponibile);
  return (
    <section className="rounded-xl border bg-card" aria-label="Avvio sicurezza">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-primary" aria-hidden /> Avvio sicurezza</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q.isError ? "Decisione PSC non disponibile" : q.isLoading ? "Carico il PSC di riferimento…" :
              stato === "previsto" ? originaleDisponibile ? `PSC di riferimento · rev. ${originale.revisione} · ${originale.titolo}`
                : originale ? (fonti.isLoading ? "Verifico la fonte del PSC…" : "PSC di riferimento da riesaminare") : "PSC previsto · originale da collegare"
                : stato === "non_previsto" ? "PSC non previsto · motivazione registrata" : "Applicabilità del PSC da confermare"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.isError ? <Button id={props.idImpostazioni} size="sm" variant="outline" onClick={() => void q.refetch()}>Riprova</Button> : !q.isLoading && <>
            {pronto && originale && props.vaiAllaLettura && <Button type="button" size="sm" variant="outline" onClick={props.vaiAllaLettura}>Leggi o scansiona PSC</Button>}
            {!props.vaiAllaLettura && pronto && props.usaNelPos && !props.solaLettura && <Button size="sm" variant="outline" onClick={() => props.usaNelPos?.(decisione?.psc ?? null)}>Allinea questa bozza</Button>}
            <Button id={props.idImpostazioni} size="sm" variant="ghost" aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
              {aperto ? "Chiudi" : "Impostazioni PSC"} <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          </>}
        </div>
      </div>
      {aperto && !q.isError && !q.isLoading && <ImpostazioniPsc key={`${props.orderId}:${decisione?.updated_at ?? "nuovo"}`} {...props} iniziale={decisione ?? null} />}
    </section>
  );
}

function ImpostazioniPsc({ companyId, orderId, solaLettura, iniziale, usaNelPos }: Props & { iniziale: AvvioSicurezza | null }) {
  const formId = useId();
  const [stato, setStato] = useState<StatoAvvioPsc>(iniziale?.stato ?? "da_valutare");
  const [motivazione, setMotivazione] = useState(iniziale?.motivazione ?? "");
  const [psc, setPsc] = useState<RiferimentoPsc | undefined>(iniziale?.psc ?? undefined);
  const salva = useSalvaAvvioSicurezza(companyId, orderId);
  const pscScelto = stato === "previsto" ? psc ?? null : null;
  const disabilitato = solaLettura || salva.isPending;
  const modificato = stato !== (iniziale?.stato ?? "da_valutare") || motivazione.trim() !== (iniziale?.motivazione ?? "") ||
    !stessoRiferimentoPsc(pscScelto, iniziale?.psc);
  return (
    <div className="space-y-3 border-t px-4 py-3">
      <p className="text-sm text-muted-foreground">Valuta quante imprese eseguono lavori, anche in periodi diversi. La decisione si riferisce a questo cantiere.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`applicabilita-psc-${formId}`}>Applicabilità PSC</Label>
          <UniformSelect className="w-full rounded-md border bg-background p-2 text-sm" id={`applicabilita-psc-${formId}`}
            disabled={disabilitato} value={stato} onChange={(e) => setStato(e.target.value as StatoAvvioPsc)}>
            {Object.entries(STATI).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </UniformSelect>
        </div>
        {(stato === "non_previsto" || motivazione) && <div className="space-y-1">
          <Label htmlFor={`motivazione-psc-${formId}`}>Motivazione</Label>
          <Textarea id={`motivazione-psc-${formId}`} rows={2} value={motivazione} maxLength={2000} readOnly={disabilitato} onChange={(e) => setMotivazione(e.target.value)} />
        </div>}
      </div>
      {stato === "previsto" && <RiferimentoPscPos companyId={companyId} orderId={orderId} valore={psc} ro={disabilitato} onChange={setPsc} ambitoCommessa />}
      {salva.error && <p role="alert" className="text-sm text-destructive">{salva.error.message}</p>}
      {!solaLettura && <Button type="button" size="sm" disabled={!modificato || disabilitato || (stato === "non_previsto" && !motivazione.trim())}
        onClick={() => salva.mutate({ attesa: iniziale?.updated_at ?? null, stato, motivazione, psc: pscScelto }, {
          onSuccess: (d) => { if (d.stato === "non_previsto" || d.psc) usaNelPos?.(d.psc); },
        })}>
        {salva.isPending ? "Salvo…" : "Salva decisione PSC"}
      </Button>}
    </div>
  );
}
