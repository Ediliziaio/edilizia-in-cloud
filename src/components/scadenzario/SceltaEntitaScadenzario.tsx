import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";

export interface OpzioneEntita { id: string; label: string }
type Tipo = "fornitore" | "cantiere";

/** Caratteri che in un filtro PostgREST/ilike hanno un significato proprio. */
const pulisci = (q: string) => q.replace(/[%,()*\\]/g, " ").trim();

/** Suggerimenti dal server (mai l'elenco intero scaricato): fornitori o commesse dell'azienda. */
export async function cercaEntitaScadenzario(tipo: Tipo, companyId: string, testo: string): Promise<OpzioneEntita[]> {
  const q = pulisci(testo);
  if (tipo === "fornitore") {
    let r = supabase.from("suppliers").select("id, name").eq("company_id", companyId).order("name").limit(20);
    if (q) r = r.ilike("name", `%${q}%`);
    const { data, error } = await r;
    if (error) throw error;
    return (data ?? []).map(x => ({ id: x.id, label: x.name }));
  }
  let r = supabase.from("orders").select("id, order_code, client_name, client_company").eq("company_id", companyId)
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
  if (q) r = r.or(`order_code.ilike.%${q}%,client_name.ilike.%${q}%,client_company.ilike.%${q}%`);
  const { data, error } = await r;
  if (error) throw error;
  return (data ?? []).map(x => ({ id: x.id, label: [x.order_code, x.client_company || x.client_name].filter(Boolean).join(" · ") || x.id }));
}

function Elenco({ tipo, companyId, valore, onScegli }: { tipo: Tipo; companyId: string; valore: OpzioneEntita | null; onScegli: (o: OpzioneEntita | null) => void }) {
  const t = useT();
  const [testo, setTesto] = useState("");
  const [ritardato, setRitardato] = useState("");
  useEffect(() => { const id = window.setTimeout(() => setRitardato(testo), 250); return () => window.clearTimeout(id); }, [testo]);
  const risultati = useQuery({
    queryKey: ["scadenzario", "scelta", tipo, companyId, ritardato],
    queryFn: () => cercaEntitaScadenzario(tipo, companyId, ritardato),
    staleTime: 60_000,
    // Mentre si scrive restano i risultati di prima: niente rotellina a ogni lettera.
    placeholderData: keepPreviousData,
  });
  // Con shouldFilter={false} cmdk non evidenzia nulla quando i risultati arrivano dal server:
  // Invio non sceglieva niente. La prima voce resta evidenziata finché non si usano le frecce.
  // Calcolato, non copiato con un effetto: a risultati nuovi torna la prima voce.
  const primo = risultati.data?.[0]?.id ?? "";
  const chiave = `${ritardato}|${primo}`;
  const [frecce, setFrecce] = useState({ chiave: "", valore: "" });
  const evidenziato = frecce.chiave === chiave ? frecce.valore : primo;
  return <Command shouldFilter={false} value={evidenziato} onValueChange={(valore) => setFrecce({ chiave, valore })}>
    <CommandInput value={testo} onValueChange={setTesto}
      placeholder={tipo === "fornitore" ? t("Cerca fornitore…") : t("Cerca cantiere o cliente…")} />
    <CommandList>
      {risultati.isLoading ? <div className="flex justify-center p-3"><Loader2 className="size-4 animate-spin" aria-hidden="true" /></div>
        : risultati.isError ? <p role="alert" className="p-3 text-xs text-destructive">{t("Ricerca non riuscita. Riprova.")}</p>
        : <>
          <CommandEmpty>{t("Nessun risultato")}</CommandEmpty>
          <CommandGroup>
            {valore && <CommandItem value="__tutti" onSelect={() => onScegli(null)}>{tipo === "fornitore" ? t("Tutti i fornitori") : t("Tutti i cantieri")}</CommandItem>}
            {(risultati.data ?? []).map(o => <CommandItem key={o.id} value={o.id} onSelect={() => onScegli(o)}>
              <Check className={cn("mr-2 size-3.5", valore?.id === o.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
              <span className="truncate">{o.label}</span>
            </CommandItem>)}
          </CommandGroup>
        </>}
    </CommandList>
  </Command>;
}

/** Desktop: bottone che apre i suggerimenti. */
export function SceltaEntitaScadenzario({ tipo, companyId, valore, onScegli }: { tipo: Tipo; companyId: string; valore: OpzioneEntita | null; onScegli: (o: OpzioneEntita | null) => void }) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const nome = tipo === "fornitore" ? t("Fornitore") : t("Cantiere");
  return <Popover open={aperto} onOpenChange={setAperto}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" aria-label={valore ? `${nome}: ${valore.label}` : nome} className={cn("h-8 max-w-[200px] gap-1.5 px-2.5 text-xs", valore && "border-primary/50")}>
        <span className="truncate">{valore ? valore.label : nome}</span><ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
      <Elenco tipo={tipo} companyId={companyId} valore={valore} onScegli={o => { onScegli(o); setAperto(false); }} />
    </PopoverContent>
  </Popover>;
}

/** Telefono: elenco semplice dentro il pannello (niente tendine annidate in uno Sheet, niente cmdk). */
export function SceltaEntitaInline({ tipo, companyId, valore, onScegli }: { tipo: Tipo; companyId: string; valore: OpzioneEntita | null; onScegli: (o: OpzioneEntita | null) => void }) {
  const t = useT();
  const [testo, setTesto] = useState("");
  const [ritardato, setRitardato] = useState("");
  useEffect(() => { const id = window.setTimeout(() => setRitardato(testo), 250); return () => window.clearTimeout(id); }, [testo]);
  const risultati = useQuery({
    queryKey: ["scadenzario", "scelta", tipo, companyId, ritardato],
    queryFn: () => cercaEntitaScadenzario(tipo, companyId, ritardato),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  return <div className="space-y-1 p-2">
    <Input value={testo} onChange={e => setTesto(e.target.value)} className="h-10"
      aria-label={tipo === "fornitore" ? t("Cerca fornitore…") : t("Cerca cantiere o cliente…")}
      placeholder={tipo === "fornitore" ? t("Cerca fornitore…") : t("Cerca cantiere o cliente…")} />
    {risultati.isError && <p role="alert" className="text-xs text-destructive">{t("Ricerca non riuscita. Riprova.")}</p>}
    <ul className="max-h-48 overflow-y-auto">
      {valore && <li><button type="button" className="min-h-11 w-full px-2 text-left text-sm text-primary" onClick={() => onScegli(null)}>
        {tipo === "fornitore" ? t("Tutti i fornitori") : t("Tutti i cantieri")}</button></li>}
      {(risultati.data ?? []).map(o => <li key={o.id}>
        <button type="button" aria-pressed={valore?.id === o.id} onClick={() => onScegli(o)}
          className={cn("flex min-h-11 w-full items-center gap-2 px-2 text-left text-sm", valore?.id === o.id && "font-semibold")}>
          <Check className={cn("size-3.5 shrink-0", valore?.id === o.id ? "opacity-100" : "opacity-0")} aria-hidden="true" /><span className="truncate">{o.label}</span>
        </button></li>)}
      {!risultati.isLoading && !risultati.isError && !(risultati.data ?? []).length && <li className="px-2 py-2 text-sm text-muted-foreground">{t("Nessun risultato")}</li>}
    </ul>
  </div>;
}
