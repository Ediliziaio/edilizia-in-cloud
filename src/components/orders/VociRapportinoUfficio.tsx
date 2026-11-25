import { UniformSelect } from "@/components/ui/uniform-select";
// Voci libere nel modulo dell'ufficio: si salvano insieme al rapportino. Solo per chi vede i costi.
// Dal 14/11/2026 si cercano nel listino generale, col prezzo della regola (cantiere → committente → generale).
// Dal 24/11/2026 una voce di trasporto del catalogo (es. «TRASPORTI») apre i campi del viaggio, e «Aggiungi viaggio» la usa coi suoi prezzi.
import type { ReactElement } from "react";
import { Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { Input } from "@/components/ui/input";
import { useCatalogoVociRapportino } from "@/hooks/useCatalogoVociRapportino";
import { avvisoUnita, CercaNelListino, COLORE_FONTE } from "@/components/orders/CercaNelListino";
import { etichettaPrezzo, type FontePrezzo } from "@/lib/campo/prezzoVoceRapportino";
import { voceViaggioNuova, type VoceUfficio } from "@/lib/campo/rapportiniUfficio";
import { unitaChilometro, voceTrasporto } from "@/lib/campo/viaggiRapportino";
import { CampiViaggioRapportino } from "./CampiViaggioRapportino";

const nuovaChiave = (): string => crypto.randomUUID();
const CAMPO = "h-8 px-1.5 text-[13px]";

export function VociRapportinoUfficio({ companyId, orderId, giorno, voci, onCambia }: {
  companyId: string | undefined; orderId?: string; giorno?: string; voci: VoceUfficio[]; onCambia: (v: VoceUfficio[]) => void;
}): ReactElement | null {
  const t = useT();
  const { data: catalogo } = useCatalogoVociRapportino(companyId, true);
  const pronte = Array.isArray(catalogo?.voci) ? catalogo!.voci : [];
  const aMano = catalogo?.aMano ?? true;
  if (!pronte.length && !aMano && !voci.length && !orderId) return null;
  const testo = (n: number | null | undefined): string => (n == null ? "" : String(n).replace(".", ","));
  const cambia = (chiave: string, patch: Partial<VoceUfficio>): void => onCambia(voci.map((v) => (v.chiave === chiave ? { ...v, ...patch } : v)));
  return (
    <div className="space-y-1.5">
      {voci.map((v, i) => (
        <div key={v.chiave} className="grid grid-cols-6 items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_3.5rem_4rem_5rem_5rem_2rem]">
          <Input aria-label={t("Voce {n}", { n: i + 1 })} placeholder={t("Voce (es. trasporto, nolo)")} readOnly={!aMano} className={`col-span-5 sm:col-span-1 ${CAMPO}`} value={v.descrizione} onChange={(e) => cambia(v.chiave, { descrizione: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" className="col-start-6 h-8 w-8 sm:order-last" aria-label={t("Togli la voce {n}", { n: i + 1 })} onClick={() => onCambia(voci.filter((x) => x.chiave !== v.chiave))}><X className="h-3.5 w-3.5" /></Button>
          <Input aria-label={unitaChilometro(v.unita) ? t("Km percorsi voce {n}", { n: i + 1 }) : t("Quantità voce {n}", { n: i + 1 })} inputMode="decimal" placeholder={unitaChilometro(v.unita) ? t("Km") : t("Q.tà")} className={`col-span-1 ${CAMPO}`} value={v.quantita} onChange={(e) => cambia(v.chiave, { quantita: e.target.value })} />
          <Input aria-label={t("Unità voce {n}", { n: i + 1 })} placeholder={t("Unità")} className={`col-span-1 ${CAMPO}`} value={v.unita} onChange={(e) => cambia(v.chiave, { unita: e.target.value })} />
          <Input aria-label={t("Costo voce {n}", { n: i + 1 })} inputMode="decimal" placeholder={t("Costo €")} className={`col-span-2 sm:col-span-1 ${CAMPO}`} value={v.costo} onChange={(e) => cambia(v.chiave, { costo: e.target.value })} />
          <Input aria-label={t("Vendita voce {n}", { n: i + 1 })} inputMode="decimal" placeholder={v.fonte === "mancante" ? t("Da definire") : t("Vendita €")} className={`col-span-2 sm:col-span-1 ${CAMPO}`} value={v.vendita} onChange={(e) => cambia(v.chiave, { vendita: e.target.value })} />
          {(v.viaggio || voceTrasporto(v.descrizione, v.unita)) && (
            <div className="col-span-full">
              <CampiViaggioRapportino valore={v.viaggio ?? {}} quantitaInKm={unitaChilometro(v.unita)} orderId={orderId} onChange={(viaggio) => cambia(v.chiave, { viaggio })} />
            </div>
          )}
          {v.fonte && (
            <p className={`col-span-6 text-[11px] sm:col-span-6 ${COLORE_FONTE[v.fonte as FontePrezzo] ?? ""}`}>
              {v.codice ? `${v.codice} · ` : ""}{etichettaPrezzo(v.fonte as FontePrezzo)}
              {v.proposta != null && v.vendita.trim() && Number(v.vendita.replace(",", ".")) !== Number(v.proposta) ? ` · ${t("modificato a mano (listino {prezzo} €)", { prezzo: testo(v.proposta) })}` : ""}
              {v.avviso ? ` · ${v.avviso}` : ""}
            </p>
          )}
        </div>
      ))}
      {orderId && (
        <CercaNelListino dove={{ orderId, data: giorno ?? null }} onScegli={(m) => onCambia([...voci, {
          chiave: nuovaChiave(), descrizione: m.descrizione, quantita: unitaChilometro(m.unita) ? "" : "1", unita: m.unita, costo: testo(m.costo_unitario), vendita: testo(m.prezzo),
          tariffa_id: m.tariffa_id, codice: m.codice, fonte: m.fonte, proposta: m.prezzo ?? null, avviso: avvisoUnita(m),
          ...(voceTrasporto(m.categoria ?? "", m.unita) ? { viaggio: {} } : {}),
        }])} />
      )}
      <div className="flex flex-wrap gap-1.5">
        {pronte.length > 0 && (
          <UniformSelect aria-label={t("Aggiungi una voce")} className="h-8 rounded-md border bg-background px-2 text-[13px]" value=""
            onChange={(e) => {
              const m = pronte.find((x) => x.id === e.target.value);
              if (m) onCambia([...voci, { chiave: nuovaChiave(), descrizione: m.nome, quantita: unitaChilometro(m.unita) ? "" : "1", unita: m.unita, costo: testo(m.costo_unitario), vendita: testo(m.vendita_unitaria), ...(voceTrasporto(m.nome, m.unita) ? { viaggio: {} } : {}) }]);
            }}>
            <option value="">{t("Aggiungi una voce")}</option>
            {pronte.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </UniformSelect>
        )}
        {aMano && <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onCambia([...voci, { chiave: nuovaChiave(), descrizione: "", quantita: "1", unita: "cad", costo: "", vendita: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />{t("Scrivi una voce")}</Button>}
        {(aMano || pronte.some((m) => voceTrasporto(m.nome, m.unita))) && <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onCambia([...voci, voceViaggioNuova(nuovaChiave(), pronte)])}><Truck className="mr-1 h-3.5 w-3.5" />{t("Aggiungi viaggio")}</Button>}
      </div>
    </div>
  );
}
