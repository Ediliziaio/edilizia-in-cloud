// Voci libere nel modulo dell'ufficio: si salvano insieme al rapportino. Solo per chi vede i costi.
import type { ReactElement } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogoVociRapportino } from "@/hooks/useCatalogoVociRapportino";
import type { VoceUfficio } from "@/lib/campo/rapportiniUfficio";

const nuovaChiave = (): string => crypto.randomUUID();
const CAMPO = "h-8 px-1.5 text-[13px]";

export function VociRapportinoUfficio({ companyId, voci, onCambia }: { companyId: string | undefined; voci: VoceUfficio[]; onCambia: (v: VoceUfficio[]) => void }): ReactElement | null {
  const { data: catalogo } = useCatalogoVociRapportino(companyId, true);
  const pronte = Array.isArray(catalogo?.voci) ? catalogo!.voci : [];
  const aMano = catalogo?.aMano ?? true;
  if (!pronte.length && !aMano && !voci.length) return null;
  const cambia = (chiave: string, patch: Partial<VoceUfficio>): void => onCambia(voci.map((v) => (v.chiave === chiave ? { ...v, ...patch } : v)));
  return (
    <div className="space-y-1.5">
      {voci.map((v, i) => (
        <div key={v.chiave} className="grid grid-cols-6 items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_3.5rem_4rem_5rem_5rem_2rem]">
          <Input aria-label={`Voce ${i + 1}`} placeholder="Voce (es. trasporto, nolo)" readOnly={!aMano} className={`col-span-5 sm:col-span-1 ${CAMPO}`} value={v.descrizione} onChange={(e) => cambia(v.chiave, { descrizione: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" className="col-start-6 h-8 w-8 sm:order-last" aria-label={`Togli la voce ${i + 1}`} onClick={() => onCambia(voci.filter((x) => x.chiave !== v.chiave))}><X className="h-3.5 w-3.5" /></Button>
          <Input aria-label={`Quantità voce ${i + 1}`} inputMode="decimal" placeholder="Q.tà" className={`col-span-1 ${CAMPO}`} value={v.quantita} onChange={(e) => cambia(v.chiave, { quantita: e.target.value })} />
          <Input aria-label={`Unità voce ${i + 1}`} placeholder="Unità" className={`col-span-1 ${CAMPO}`} value={v.unita} onChange={(e) => cambia(v.chiave, { unita: e.target.value })} />
          <Input aria-label={`Costo voce ${i + 1}`} inputMode="decimal" placeholder="Costo €" className={`col-span-2 sm:col-span-1 ${CAMPO}`} value={v.costo} onChange={(e) => cambia(v.chiave, { costo: e.target.value })} />
          <Input aria-label={`Vendita voce ${i + 1}`} inputMode="decimal" placeholder="Vendita €" className={`col-span-2 sm:col-span-1 ${CAMPO}`} value={v.vendita} onChange={(e) => cambia(v.chiave, { vendita: e.target.value })} />
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {pronte.length > 0 && (
          <select aria-label="Aggiungi una voce" className="h-8 rounded-md border bg-background px-2 text-[13px]" value=""
            onChange={(e) => {
              const m = pronte.find((x) => x.id === e.target.value);
              if (m) onCambia([...voci, { chiave: nuovaChiave(), descrizione: m.nome, quantita: "1", unita: m.unita, costo: m.costo_unitario != null ? String(m.costo_unitario).replace(".", ",") : "", vendita: m.vendita_unitaria != null ? String(m.vendita_unitaria).replace(".", ",") : "" }]);
            }}>
            <option value="">Aggiungi una voce</option>
            {pronte.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        {aMano && <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onCambia([...voci, { chiave: nuovaChiave(), descrizione: "", quantita: "1", unita: "cad", costo: "", vendita: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Scrivi una voce</Button>}
      </div>
    </div>
  );
}
