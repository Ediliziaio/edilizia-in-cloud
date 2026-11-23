/**
 * Protocollo interno delle fatture ricevute (23/11/2026): 1, 2, 3… per anno, in ordine di
 * arrivo. È il registro protocolli IVA acquisti (iva_protocolli), non una numerazione a parte:
 * lo stesso numero compare nel Registro IVA. Il primo protocollo crea da solo il sezionale
 * «A · Registro acquisti». Lo vede chi legge la contabilità, lo scrive chi la può scrivere.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { chiaveProtocolloIva, useRegistriIva, type ProtocolloIva } from "@/hooks/useRegistriIva";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const errore = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);

export function useProtocolliRicevute(companyId: string | null | undefined) {
  const registri = useRegistriIva(companyId);
  const lettura = useQuery({
    queryKey: ["iva-permesso-lettura", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_puo_leggere" as never, { p_company: companyId } as never);
      if (error) throw error;
      return data === true;
    },
  });
  const sezionaliAcquisti = (registri.sezionali.data ?? []).filter(s => s.lato === "acquisti");
  return {
    registri,
    /** La colonna si mostra solo a chi può leggere il registro. */
    visibile: lettura.data === true,
    puoScrivere: registri.puoScrivere,
    di: (fatturaId: string): ProtocolloIva | undefined => registri.perDocumento.get(chiaveProtocolloIva("acquisti", fatturaId)),
    /** Con un solo registro acquisti il codice non serve: basta «12/2026». */
    etichetta: (p: ProtocolloIva) => {
      const codice = sezionaliAcquisti.length > 1 ? registri.perSezionale.get(p.sezionale_id)?.codice : null;
      return `${codice ? `${codice} · ` : ""}${p.numero}/${p.anno}`;
    },
    prossimo: (anno: number) => 1 + Math.max(0, ...(registri.protocolli.data ?? [])
      .filter(p => p.lato === "acquisti" && p.anno === anno && (sezionaliAcquisti.length <= 1 || registri.perSezionale.get(p.sezionale_id)?.codice === "A"))
      .map(p => p.numero)),
  };
}
export type ProtocolliRicevute = ReturnType<typeof useProtocolliRicevute>;

interface FatturaPerProtocollo { id: string; numero_fattura: string; cedente_ragione_sociale: string; data_fattura: string | null; data_ricezione_sdi: string | null; stato: string }

const giornoArrivo = (f: FatturaPerProtocollo) => (f.data_ricezione_sdi ?? f.data_fattura ?? new Date().toISOString()).slice(0, 10);

export function CellaProtocolloRicevuta({ fattura, protocolli }: { fattura: FatturaPerProtocollo; protocolli: ProtocolliRicevute }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const p = protocolli.di(fattura.id);
  const anno = Number((data || p?.data_registrazione || giornoArrivo(fattura)).slice(0, 4));
  const salva = useMutation({
    mutationFn: async () => {
      const { data: esito, error } = await supabase.rpc("fattura_ricevuta_protocolla" as never, {
        p_fattura: fattura.id, p_numero: numero ? Number(numero) : null, p_data: data || null, p_motivo: motivo.trim() || null,
      } as never);
      if (error) throw error;
      return esito as unknown as { numero: number; anno: number };
    },
    onSuccess: async r => { await protocolli.registri.ricarica(); setAperto(false); toast.success(t("Protocollo {numero}/{anno}", { numero: String(r.numero ?? ""), anno: String(r.anno ?? "") })); },
    onError: e => toast.error(t("Protocollo non assegnato"), { description: errore(e), duration: 10000 }),
  });
  if (fattura.stato === "rifiutata") return <span className="text-xs text-muted-foreground">—</span>;
  if (!p && !protocolli.puoScrivere) return <span className="text-xs text-muted-foreground">—</span>;
  const numeroValido = !numero || (Number.isInteger(Number(numero)) && Number(numero) > 0);
  const cambia = !!p && ((!!numero && Number(numero) !== p.numero) || (!!data && data !== p.data_registrazione));
  return <>
    <button type="button" onClick={() => { setNumero(""); setMotivo(""); setData(""); setAperto(true); }}
      className={p ? "whitespace-nowrap font-mono text-sm tabular-nums underline-offset-2 hover:underline" : "whitespace-nowrap text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"}
      title={p ? t("Protocollo interno, registrato il {data}", { data: p.data_registrazione.split("-").reverse().join("/") }) : t("Assegna il protocollo interno")}>
      {p ? protocolli.etichetta(p) : t("Assegna")}
    </button>
    <Dialog open={aperto} onOpenChange={v => { if (!salva.isPending) setAperto(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{p ? t("Protocollo {numero}", { numero: String(protocolli.etichetta(p) ?? "") }) : t("Protocollo interno")}</DialogTitle>
          <DialogDescription>{t("{fornitore} · fattura n. {numero}. La numerazione riparte da 1 ogni anno ed è la stessa del Registro IVA acquisti.", { fornitore: String(fattura.cedente_ragione_sociale ?? ""), numero: String(fattura.numero_fattura ?? "") })}</DialogDescription>
        </DialogHeader>
        {protocolli.puoScrivere ? <fieldset disabled={salva.isPending} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`prot-numero-${fattura.id}`}>{t("Numero")}</Label>
              <Input id={`prot-numero-${fattura.id}`} type="number" min="1" step="1" inputMode="numeric" value={numero}
                placeholder={p ? String(p.numero) : t("{numero} (il prossimo)", { numero: String(protocolli.prossimo(anno) ?? "") })} onChange={e => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`prot-data-${fattura.id}`}>{t("Registrata il")}</Label>
              <Input id={`prot-data-${fattura.id}`} type="date" value={data || p?.data_registrazione || giornoArrivo(fattura)} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          {cambia && <div className="space-y-1">
            <Label htmlFor={`prot-motivo-${fattura.id}`}>{t("Perché lo cambi")}</Label>
            <Input id={`prot-motivo-${fattura.id}`} value={motivo} placeholder={t("Es. numero sbagliato")} onChange={e => setMotivo(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("Il numero vecchio resta nello storico e torna libero.")}</p>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)}>{t("Chiudi")}</Button>
            {(!p || cambia) && <Button disabled={!numeroValido || (cambia && !motivo.trim())} onClick={() => salva.mutate()}>
              {salva.isPending ? t("Salvo…") : p ? t("Cambia protocollo") : numero ? t("Assegna {numero}", { numero: String(numero ?? "") }) : t("Assegna il prossimo")}
            </Button>}
          </DialogFooter>
        </fieldset> : <p className="text-sm text-muted-foreground">{t("Registrata il {data}.", { data: p?.data_registrazione.split("-").reverse().join("/") ?? "" })}</p>}
      </DialogContent>
    </Dialog>
  </>;
}

/** Numera in un colpo le fatture dell'anno ancora senza protocollo, in ordine di arrivo. */
export function NumeraProtocolliRicevute({ companyId, protocolli, anni }: { companyId: string; protocolli: ProtocolliRicevute; anni: number[] }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [anno, setAnno] = useState(() => new Date().getFullYear());
  const [primo, setPrimo] = useState("");
  const numera = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fatture_ricevute_protocolla_anno" as never, { p_company: companyId, p_anno: anno, p_primo: primo ? Number(primo) : null } as never);
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: async n => { await protocolli.registri.ricarica(); setAperto(false); setPrimo(""); toast.success(n ? t("{n} fatture protocollate", { n: String(n ?? "") }) : t("Nessuna fattura da protocollare: hanno già tutte un numero")); },
    onError: e => toast.error(t("Protocolli non assegnati"), { description: errore(e), duration: 10000 }),
  });
  if (!protocolli.puoScrivere) return null;
  const elencoAnni = [...new Set([new Date().getFullYear(), ...anni])].sort((a, b) => b - a);
  return <>
    <Button variant="outline" className="max-sm:hidden" onClick={() => setAperto(true)}>{t("Numera protocolli")}</Button>
    <Dialog open={aperto} onOpenChange={v => { if (!numera.isPending) setAperto(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Numera i protocolli")}</DialogTitle>
          <DialogDescription>{t("Dà un numero progressivo (1, 2, 3…) alle fatture ricevute dell'anno che non ce l'hanno ancora, in ordine di arrivo. Quelle già numerate tengono il loro numero.")}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={numera.isPending} className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="numera-anno">{t("Anno")}</Label>
            <UniformSelect id="numera-anno" className="h-10 w-full rounded-md border px-2" value={anno} onChange={e => setAnno(Number(e.target.value))}>
              {elencoAnni.map(a => <option key={a} value={a}>{a}</option>)}
            </UniformSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="numera-primo">{t("Primo numero")}</Label>
            <Input id="numera-primo" type="number" min="1" step="1" inputMode="numeric" value={primo} placeholder={String(protocolli.prossimo(anno))} onChange={e => setPrimo(e.target.value)} />
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">{t("Il primo numero serve per proseguire una numerazione tenuta altrove: lascialo vuoto per continuare dall'ultimo.")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAperto(false)}>{t("Annulla")}</Button>
          <Button disabled={!!primo && !(Number.isInteger(Number(primo)) && Number(primo) > 0)} onClick={() => numera.mutate()}>{numera.isPending ? t("Numerazione…") : t("Numera {anno}", { anno: String(anno ?? "") })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
