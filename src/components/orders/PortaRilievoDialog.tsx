import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applicaMisure, getSurvey, type VoceMisure } from "@/lib/api/surveys";
import {
  componentiDelRilievo, misureInTesto, NOME_ASSE, proponiAbbinamenti,
  type ComponenteRilevato, type PropostaAbbinamento, type RigaMisure,
} from "@/lib/surveys/misureRilievo";
import { usePermissions } from "@/hooks/usePermissions";
import type { TemplateSchema } from "@/types/surveys";

/**
 * Dal rilievo alle righe della commessa. Il sistema propone, una persona conferma.
 * - riga simile: si collega;
 * - commessa senza articoli: anteprima delle righe da creare;
 * - riga già misurata da un altro sopralluogo: si vedono le differenze e si sceglie.
 */

const NUOVA = "__nuova__";
const SALTA = "__salta__";

interface Scelta {
  destinazione: string;
  nome: string;
  tieni: "tieni_nuovo" | "tieni_precedente";
}

const chiaveDi = (c: ComponenteRilevato) => `${c.elementoId}:${c.componente}`;

const BADGE: Record<PropostaAbbinamento["stato"], { testo: string; classe: string }> = {
  collegata: { testo: "Già collegata", classe: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  proposta: { testo: "Proposta", classe: "border-blue-300 bg-blue-50 text-blue-800" },
  secondo_rilievo: { testo: "Secondo rilievo", classe: "border-amber-300 bg-amber-50 text-amber-800" },
  nuova: { testo: "Da decidere", classe: "border-slate-300 bg-slate-50 text-slate-700" },
};

export function PortaRilievoDialog({ surveyId, orderId, onClose }: { surveyId: string; orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { canEditOrders } = usePermissions();

  const dati = useQuery({
    queryKey: ["porta-rilievo", surveyId, orderId],
    staleTime: 0,
    queryFn: async () => {
      const [dettaglio, righe] = await Promise.all([
        getSurvey(surveyId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("order_items")
          .select("id, name, riferimento, componente, quantity, unita_misura, measure_status, misure_preventivo, misure_rilevate, survey_id, survey_element_id, diviso_da, natura_riga")
          .eq("order_id", orderId)
          .eq("natura_riga", "materiale")
          .is("diviso_da", null)
          .order("position"),
      ]);
      if (righe.error) throw new Error("Righe della commessa non disponibili");
      return { dettaglio, righe: (righe.data ?? []) as RigaMisure[] };
    },
  });

  const proposte = useMemo(() => {
    if (!dati.data) return [];
    const { dettaglio, righe } = dati.data;
    const schema = ((dettaglio.survey as { template_schema_snapshot?: TemplateSchema | null }).template_schema_snapshot ?? dettaglio.template.schema) as TemplateSchema;
    const aree = new Map(dettaglio.areas.map((a) => [a.id, a.name]));
    const componenti = dettaglio.elements.flatMap((e) =>
      componentiDelRilievo({ ...e, area_name: aree.get(e.area_id) ?? null }, schema),
    );
    // Si propongono solo le righe su misura: un articolo normale si collega solo a mano.
    return proponiAbbinamenti(righe.filter((r) => r.measure_status != null), componenti, surveyId);
  }, [dati.data, surveyId]);

  const [scelte, setScelte] = useState<Record<string, Scelta>>({});
  const commessaVuota = (dati.data?.righe.length ?? 0) === 0;

  useEffect(() => {
    if (!dati.data) return;
    setScelte(Object.fromEntries(proposte.map((p) => [chiaveDi(p.componente), {
      destinazione: p.rigaId ?? (commessaVuota && canEditOrders ? NUOVA : SALTA),
      nome: p.componente.riferimento ? `${p.componente.etichetta} · ${p.componente.riferimento}` : p.componente.etichetta,
      // Di partenza non cambia niente: per sostituire una misura serve una scelta.
      tieni: "tieni_precedente" as const,
    }])));
  }, [proposte, dati.data, commessaVuota, canEditOrders]);

  const voci = proposte.flatMap((p): VoceMisure[] => {
    const c = p.componente;
    const s = scelte[chiaveDi(c)];
    if (!s || s.destinazione === SALTA) return [];
    const comuni = {
      survey_element_id: c.elementoId,
      componente: c.componente,
      misure: c.misure as Record<string, number>,
      misura_tipo: c.misuraTipo,
      misura_forma: c.forma,
      unita: c.unita,
    };
    if (s.destinazione === NUOVA) {
      return [{ ...comuni, crea: { name: s.nome.trim() || c.etichetta, quantity: c.misure.quantita ?? c.quantita, unita_misura: c.unita, riferimento: c.riferimento } }];
    }
    const riga = dati.data?.righe.find((r) => r.id === s.destinazione);
    const altro = !!riga?.survey_id && riga.survey_id !== surveyId && !!riga.misure_rilevate;
    return [{ ...comuni, order_item_id: s.destinazione, ...(altro ? { scelta: s.tieni } : {}) }];
  });

  const daCreare = voci.filter((v) => v.crea).length;
  const nomeVuoto = voci.some((v) => v.crea && !v.crea.name.trim());
  const destinazioni = voci.flatMap((v) => (v.order_item_id ? [v.order_item_id] : []));
  const doppia = new Set(destinazioni).size !== destinazioni.length;

  // isPending arriva dopo il render: il secondo clic di un doppio clic non lo vedrebbe.
  const inCorso = useRef(false);
  const applica = useMutation({
    mutationFn: () => applicaMisure(surveyId, voci),
    onSuccess: (esito) => {
      qc.invalidateQueries({ queryKey: ["order-measure-items", orderId] });
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      qc.invalidateQueries({ queryKey: ["sopralluogo-posizioni", surveyId] });
      const pezzi = [
        esito.create ? `${esito.create} righe create` : null,
        esito.applicate - esito.create > 0 ? `${esito.applicate - esito.create} aggiornate` : null,
        esito.tenute ? `${esito.tenute} tenute com'erano` : null,
      ].filter(Boolean);
      toast.success(pezzi.join(" · ") || "Nessuna modifica: era già tutto allineato");
      if (esito.con_ordine.length > 0) toast.warning("Alcune posizioni sono già in un ordine: controlla col fornitore.");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message || "Misure non portate in commessa"),
    onSettled: () => { inCorso.current = false; },
  });
  const applicaUnaVolta = () => {
    if (inCorso.current) return;
    inCorso.current = true;
    applica.mutate();
  };

  const aggiorna = (c: ComponenteRilevato, modifica: Partial<Scelta>) =>
    setScelte((s) => ({ ...s, [chiaveDi(c)]: { ...s[chiaveDi(c)], ...modifica } }));

  return (
    <Dialog open onOpenChange={(aperto) => !aperto && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-3 max-sm:p-4">
        <DialogHeader>
          <DialogTitle>Porta le misure in commessa</DialogTitle>
          <DialogDescription>
            {commessaVuota
              ? "La commessa non ha articoli: controlla le righe da creare."
              : "Controlla gli abbinamenti proposti prima di applicarli."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {dati.isLoading && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Leggo il rilievo…
            </p>
          )}
          {dati.isError && <p role="alert" className="py-6 text-sm text-red-600">Rilievo non disponibile.</p>}
          {dati.data && proposte.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">Questo sopralluogo non ha misure da portare sulle righe.</p>
          )}
          {proposte.map((p) => {
            const c = p.componente;
            const s = scelte[chiaveDi(c)];
            if (!s) return null;
            const badge = BADGE[p.stato];
            const riga = dati.data?.righe.find((r) => r.id === s.destinazione);
            const altro = !!riga?.survey_id && riga.survey_id !== surveyId && !!riga.misure_rilevate;
            const cambiate = p.differenze.filter((d) => d.delta);
            return (
              <div key={chiaveDi(c)} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{c.riferimento ? `${c.riferimento} · ${c.etichetta}` : c.etichetta}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{misureInTesto(c.misure, c.unita)}{c.quantita > 1 && !c.unita ? ` · ${c.quantita} pz` : ""}</p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${badge.classe}`} title={p.motivo}>{badge.testo}</Badge>
                </div>

                <label className="mt-2 block text-xs font-medium">
                  Riga della commessa
                  <select
                    className="mt-1 h-11 w-full rounded-md border bg-white px-2 text-sm font-normal"
                    value={s.destinazione}
                    onChange={(e) => aggiorna(c, { destinazione: e.target.value })}
                  >
                    <option value={SALTA}>Non collegare</option>
                    {canEditOrders && <option value={NUOVA}>Crea una riga nuova</option>}
                    {dati.data?.righe.map((r) => (
                      <option key={r.id} value={r.id}>{r.riferimento ? `${r.riferimento} · ` : ""}{r.name}</option>
                    ))}
                  </select>
                </label>

                {s.destinazione === NUOVA && (
                  <label className="mt-2 block text-xs font-medium">
                    Nome della riga
                    <Input className="mt-1 h-11 font-normal" value={s.nome} onChange={(e) => aggiorna(c, { nome: e.target.value })} />
                  </label>
                )}

                {altro && (
                  <fieldset className="mt-2 rounded-md bg-amber-50 p-2 text-xs">
                    <legend className="font-medium text-amber-900">
                      {cambiate.length
                        ? cambiate.map((d) => `${NOME_ASSE[d.asse]}: ${d.prima} → ${d.dopo}`).join(" · ")
                        : "Uguali al rilievo precedente"}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {([["tieni_nuovo", "Tieni le nuove"], ["tieni_precedente", "Tieni le precedenti"]] as const).map(([v, t]) => (
                        <label key={v} className="flex min-h-9 items-center gap-1.5">
                          <input type="radio" name={`tieni-${chiaveDi(c)}`} checked={s.tieni === v} onChange={() => aggiorna(c, { tieni: v })} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>

        {doppia && <p role="alert" className="text-xs text-red-600">Due misure puntano alla stessa riga: scegline una.</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={onClose}>Annulla</Button>
          <Button className="min-h-11" disabled={voci.length === 0 || doppia || nomeVuoto || applica.isPending} onClick={applicaUnaVolta}>
            {applica.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {daCreare > 0 ? `Crea ${daCreare} e applica` : `Applica ${voci.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
