/**
 * Protocollo di cantiere delle fatture ricevute (25/11/2026, richiesta di URBAN VISION):
 * «Che1, Che2…» per Cherubini, «Cal1…» per Callimaco, «Lot1…» per Lotti. È il numero della
 * cartella del cantiere — un progressivo per commessa generale, che NON riparte a gennaio,
 * perché un cantiere dura più anni e la sua cartella è una sola.
 *
 * Non è il protocollo IVA (ProtocolloRicevuta.tsx): quello è annuale, unico per registro e
 * fiscale. Qui il numero sta sulla fattura (protocollo_commessa_id + numero) e la sigla sulla
 * commessa. La colonna compare solo dove almeno un cantiere ha la sigla: è la sigla che accende
 * la cosa, senza nessun interruttore da cercare.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const errore = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);

export interface CantiereProtocollo { id: string; codice: string; descrizione: string | null; sigla: string | null }

/** «Che12»: la sigla attaccata al numero. Senza sigla si legge il codice della commessa. */
export function etichettaProtocolloCantiere(cantiere: { sigla?: string | null; codice?: string | null } | undefined, numero: number | null | undefined): string | null {
  if (!numero) return null;
  return `${cantiere?.sigla || cantiere?.codice || "?"}${numero}`;
}
/** Il protocollo come sta sulla fattura: la commessa e il numero dentro quella. */
export interface FatturaPerProtocolloCommessa {
  id: string; numero_fattura: string; cedente_ragione_sociale: string; stato: string;
  protocollo_commessa_id?: string | null; protocollo_commessa_numero?: number | null;
}

export function useProtocolliCommessa(companyId: string | null | undefined) {
  const qc = useQueryClient();
  // I cantieri: le commesse generali (il protocollo sta sempre sulla generale) più, per
  // prudenza, qualunque commessa a cui qualcuno abbia già dato una sigla.
  const cantieri = useQuery({
    queryKey: ["protocollo-cantieri", companyId], enabled: !!companyId,
    queryFn: async () => {
      const righe = await tutteLePagine<{ id: string; order_code: string | null; description: string | null; protocollo_sigla: string | null }>(
        (da, a) => supabase.from("orders" as never)
          .select("id, order_code, description, protocollo_sigla")
          .eq("company_id", companyId!).is("deleted_at", null)
          .or("workflow_kind.eq.generale,protocollo_sigla.not.is.null")
          .order("order_code").range(da, a) as never);
      return righe.map((o): CantiereProtocollo => ({ id: o.id, codice: o.order_code ?? "Commessa", descrizione: o.description, sigla: o.protocollo_sigla }));
    },
  });
  // I numeri già dati, di tutta l'azienda: due colonne, senza il filtro anno della pagina
  // (un cantiere a cavallo di due anni ha un solo progressivo).
  const numeri = useQuery({
    queryKey: ["protocollo-cantieri-numeri", companyId], enabled: !!companyId,
    queryFn: async () => await tutteLePagine<{ protocollo_commessa_id: string; protocollo_commessa_numero: number }>(
      (da, a) => supabase.from("fatture_ricevute" as never)
        .select("protocollo_commessa_id, protocollo_commessa_numero")
        .eq("company_id", companyId!).not("protocollo_commessa_id", "is", null)
        .order("protocollo_commessa_id").order("protocollo_commessa_numero").range(da, a) as never),
  });
  const lettura = useQuery({
    queryKey: ["iva-permesso-lettura", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_puo_leggere" as never, { p_company: companyId } as never);
      if (error) throw error;
      return data === true;
    },
  });
  const scrittura = useQuery({
    queryKey: ["iva-permesso-scrittura", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_puo_scrivere", { p_company: companyId! });
      if (error) throw error;
      return data === true;
    },
  });
  const perCantiere = useMemo(() => {
    const m = new Map<string, { quante: number; ultimo: number }>();
    for (const n of numeri.data ?? []) {
      const r = m.get(n.protocollo_commessa_id) ?? { quante: 0, ultimo: 0 };
      m.set(n.protocollo_commessa_id, { quante: r.quante + 1, ultimo: Math.max(r.ultimo, n.protocollo_commessa_numero) });
    }
    return m;
  }, [numeri.data]);
  const elenco = useMemo(() => cantieri.data ?? [], [cantieri.data]);
  const diId = useMemo(() => new Map(elenco.map(c => [c.id, c])), [elenco]);
  const ricarica = async () => { await Promise.all([
    qc.invalidateQueries({ queryKey: ["protocollo-cantieri", companyId] }),
    qc.invalidateQueries({ queryKey: ["protocollo-cantieri-numeri", companyId] }),
  ]); };
  return {
    cantieri: elenco,
    /** Acceso quando almeno un cantiere ha la sigla: senza sigle la colonna non serve. */
    attivo: elenco.some(c => !!c.sigla),
    visibile: lettura.data === true && elenco.some(c => !!c.sigla),
    puoScrivere: scrittura.data === true,
    quante: (id: string) => perCantiere.get(id)?.quante ?? 0,
    prossimo: (id: string) => (perCantiere.get(id)?.ultimo ?? 0) + 1,
    /** «Che12»: la sigla del cantiere e il numero, attaccati come li scrive l'azienda. */
    etichetta: (f: FatturaPerProtocolloCommessa) => f.protocollo_commessa_id
      ? etichettaProtocolloCantiere(diId.get(f.protocollo_commessa_id), f.protocollo_commessa_numero)
      : null,
    nomeCantiere: (id: string | null | undefined) => {
      const c = id ? diId.get(id) : undefined;
      return c ? [c.sigla, c.codice, c.descrizione].filter(Boolean).join(" · ") : null;
    },
    ricarica,
  };
}
export type ProtocolliCommessa = ReturnType<typeof useProtocolliCommessa>;

export function CellaProtocolloCommessa({ fattura, protocolli }: { fattura: FatturaPerProtocolloCommessa; protocolli: ProtocolliCommessa }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [cantiere, setCantiere] = useState("");
  const [numero, setNumero] = useState("");
  const etichetta = protocolli.etichetta(fattura);
  const scelto = cantiere || fattura.protocollo_commessa_id || "";
  const salva = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fattura_ricevuta_protocolla_commessa" as never, {
        p_fattura: fattura.id, p_commessa: scelto || null, p_numero: numero ? Number(numero) : null,
      } as never);
      if (error) throw error;
      return data as unknown as { sigla: string | null; codice: string | null; numero: number };
    },
    onSuccess: async r => {
      await protocolli.ricarica(); setAperto(false);
      toast.success(t("Protocollo {numero}", { numero: `${r.sigla ?? r.codice ?? ""}${r.numero ?? ""}` }));
    },
    onError: e => toast.error(t("Protocollo non assegnato"), { description: errore(e), duration: 10000 }),
  });
  const togli = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("fattura_ricevuta_sprotocolla_commessa" as never, { p_fattura: fattura.id } as never);
      if (error) throw error;
    },
    onSuccess: async () => { await protocolli.ricarica(); setAperto(false); toast.success(t("Protocollo tolto: il numero torna libero")); },
    onError: e => toast.error(t("Protocollo non tolto"), { description: errore(e), duration: 10000 }),
  });
  if (fattura.stato === "rifiutata") return <span className="text-xs text-muted-foreground">—</span>;
  if (!etichetta && !protocolli.puoScrivere) return <span className="text-xs text-muted-foreground">—</span>;
  const numeroValido = !numero || (Number.isInteger(Number(numero)) && Number(numero) > 0);
  const inCorso = salva.isPending || togli.isPending;
  return <>
    <button type="button" onClick={() => { setCantiere(fattura.protocollo_commessa_id ?? ""); setNumero(""); setAperto(true); }}
      className={etichetta ? "whitespace-nowrap font-mono text-sm tabular-nums underline-offset-2 hover:underline" : "whitespace-nowrap text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"}
      title={etichetta ? protocolli.nomeCantiere(fattura.protocollo_commessa_id) ?? "" : t("Assegna il protocollo del cantiere")}>
      {etichetta ?? t("Assegna")}
    </button>
    <Dialog open={aperto} onOpenChange={v => { if (!inCorso) setAperto(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{etichetta ? t("Protocollo {numero}", { numero: etichetta }) : t("Protocollo del cantiere")}</DialogTitle>
          <DialogDescription>{t("{fornitore} · fattura n. {numero}. Un progressivo per cantiere, che non riparte a gennaio: è il numero della cartella del cantiere, non quello del Registro IVA.", { fornitore: String(fattura.cedente_ragione_sociale ?? ""), numero: String(fattura.numero_fattura ?? "") })}</DialogDescription>
        </DialogHeader>
        {protocolli.puoScrivere ? <fieldset disabled={inCorso} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`protc-cantiere-${fattura.id}`}>{t("Cantiere")}</Label>
            <UniformSelect id={`protc-cantiere-${fattura.id}`} className="h-10 w-full rounded-md border px-2" value={scelto}
              onChange={e => { setCantiere(e.target.value); setNumero(""); }}>
              <option value="">{t("Quello collegato alla fattura")}</option>
              {protocolli.cantieri.map(c => <option key={c.id} value={c.id}>{[c.sigla, c.codice, c.descrizione].filter(Boolean).join(" · ")}</option>)}
            </UniformSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`protc-numero-${fattura.id}`}>{t("Numero")}</Label>
            <Input id={`protc-numero-${fattura.id}`} type="number" min="1" step="1" inputMode="numeric" value={numero}
              placeholder={scelto ? t("{numero} (il prossimo)", { numero: String(protocolli.prossimo(scelto)) }) : t("il prossimo del cantiere")}
              onChange={e => setNumero(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            {etichetta && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => togli.mutate()}>{t("Togli il protocollo")}</Button>}
            <Button variant="outline" onClick={() => setAperto(false)}>{t("Chiudi")}</Button>
            <Button disabled={!numeroValido} onClick={() => salva.mutate()}>
              {salva.isPending ? t("Salvo…") : etichetta ? t("Cambia protocollo") : numero ? t("Assegna {numero}", { numero: String(numero) }) : t("Assegna il prossimo")}
            </Button>
          </DialogFooter>
        </fieldset> : <p className="text-sm text-muted-foreground">{protocolli.nomeCantiere(fattura.protocollo_commessa_id) ?? ""}</p>}
      </DialogContent>
    </Dialog>
  </>;
}

/**
 * Le sigle dei cantieri e la numerazione in blocco, in un posto solo: qui si decide tutto
 * (quale sigla, da che numero) e da qui parte la numerazione in ordine di arrivo.
 */
export function NumeraProtocolliCommesse({ companyId, protocolli }: { companyId: string; protocolli: ProtocolliCommessa }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [sigle, setSigle] = useState<Record<string, string>>({});
  const [primi, setPrimi] = useState<Record<string, string>>({});
  const sigla = (c: CantiereProtocollo) => sigle[c.id] ?? c.sigla ?? "";
  const salvaSigla = useMutation({
    mutationFn: async ({ id, valore }: { id: string; valore: string }) => {
      const { error } = await supabase.rpc("commessa_sigla_protocollo" as never, { p_commessa: id, p_sigla: valore } as never);
      if (error) throw error;
    },
    onSuccess: () => protocolli.ricarica(),
    onError: e => toast.error(t("Sigla non salvata"), { description: errore(e), duration: 10000 }),
  });
  const numera = useMutation({
    mutationFn: async () => {
      // Prima i cantieri che partono da un numero deciso a mano, poi tutti gli altri in un colpo.
      const esiti: Array<{ codice: string | null; sigla: string | null; quante: number; primo: number; ultimo: number }> = [];
      for (const [id, primo] of Object.entries(primi)) {
        if (!primo.trim()) continue;
        const { data, error } = await supabase.rpc("fatture_ricevute_protocolla_cantieri" as never,
          { p_company: companyId, p_commessa: id, p_primo: Number(primo) } as never);
        if (error) throw error;
        esiti.push(...((data as { cantieri?: typeof esiti }).cantieri ?? []));
      }
      const { data, error } = await supabase.rpc("fatture_ricevute_protocolla_cantieri" as never, { p_company: companyId } as never);
      if (error) throw error;
      esiti.push(...((data as { cantieri?: typeof esiti }).cantieri ?? []));
      return { esiti, senza: Number((data as { senza_cantiere?: number }).senza_cantiere ?? 0) };
    },
    onSuccess: async ({ esiti, senza }) => {
      await protocolli.ricarica(); setPrimi({});
      const quante = esiti.reduce((n, e) => n + (e.quante ?? 0), 0);
      if (!quante) { toast.success(t("Nessuna fattura da protocollare: hanno già tutte un numero")); return; }
      toast.success(t("{n} fatture protocollate", { n: String(quante) }), {
        description: [...esiti.map(e => `${e.sigla ?? e.codice}${e.primo}–${e.sigla ?? e.codice}${e.ultimo}`),
          senza ? t("{n} senza cantiere, lasciate senza numero", { n: String(senza) }) : null].filter(Boolean).join(" · "),
        duration: 12000,
      });
    },
    onError: e => toast.error(t("Protocolli non assegnati"), { description: errore(e), duration: 10000 }),
  });
  // Niente pulsante dove non ci sono cantieri: il protocollo per cantiere si appoggia alle
  // commesse generali, e un'azienda che non le usa non deve vedere un pulsante in più.
  if (!protocolli.puoScrivere || protocolli.cantieri.length === 0) return null;
  return <>
    <Button variant="outline" className="max-sm:hidden" onClick={() => setAperto(true)}>
      {protocolli.attivo ? t("Protocolli di cantiere") : t("Protocolli per cantiere")}
    </Button>
    <Dialog open={aperto} onOpenChange={v => { if (!numera.isPending) setAperto(v); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Protocolli divisi per cantiere")}</DialogTitle>
          <DialogDescription>{t("Dai una sigla a ogni cantiere (Che, Cal, Lot…) e le fatture ricevute prendono il numero della sua cartella: Che1, Che2, Che3… in ordine di arrivo. Il progressivo non riparte a gennaio, ed è un'altra cosa dal protocollo del Registro IVA.")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {protocolli.cantieri.length === 0 && <p className="text-sm text-muted-foreground">{t("Nessuna commessa generale: il protocollo per cantiere si appoggia a quelle.")}</p>}
          {protocolli.cantieri.map(c => <div key={c.id} className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.codice}{c.descrizione ? ` · ${c.descrizione}` : ""}</p>
              <p className="text-xs text-muted-foreground">{protocolli.quante(c.id)
                ? t("{n} già protocollate, ultimo {ultimo}", { n: String(protocolli.quante(c.id)), ultimo: `${c.sigla ?? c.codice}${protocolli.prossimo(c.id) - 1}` })
                : t("nessuna fattura protocollata")}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`sigla-${c.id}`} className="text-xs">{t("Sigla")}</Label>
              <Input id={`sigla-${c.id}`} value={sigla(c)} maxLength={8} placeholder={t("Es. Che")}
                disabled={salvaSigla.isPending}
                onChange={e => setSigle(s => ({ ...s, [c.id]: e.target.value }))}
                onBlur={() => { const v = sigla(c).trim(); if (v !== (c.sigla ?? "")) salvaSigla.mutate({ id: c.id, valore: v }); }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`primo-${c.id}`} className="text-xs">{t("Parti da")}</Label>
              <Input id={`primo-${c.id}`} type="number" min="1" step="1" inputMode="numeric" value={primi[c.id] ?? ""}
                placeholder={String(protocolli.prossimo(c.id))} onChange={e => setPrimi(p => ({ ...p, [c.id]: e.target.value }))} />
            </div>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">{t("«Parti da» serve per proseguire una numerazione tenuta altrove: lascialo vuoto per continuare dall'ultimo. Le fatture già protocollate tengono il loro numero, e quelle non collegate a nessun cantiere restano senza.")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAperto(false)}>{t("Chiudi")}</Button>
          <Button disabled={numera.isPending || !protocolli.cantieri.some(c => !!sigla(c).trim())} onClick={() => numera.mutate()}>
            {numera.isPending ? t("Numerazione…") : t("Numera le fatture senza protocollo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
