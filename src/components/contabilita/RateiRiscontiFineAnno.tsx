/**
 * Ratei e risconti al 31/12 nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 2).
 *
 * Un elenco per esercizio: costo o ricavo, importo, periodo. La quota da spostare la calcola il
 * database a giorni (contabilita_quota_rateo_risconto); «Registra» scrive la scrittura al 31/12 e il
 * suo storno all'01/01 dell'anno dopo (contabilita_ratei_risconti_registra). Se l'elenco cambia, le
 * due scritture si stornano e si rifanno.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leggiImportoItaliano } from "@/lib/orders/salCertificato";
import { ContiPerRuolo, useContiMovimentabili, type RuoloConto } from "./ContiPerRuolo";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
const dataIt = (d: string) => d.split("-").reverse().join("/");

export type TipoRateoRisconto = "risconto_attivo" | "risconto_passivo" | "rateo_attivo" | "rateo_passivo" | "fattura_da_ricevere" | "fattura_da_emettere";

/** Ogni tipo: cosa vuol dire in parole, su che natura di conto si appoggia, e il conto di stato patrimoniale. */
export const TIPI_RATEI_RISCONTI: Record<TipoRateoRisconto, { nome: string; spiegazione: string; natura: "costo" | "ricavo"; ruolo: RuoloConto }> = {
  risconto_attivo: {
    nome: "Risconto attivo", natura: "costo",
    spiegazione: "Un costo già registrato che vale anche per l'anno dopo (assicurazione, canone anticipato).",
    ruolo: { ruolo: "07.02", etichetta: "Risconti attivi (stato patrimoniale)", natura: "attivo" },
  },
  risconto_passivo: {
    nome: "Risconto passivo", natura: "ricavo",
    spiegazione: "Un ricavo già fatturato che vale anche per l'anno dopo.",
    ruolo: { ruolo: "14.02", etichetta: "Risconti passivi (stato patrimoniale)", natura: "passivo" },
  },
  rateo_attivo: {
    nome: "Rateo attivo", natura: "ricavo",
    spiegazione: "Un ricavo maturato quest'anno che si fatturerà l'anno dopo (interessi, affitti posticipati).",
    ruolo: { ruolo: "07.01", etichetta: "Ratei attivi (stato patrimoniale)", natura: "attivo" },
  },
  rateo_passivo: {
    nome: "Rateo passivo", natura: "costo",
    spiegazione: "Un costo maturato quest'anno che arriverà in fattura l'anno dopo (utenze, noleggi).",
    ruolo: { ruolo: "14.01", etichetta: "Ratei passivi (stato patrimoniale)", natura: "passivo" },
  },
  fattura_da_ricevere: {
    nome: "Fattura da ricevere", natura: "costo",
    spiegazione: "Un costo di quest'anno la cui fattura arriverà l'anno dopo (lavori finiti a dicembre, utenze): va tutto nell'anno.",
    ruolo: { ruolo: "13.05", etichetta: "Fatture da ricevere (stato patrimoniale)", natura: "passivo" },
  },
  fattura_da_emettere: {
    nome: "Fattura da emettere", natura: "ricavo",
    spiegazione: "Un ricavo maturato quest'anno che si fatturerà l'anno dopo (un SAL di dicembre): va tutto nell'anno.",
    ruolo: { ruolo: "05.02", etichetta: "Fatture da emettere (stato patrimoniale)", natura: "attivo" },
  },
};
const TIPI = Object.keys(TIPI_RATEI_RISCONTI) as TipoRateoRisconto[];

export interface VoceRateoRisconto { id: string; tipo: TipoRateoRisconto; descrizione: string; conto: string; importo: number; dal: string; al: string; quota: number }
export interface EsitoRateiRisconti { voci: VoceRateoRisconto[]; totale: number; registrata: boolean; da_aggiornare: boolean; conti_mancanti: string[] }

/** La risposta della funzione, letta in modo sicuro. */
export function leggiEsitoRateiRisconti(j: Json): EsitoRateiRisconti {
  const o = (j ?? {}) as Record<string, unknown>;
  const voci = Array.isArray(o.voci) ? o.voci : [];
  return {
    voci: voci.map((x) => {
      const v = (x ?? {}) as Record<string, unknown>;
      const tipo = TIPI.includes(v.tipo as TipoRateoRisconto) ? (v.tipo as TipoRateoRisconto) : "risconto_attivo";
      return {
        id: String(v.id ?? ""), tipo, descrizione: String(v.descrizione ?? ""), conto: String(v.conto ?? ""),
        importo: Number(v.importo) || 0, dal: String(v.dal ?? ""), al: String(v.al ?? ""), quota: Number(v.quota) || 0,
      };
    }),
    totale: Number(o.totale) || 0,
    registrata: o.registrata === true,
    da_aggiornare: o.da_aggiornare === true,
    conti_mancanti: Array.isArray(o.conti_mancanti) ? o.conti_mancanti.map(String) : [],
  };
}

interface Bozza { tipo: TipoRateoRisconto; descrizione: string; conto: string; importo: string; dal: string; al: string }

export function RateiRiscontiFineAnno({ companyId, anno, chiuso }: { companyId: string; anno: number; chiuso: boolean }) {
  const qc = useQueryClient();
  const chiave = ["contabilita-generale", companyId, "ratei-risconti", anno];
  const vuota: Bozza = { tipo: "risconto_attivo", descrizione: "", conto: "", importo: "", dal: "", al: "" };
  const [bozza, setBozza] = useState<Bozza>(vuota);
  const conti = useContiMovimentabili(companyId);

  const elenco = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_ratei_risconti_registra", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return leggiEsitoRateiRisconti(data);
    },
  });
  const aggiorna = () => { void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); };
  const errore = (titolo: string) => (e: unknown) => toast.error(titolo, { description: e instanceof Error ? e.message : String(e) });

  const importo = leggiImportoItaliano(bozza.importo);
  const bozzaValida = bozza.descrizione.trim() !== "" && bozza.conto !== "" && Number.isFinite(importo) && importo > 0
    && bozza.dal !== "" && bozza.al !== "" && bozza.al >= bozza.dal;

  const aggiungi = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contabilita_ratei_risconti").insert({
        company_id: companyId, esercizio: anno, tipo: bozza.tipo, descrizione: bozza.descrizione.trim(),
        conto_id: bozza.conto, importo, dal: bozza.dal, al: bozza.al,
      });
      if (error) throw error;
    },
    onSuccess: () => { setBozza({ ...vuota, tipo: bozza.tipo }); aggiorna(); },
    onError: errore("Voce non aggiunta"),
  });
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contabilita_ratei_risconti").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: errore("Voce non tolta"),
  });
  const registra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_ratei_risconti_registra", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return leggiEsitoRateiRisconti(data);
    },
    onSuccess: (r) => {
      toast.success(r.registrata ? `Ratei e risconti registrati al 31/12/${anno}, stornati all'01/01/${anno + 1}` : "Nessun rateo o risconto da registrare");
      aggiorna();
    },
    onError: errore("Ratei e risconti non registrati"),
  });

  if (elenco.isLoading) return <p role="status" className="text-sm text-muted-foreground">Carico ratei e risconti…</p>;
  if (elenco.isError || !elenco.data) return <p role="alert" className="text-sm text-destructive">Ratei e risconti non disponibili. <Button variant="link" className="h-auto p-0" onClick={() => void elenco.refetch()}>Riprova</Button></p>;
  const e = elenco.data;
  const mancanti = TIPI.map((t) => TIPI_RATEI_RISCONTI[t].ruolo).filter((r) => e.conti_mancanti.includes(r.ruolo));
  const tipo = TIPI_RATEI_RISCONTI[bozza.tipo];

  return (
    <div className="space-y-3">
      <ContiPerRuolo companyId={companyId} ruoli={mancanti} chiuso={chiuso} />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Voce</th><th className="p-2">Conto</th><th className="p-2">Periodo</th><th className="p-2 text-right">Importo</th><th className="p-2 text-right">Quota al 31/12</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {e.voci.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nessun rateo o risconto per il {anno}.</td></tr>
            ) : e.voci.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="p-2">{v.descrizione}<p className="text-xs text-muted-foreground">{TIPI_RATEI_RISCONTI[v.tipo].nome}</p></td>
                <td className="p-2 text-xs">{v.conto}</td>
                <td className="p-2 whitespace-nowrap text-xs">{dataIt(v.dal)} – {dataIt(v.al)}</td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">{euro(v.importo)}</td>
                <td className="p-2 text-right font-medium tabular-nums">{euro(v.quota)}</td>
                <td className="p-2 text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Togli ${v.descrizione}`} disabled={chiuso || togli.isPending}
                    onClick={() => togli.mutate(v.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!chiuso && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-6">
            <Select value={bozza.tipo} onValueChange={(t) => setBozza({ ...bozza, tipo: t as TipoRateoRisconto, conto: "" })}>
              <SelectTrigger aria-label="Tipo" className="h-8 text-xs sm:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPI.map((t) => <SelectItem key={t} value={t} className="text-xs">{TIPI_RATEI_RISCONTI[t].nome}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Descrizione" placeholder="Descrizione" className="h-8 text-xs sm:col-span-4"
              value={bozza.descrizione} onChange={(ev) => setBozza({ ...bozza, descrizione: ev.target.value })} />
            <Select value={bozza.conto} onValueChange={(c) => setBozza({ ...bozza, conto: c })}>
              <SelectTrigger aria-label={`Conto di ${tipo.natura}`} className="h-8 text-xs sm:col-span-3"><SelectValue placeholder={`Conto di ${tipo.natura}…`} /></SelectTrigger>
              <SelectContent>
                {(conti.data ?? []).filter((c) => c.natura === tipo.natura).map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.codice} {c.descrizione}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input aria-label="Importo" placeholder="Importo intero" inputMode="decimal" className="h-8 text-right text-xs tabular-nums"
              value={bozza.importo} onChange={(ev) => setBozza({ ...bozza, importo: ev.target.value })} />
            <Input aria-label="Dal" type="date" className="h-8 text-xs" value={bozza.dal} onChange={(ev) => setBozza({ ...bozza, dal: ev.target.value })} />
            <Input aria-label="Al" type="date" className="h-8 text-xs" value={bozza.al} onChange={(ev) => setBozza({ ...bozza, al: ev.target.value })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{tipo.spiegazione} {tipo.nome.startsWith("Fattura") ? "L'importo va tutto al 31/12 e si riapre all'01/01, quando arriva la fattura." : "Scrivi l'importo intero del periodo: la quota la calcolo a giorni."}</p>
            <Button size="sm" variant="secondary" disabled={!bozzaValida || aggiungi.isPending} onClick={() => aggiungi.mutate()}>Aggiungi</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {e.da_aggiornare ? <strong className="text-amber-700">Da aggiornare: l'elenco è cambiato dopo la registrazione. Premi «Registra».</strong>
            : e.registrata ? "Registrati: se cambi l'elenco, le scritture si stornano e si rifanno." : "Non ancora registrati."}
          {" "}Al 31/12 la quota passa sul conto di rateo o risconto; all'01/01/{anno + 1} torna indietro da sola.
        </p>
        <Button size="sm" variant="outline" disabled={chiuso || mancanti.length > 0 || registra.isPending || (e.voci.length === 0 && !e.registrata)}
          onClick={() => registra.mutate()}>
          {registra.isPending ? "Registrazione…" : "Registra ratei e risconti"}
        </Button>
      </div>
    </div>
  );
}
