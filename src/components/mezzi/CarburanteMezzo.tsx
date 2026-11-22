import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fuel } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { ConfigCarburanteMezzo, TipoCarburante } from "@/integrations/supabase/appDatabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCarburanteMezzo, viaggiKey } from "@/hooks/useMezziViaggi";
import { regioneAzienda } from "@/lib/geo/provinceRegioni";
import { chiaveTerritorio, PAGINA_MIMIT, PERCORSO_MIMIT, type PrezziMimit } from "../../../shared/carburanti/mimit";
import { formatData, oggiIso } from "@/types/mezzi";

type SceltaRiferimento = { zona: string | null; preferisciMimit: boolean };

const tipi = { gasolio: "Gasolio", benzina: "Benzina", nessuno: "Nessun carburante" };
const numero = (v: string) => v.trim() === "" ? null : Number(v.trim().replace(",", "."));
const decimali = (n: number, massimo: number) => n.toLocaleString("it-IT", { maximumFractionDigits: massimo });

export default function CarburanteMezzo({ company, mezzo, modifica }: { company: string; mezzo: string; modifica: boolean }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [dal, setDal] = useState(oggiIso);
  const lettura = useCarburanteMezzo(company, mezzo, dal, aperto);
  const salva = useMutation({
    mutationFn: async (v: { tipo: TipoCarburante; litri: number | null; prezzo: number | null }) => {
      const { error } = await supabase.rpc("mezzo_carburante_salva", {
        p_company: company, p_mezzo: mezzo, p_tipo: v.tipo, p_litri_100: v.litri, p_euro_litro: v.prezzo, p_dal: dal,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: viaggiKey(company) });
      toast.success("Parametri carburante salvati");
      setAperto(false);
    },
    onError: () => toast.error("Impossibile salvare i parametri carburante"),
  });
  const salvaRiferimento = useMutation({
    mutationFn: async (v: SceltaRiferimento) => {
      const { error } = await supabase.rpc("mezzo_carburante_riferimento_salva", {
        p_company: company, p_mezzo: mezzo, p_dal: dal, p_zona: v.zona, p_preferisci_mimit: v.preferisciMimit,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: viaggiKey(company) });
      toast.success("Riferimento carburante salvato");
    },
    onError: () => toast.error("Impossibile salvare il riferimento carburante"),
  });
  return <section aria-label="Configurazione carburante" className="rounded-lg border bg-card">
    <Button type="button" size="sm" variant="ghost" className="w-full justify-start gap-2 px-3" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>
      <Fuel className="size-4" /> Consumo e prezzo carburante
    </Button>
    {aperto && <div className="space-y-2.5 border-t px-3 pb-3 pt-2">
      <label className="block max-w-44 space-y-1 text-xs text-muted-foreground">{modifica ? "Decorrenza" : "Valori al giorno"}
        <Input type="date" value={dal} onChange={e => setDal(e.target.value)} disabled={salva.isPending || salvaRiferimento.isPending} />
      </label>
      {dal && lettura.isPending && <p role="status" className="text-sm">Caricamento parametri…</p>}
      {lettura.isError && <p role="alert" className="text-sm">Parametri non disponibili. <button className="underline" onClick={() => void lettura.refetch()}>Riprova</button></p>}
      {dal && <PrezzoPubblico key={`${company}:${dal}`} provincia={effectiveCompany?.operational_province || effectiveCompany?.legal_province}
        regione={regioneAzienda(effectiveCompany)} giorno={dal} config={lettura.data} modifica={modifica}
        salvataggio={salvaRiferimento.isPending} onSalva={salvaRiferimento.mutate} />}
      {dal && lettura.data && <Parametri key={dal} dati={lettura.data} modifica={modifica} salvataggio={salva.isPending} onSalva={salva.mutate} />}
    </div>}
  </section>;
}

function PrezzoPubblico({ provincia, regione, giorno, config, modifica, salvataggio, onSalva }: {
  provincia?: string | null; regione: string | null; giorno: string;
  config?: ConfigCarburanteMezzo; modifica: boolean; salvataggio: boolean; onSalva: (v: SceltaRiferimento) => void;
}) {
  const zona = provincia?.trim().toUpperCase();
  const sede = zona === "BZ" ? "bolzano" : zona === "TN" ? "trento" : chiaveTerritorio(regione ?? "");
  const predefinito = config?.riferimento?.zona_impostata ?? "";
  const preferenza = config?.riferimento?.preferisci_mimit ?? false;
  const [scelto, setScelto] = useState<string | null>(null);
  const [modalita, setModalita] = useState<boolean | null>(null);
  const area = scelto ?? predefinito;
  const preferisciMimit = modalita ?? preferenza;
  const storico = useQuery({
    queryKey: ["carburanti-mimit", "storico", giorno],
    staleTime: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("carburante_mimit_giorno", { p_giorno: giorno }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
  const oggi = giorno === oggiIso();
  const live = useQuery({
    queryKey: ["carburanti-mimit", "rete-stradale"],
    staleTime: 15 * 60_000, retry: false,
    enabled: oggi && !storico.isPending && !storico.data,
    queryFn: async ({ signal }): Promise<PrezziMimit> => {
      const res = await fetch(PERCORSO_MIMIT, { signal, credentials: "omit" });
      if (!res.ok) throw new Error("Rilevazione MIMIT indisponibile");
      return await res.json() as PrezziMimit;
    },
  });
  const prezzi = storico.data ?? (oggi ? live.data : undefined);
  const zonaRilevazione = area || sede || (predefinito === "" ? config?.riferimento?.zona : "");
  const territorio = prezzi?.territori.find(t => t.chiave === zonaRilevazione);
  const selezionabili = config?.zone ?? prezzi?.territori ?? [];
  const nomeSede = selezionabili.find(t => t.chiave === sede)?.nome;
  return <section aria-label="Prezzo medio pubblico" className="space-y-2 rounded-lg border bg-muted/30 px-2.5 py-2">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <p className="text-sm font-semibold">Prezzo medio pubblico <a href={PAGINA_MIMIT} className="ml-1 font-normal text-primary underline underline-offset-2" target="_blank" rel="noreferrer">MIMIT</a></p>
      {selezionabili.length > 0 && <select aria-label="Territorio del prezzo medio" value={area} onChange={e => setScelto(e.target.value)}
        className="h-8 max-w-full rounded-md border bg-background px-2 text-xs">
        <option value="">{nomeSede ? `Sede · ${nomeSede}` : "Provincia della sede"}</option>
        {selezionabili.map(t => <option value={t.chiave} key={t.chiave}>{t.nome}</option>)}
      </select>}
    </div>
    {(storico.isPending || live.isFetching) && <p role="status" className="text-xs text-muted-foreground">Carico la rilevazione…</p>}
    {!territorio && !storico.isPending && !live.isFetching && <p className="text-xs text-muted-foreground">
      {prezzi && !zonaRilevazione ? "Scegli il territorio." : storico.isError || live.isError ? "Rilevazione temporaneamente indisponibile." : "Nessun prezzo archiviato per questo giorno e territorio."}
    </p>}
    {territorio && prezzi && <>
      <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm tabular-nums">
        {(["gasolio", "benzina"] as const).map(k => <span key={k}>{tipi[k]}{" "}
          <strong>{territorio.prezzi[k] == null ? "—" : `${decimali(territorio.prezzi[k], 3)} €/L`}</strong>
        </span>)}
      </p>
      <p className="text-xs text-muted-foreground">
        Rilevazione del {formatData(prezzi.giorno)} alle 08:00 · self fuori autostrada · IVA inclusa.
        {!storico.data && " In attesa di acquisizione nello storico."}
      </p>
    </>}
    {modifica && config?.riferimento && <div className="flex flex-wrap items-end gap-2 border-t pt-2">
      <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted-foreground">Fonte per le stime da questa data
        <select value={preferisciMimit ? "mimit" : "aziendale"} onChange={e => setModalita(e.target.value === "mimit")}
          className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs text-foreground">
          <option value="mimit">MIMIT, aziendale se manca</option>
          <option value="aziendale">Aziendale, MIMIT se manca</option>
        </select>
      </label>
      <Button type="button" size="sm" variant="outline" disabled={salvataggio || (area === predefinito && preferisciMimit === preferenza)}
        onClick={() => onSalva({ zona: area || null, preferisciMimit })}>Salva zona e fonte</Button>
    </div>}
  </section>;
}

function Parametri({ dati, modifica, salvataggio, onSalva }: {
  dati: ConfigCarburanteMezzo; modifica: boolean; salvataggio: boolean;
  onSalva: (v: { tipo: TipoCarburante; litri: number | null; prezzo: number | null }) => void;
}) {
  const [tipo, setTipo] = useState<TipoCarburante>(dati.consumo?.tipo ?? "gasolio");
  const [litri, setLitri] = useState(dati.consumo?.litri_100 == null ? "" : String(dati.consumo.litri_100));
  const [prezzo, setPrezzo] = useState("");
  const escluso = tipo === "nessuno";
  const consumo = escluso ? null : numero(litri);
  const euro = escluso ? null : numero(prezzo);
  const valido = escluso || (consumo != null && consumo >= 0.001 && consumo <= 150 && (euro === null || (euro >= 0.0001 && euro <= 20)));
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valido && modifica) onSalva({ tipo, litri: consumo, prezzo: euro }); }}>
    <p className="text-sm">{dati.consumo ? `${tipi[dati.consumo.tipo]}${dati.consumo.litri_100 == null ? "" : ` · ${decimali(dati.consumo.litri_100, 3)} L/100 km`} dal ${formatData(dati.consumo.dal)}` : "Consumo del mezzo da impostare."}</p>
    {dati.stima?.euro_litro != null && <p className="text-xs text-muted-foreground">
      Per le stime del mezzo · {decimali(dati.stima.euro_litro, 4)} €/L al netto IVA · {dati.stima.fonte === "mimit" ? "MIMIT" : "prezzo aziendale"}
    </p>}
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {(["gasolio", "benzina"] as const).map(k => {
        const p = dati.prezzi[k];
        return <span key={k}>{tipi[k]} · {p ? `${decimali(p.euro_litro, 4)} €/L dal ${formatData(p.dal)}` : "prezzo da impostare"}</span>;
      })}
    </div>
    {modifica && <fieldset disabled={salvataggio} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Carburante
        <select value={tipo} onChange={e => { setTipo(e.target.value as TipoCarburante); setPrezzo(""); }}
          className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
          {Object.entries(tipi).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Consumo medio (L/100 km)
        <Input inputMode="decimal" disabled={escluso} value={escluso ? "" : litri} onChange={e => setLitri(e.target.value)} placeholder="Es. 8,5" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Nuovo prezzo medio aziendale (€/L)
        <Input inputMode="decimal" disabled={escluso} value={escluso ? "" : prezzo} onChange={e => setPrezzo(e.target.value)} placeholder="Mantieni il prezzo corrente" />
      </label>
      <Button type="submit" disabled={!valido}>{salvataggio ? "Salvataggio…" : "Salva parametri"}</Button>
      <p className="text-xs text-muted-foreground sm:col-span-4">Il nuovo prezzo vale per tutti i mezzi con lo stesso carburante dalla decorrenza scelta. Usa il prezzo netto IVA per il confronto con i costi della commessa.</p>
    </fieldset>}
  </form>;
}
