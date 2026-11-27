/**
 * «Crea preventivo» e «Crea computo» dal rilievo.
 * Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 4.
 *
 * Le righe nascono dalla mappatura del modello (`righeDalRilievo`); prima di creare il documento
 * si vedono, si tolgono, si correggono descrizione e quantità e, per il preventivo, si scrive il
 * prezzo. Il preventivo nasce in bozza come quello dalla planimetria; il computo come bozza
 * dell'editor nativo, diviso per ambienti.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Calculator, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateSurvey, type SurveyDetail } from "@/lib/api/surveys";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { salvaComputoCloud } from "@/lib/computo/cloudComputo";
import { percorsoComputoNativo } from "@/lib/computo/percorsiComputo";
import type { SurveyRow, TemplateSchema } from "@/types/surveys";
import {
  itemsPreventivoDalRilievo, righeDalRilievo, vociComputoDalRilievo, type RigaScelta,
} from "@/lib/surveys/righeDalRilievo";
import { messaggioErrore } from "@/lib/messaggioErrore";

type Modo = "preventivo" | "computo";
const ENERGIA = new Set(["fotovoltaico", "climatizzazione"]);
const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const numeroDa = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function DocumentoDalRilievo({ detail, disabled }: { detail: SurveyDetail; disabled?: boolean }) {
  const { canEditPreventivi, solaLettura } = usePermissions();
  const [modo, setModo] = useState<Modo | null>(null);
  const navigate = useNavigate();
  if (!canEditPreventivi || solaLettura || detail.survey.status === "cancelled" || !detail.elements.length) return null;
  // Per fotovoltaico e clima il preventivo passa dal wizard, che legge il rilievo meglio.
  const preventivoGenerico = !ENERGIA.has(detail.template.category);
  const preventivoCollegato = detail.survey.estimate_id;
  return (
    <>
      {preventivoCollegato && (
        <Button variant="ghost" className="min-h-10 gap-2 rounded-xl" onClick={() => navigate(`/azienda/marketing/preventivi/${preventivoCollegato}`)}>
          <FileText className="h-4 w-4" />Apri preventivo
        </Button>
      )}
      {preventivoGenerico && (
        <Button variant="outline" className="min-h-10 gap-2 rounded-xl" disabled={disabled} onClick={() => setModo("preventivo")}>
          <FileText className="h-4 w-4" />Crea preventivo
        </Button>
      )}
      <Button variant="outline" className="min-h-10 gap-2 rounded-xl" disabled={disabled} onClick={() => setModo("computo")}>
        <Calculator className="h-4 w-4" />Crea computo
      </Button>
      {modo && <DocumentoDalRilievoDialog detail={detail} modo={modo} onClose={() => setModo(null)} />}
    </>
  );
}

function DocumentoDalRilievoDialog({ detail, modo, onClose }: { detail: SurveyDetail; modo: Modo; onClose: () => void }) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const survey = detail.survey as SurveyRow & { template_schema_snapshot?: TemplateSchema | null };
  const codice = survey.code || "sopralluogo";
  const iniziali = useMemo(() => righeDalRilievo({
    schema: survey.template_schema_snapshot ?? detail.template.schema,
    ambienti: detail.areas,
    elementi: detail.elements,
  }).map((r): RigaScelta => ({ ...r, inclusa: true, prezzo: 0 })), [detail, survey.template_schema_snapshot]);
  const [righe, setRighe] = useState(iniziali);
  const [iva, setIva] = useState("10");
  const [inCorso, setInCorso] = useState(false);
  const cambia = (i: number, patch: Partial<RigaScelta>) => setRighe((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const incluse = righe.filter((r) => r.inclusa && r.quantita > 0);
  const daVerificare = incluse.filter((r) => r.daVerificare).length;
  const imponibile = incluse.reduce((t, r) => t + r.quantita * r.prezzo, 0);

  const crea = async () => {
    const companyId = effectiveCompany?.id;
    if (!companyId || !user?.id || !incluse.length) return;
    setInCorso(true);
    try {
      if (modo === "preventivo") {
        const items = itemsPreventivoDalRilievo(righe, codice, Number(iva));
        const { data: numero } = await supabase.rpc("generate_quote_number", { p_company_id: companyId });
        const sb = supabase as unknown as { from: (t: string) => { insert: (r: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } } } };
        const { data: q, error } = await sb.from("quotes").insert({
          company_id: companyId,
          quote_number: (numero as string | null) || `OFF-${new Date().getFullYear()}-001`,
          status: "bozza",
          title: `${detail.template.name} · ${codice}`,
          contact_id: survey.contact_id ?? null,
          opportunity_id: survey.opportunity_id ?? null,
          created_by: user.id,
        }).select("id").single();
        if (error || !q) throw new Error("Il preventivo non si è creato: controlla di poter creare preventivi.");
        const { error: errRighe } = await supabase.rpc("save_quote_items_atomic", { p_quote_id: q.id, p_company_id: companyId, p_items: items as never });
        if (errRighe) throw new Error("Le righe non si sono salvate: apri il preventivo e riprova.");
        // Il rilievo ricorda il suo preventivo (prima `estimate_id` non lo scriveva nessuno).
        if (!survey.estimate_id) await updateSurvey(survey.id, { estimate_id: q.id }).catch((): void => undefined);
        queryClient.invalidateQueries({ queryKey: ["quotes"] });
        queryClient.invalidateQueries({ queryKey: ["sopralluogo", survey.id] });
        toast.success("Preventivo creato dal rilievo", { description: `${items.length} righe${imponibile ? `, ${euro(imponibile)} + IVA` : ""}.` });
        onClose();
        navigate(`/azienda/marketing/preventivi/${q.id}`);
      } else {
        const indirizzo = [survey.address, survey.address_number].filter(Boolean).join(" ");
        const bozza = {
          ...bozzaVuota(),
          titolo: `Computo · ${detail.template.name}`.slice(0, 160),
          oggetto: `Dal sopralluogo ${codice}`,
          indirizzo: [indirizzo, survey.city].filter(Boolean).join(", ").slice(0, 300),
          cantiere_indirizzo: indirizzo.slice(0, 200),
          cantiere_citta: (survey.city ?? "").slice(0, 120),
          cantiere_cap: (survey.zip ?? "").slice(0, 10),
          cantiere_provincia: (survey.province ?? "").slice(0, 10),
          clienteId: survey.contact_id ?? "",
          opportunitaId: survey.opportunity_id ?? "",
          voci: vociComputoDalRilievo(righe, codice).map((v) => ({ ...voceVuota(), ...v })),
        };
        const id = crypto.randomUUID();
        await salvaComputoCloud(companyId, id, `sopralluogo-${survey.id}`, bozza, 0);
        toast.success("Computo creato dal rilievo", { description: `${bozza.voci.length} voci da prezzare, divise per ambiente.` });
        onClose();
        navigate(percorsoComputoNativo(id));
      }
    } catch (e) {
      toast.error(modo === "preventivo" ? "Preventivo non creato" : "Computo non creato", { description: messaggioErrore(e) });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !inCorso) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-3 max-sm:p-4">
        <DialogHeader>
          <DialogTitle>{modo === "preventivo" ? "Preventivo dal rilievo" : "Computo dal rilievo"} {codice}</DialogTitle>
          <DialogDescription>
            {modo === "preventivo"
              ? "Una riga per elemento rilevato. Controlla descrizioni e quantità e scrivi i prezzi: il preventivo nasce in bozza."
              : "Una voce per elemento, con l'ambiente come capitolo. I prezzi li metti nel computo, anche dal prezzario."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* Righe e non tabella: sul telefono quantità e prezzo vanno sotto la descrizione. */}
          <ul className="divide-y text-sm" aria-label="Righe dal rilievo">
            {righe.map((r, i) => (
              <li key={r.elementoId} className={`grid grid-cols-[1.5rem_1fr] gap-x-2 gap-y-1.5 py-2 sm:items-end ${modo === "preventivo" ? "sm:grid-cols-[1.5rem_1fr_7.5rem_7rem]" : "sm:grid-cols-[1.5rem_1fr_7.5rem]"} ${r.inclusa ? "" : "opacity-50"}`}>
                <input type="checkbox" className="mt-2.5 h-4 w-4 self-start accent-orange-600 sm:self-end sm:mb-3" aria-label={`Includi ${r.descrizione}`}
                  checked={r.inclusa} onChange={(e) => cambia(i, { inclusa: e.target.checked })} />
                <div className="min-w-0">
                  {r.ambiente && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r.ambiente}</p>}
                  <Input className="h-9" aria-label={`Descrizione riga ${i + 1}`} value={r.descrizione} maxLength={250}
                    onChange={(e) => cambia(i, { descrizione: e.target.value })} />
                </div>
                <div className="col-start-2 flex gap-2 sm:contents">
                  <div className="w-32 sm:w-auto">
                    <div className="flex items-center gap-1">
                      <Input className="h-9 tabular-nums" inputMode="decimal" aria-label={`Quantità riga ${i + 1}`}
                        defaultValue={String(r.quantita).replace(".", ",")}
                        onChange={(e) => cambia(i, { quantita: numeroDa(e.target.value), daVerificare: false })} />
                      <span className="w-6 text-xs text-muted-foreground">{r.unita}</span>
                    </div>
                    {r.daVerificare && <p className="mt-0.5 text-[11px] text-amber-700">Misura non trovata</p>}
                  </div>
                  {modo === "preventivo" && (
                    <Input className="h-9 w-28 tabular-nums sm:w-auto" inputMode="decimal" aria-label={`Prezzo riga ${i + 1}`} placeholder="Prezzo €"
                      onChange={(e) => cambia(i, { prezzo: numeroDa(e.target.value) })} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {daVerificare > 0 && (
          <p role="status" className="text-xs text-amber-800">
            {daVerificare === 1 ? "Una riga ha" : `${daVerificare} righe hanno`} la quantità a 1 perché nel rilievo manca la misura: controllala.
          </p>
        )}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {modo === "preventivo" && (
              <>
                <span className="text-muted-foreground">IVA</span>
                <Select value={iva} onValueChange={setIva}>
                  <SelectTrigger className="h-9 w-24" aria-label="IVA"><SelectValue /></SelectTrigger>
                  <SelectContent>{["4", "10", "22"].map((v) => <SelectItem key={v} value={v}>{v}%</SelectItem>)}</SelectContent>
                </Select>
                <span className="tabular-nums">{euro(imponibile)} + IVA</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={inCorso}>Annulla</Button>
            <Button onClick={crea} disabled={inCorso || !incluse.length} className="bg-orange-600 hover:bg-orange-700">
              {inCorso && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {modo === "preventivo" ? `Crea preventivo (${incluse.length})` : `Crea computo (${incluse.length})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
