/**
 * Passo «Dati» del preventivo con computo, come il passo Cliente di
 * Ristrutturazione: il cliente si prende dal CRM (nome, email, telefono e il
 * suo indirizzo), il preventivo si può cointestare e l'indirizzo dei lavori è
 * «lo stesso del contatto» oppure si scrive. Sotto, i dati del documento.
 *
 * Prima del 29/10/2026 erano otto caselle in colonna, senza CRM e con
 * l'indirizzo in una riga sola: il PDF non sapeva a chi intestare la firma.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Mail, Phone, User, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Cointestatario } from "@/components/preventivatore/Cointestatario";
import { IndirizzoDeiLavori } from "@/components/preventivatore/IndirizzoDeiLavori";
import { useIndirizzoLavoriEdile } from "@/lib/preventivatore/useIndirizzoLavoriEdile";
import { testoIndirizzo } from "@/lib/preventivatore/indirizzoLavori";
import type { BozzaComputo } from "@/lib/computo/editorNativo";

interface Contatto {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; province: string | null; postal_code: string | null;
}

const nomeContatto = (c: Contatto) => `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";
const CANTIERE = ["cantiere_indirizzo", "cantiere_citta", "cantiere_cap", "cantiere_provincia"] as const;

/** L'indirizzo dei lavori come riga del PDF, dai quattro campi. */
export function indirizzoDaCantiere(b: BozzaComputo): string {
  const c = cantiereDellaBozza(b);
  return testoIndirizzo({ indirizzo: c.cantiere_indirizzo, citta: c.cantiere_citta, cap: c.cantiere_cap, provincia: c.cantiere_provincia }).slice(0, 300);
}

/** Una bozza di prima aveva solo `indirizzo`: si legge come via, finché non si riscrive. */
export function cantiereDellaBozza(b: BozzaComputo) {
  const vuoto = CANTIERE.every(k => !(b[k] ?? "").trim());
  return {
    cantiere_indirizzo: vuoto ? b.indirizzo || null : b.cantiere_indirizzo || null,
    cantiere_citta: b.cantiere_citta || null, cantiere_cap: b.cantiere_cap || null, cantiere_provincia: b.cantiere_provincia || null,
  };
}

export default function ComputoDati({ bozza, onChange }: { bozza: BozzaComputo; onChange: (patch: Partial<BozzaComputo>) => void }) {
  const companyId = useEffectiveCompanyId();
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const cantiere = cantiereDellaBozza(bozza);
  // Le scritture dello stesso giro (la spunta copia quattro campi) le somma l'editor; il testo per il PDF lo ricompone lui.
  const scriviCantiere = (chiave: (typeof CANTIERE)[number], valore: string | null) => onChange({ [chiave]: valore ?? "" });
  const indirizzo = useIndirizzoLavoriEdile(cantiere, scriviCantiere, { contattoId: bozza.clienteId || null, nuovo: false });

  const { data: contatti = [] } = useQuery({
    queryKey: ["computo-contatto-cliente", companyId, cerca],
    enabled: !!companyId && aperto,
    queryFn: async (): Promise<Contatto[]> => {
      let q = supabase.from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, address, city, province, postal_code")
        .eq("company_id", companyId!).is("deleted_at", null).limit(20);
      for (const filtro of filtriRicercaContatti(cerca)) q = q.or(filtro);
      const { data, error } = await q.order("first_name");
      if (error) throw error;
      return (data ?? []) as Contatto[];
    },
  });

  const scegli = (c: Contatto) => {
    onChange({ clienteId: c.id, committente: nomeContatto(c).slice(0, 160), clienteEmail: c.email ?? "", clienteTelefono: c.phone ?? "" });
    indirizzo.dalContatto(c.id, { indirizzo: c.address, citta: c.city, cap: c.postal_code, provincia: c.province });
    setAperto(false);
  };
  const testo = (nome: string, key: "titolo" | "oggetto" | "numero" | "dataDocumento" | "revisione" | "tecnico", max: number, placeholder = "") =>
    <div className="min-w-0 space-y-1"><Label htmlFor={`native-${key}`} className="text-xs">{nome}</Label>
      <Input id={`native-${key}`} className="h-9" maxLength={max} placeholder={placeholder} value={bozza[key] ?? ""} onChange={e => onChange({ [key]: e.target.value })} /></div>;

  return <div className="space-y-4">
    <section aria-label="Cliente" className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><User className="h-4 w-4 text-slate-500" />Cliente</h2>
        {bozza.clienteId
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-2.5 pr-1 text-xs text-emerald-900">
              <Check className="h-3.5 w-3.5" />Collegato al CRM
              <button type="button" aria-label="Scollega il contatto del CRM" className="rounded-full p-0.5 hover:bg-emerald-100" onClick={() => onChange({ clienteId: "" })}><X className="h-3 w-3" /></button>
            </span>
          : <Popover open={aperto} onOpenChange={setAperto}>
              <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Scegli dai contatti del CRM</Button></PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Cerca per nome, email o telefono…" value={cerca} onValueChange={setCerca} />
                  <CommandList><CommandEmpty>Nessun contatto trovato</CommandEmpty><CommandGroup>
                    {contatti.map(c => <CommandItem key={c.id} value={c.id} onSelect={() => scegli(c)}>
                      <div className="min-w-0"><p className="truncate text-sm">{nomeContatto(c)}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{[c.email, c.phone, c.city].filter(Boolean).join(" · ")}</p></div>
                    </CommandItem>)}
                  </CommandGroup></CommandList>
                </Command>
              </PopoverContent>
            </Popover>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 space-y-1"><Label htmlFor="native-committente" className="text-xs">Committente</Label>
          <Input id="native-committente" className="h-9" maxLength={160} placeholder="Nome e cognome o ragione sociale" value={bozza.committente} onChange={e => onChange({ committente: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor="native-email" className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" />Email</Label>
          <Input id="native-email" type="email" className="h-9" maxLength={200} value={bozza.clienteEmail} onChange={e => onChange({ clienteEmail: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor="native-telefono" className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" />Telefono</Label>
          <Input id="native-telefono" type="tel" inputMode="tel" className="h-9" maxLength={60} value={bozza.clienteTelefono} onChange={e => onChange({ clienteTelefono: e.target.value })} /></div>
      </div>
      <Cointestatario form={bozza} onChange={(campo, valore) => onChange({ [campo]: valore ?? "" })} />
      <IndirizzoDeiLavori conSpunta={indirizzo.conSpunta} etichettaUguale="Lavori allo stesso indirizzo del contatto"
        altrove={indirizzo.altrove} onAltrove={indirizzo.scegliAltrove} lavori={indirizzo.lavori} riassunto={indirizzo.riassunto} onScrivi={indirizzo.scriviLavori} />
    </section>

    <section aria-label="Intervento" className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-base font-semibold">Intervento</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {testo("Titolo del preventivo", "titolo", 160)}{testo("Oggetto dei lavori", "oggetto", 500, "Es. Realizzazione di un campo da tennis in resina")}
      </div>
    </section>

    <details className="group rounded-xl border bg-white p-4" open={!!(bozza.numero || bozza.revisione || bozza.tecnico || bozza.riferimentoPrezzi)}>
      <summary className="cursor-pointer text-sm font-semibold">Riferimenti del documento <span className="font-normal text-muted-foreground">· numero, data, tecnico, prezzi</span></summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {testo("Numero preventivo", "numero", 80)}{testo("Data del documento", "dataDocumento", 40, "gg/mm/aaaa")}
          {testo("Revisione", "revisione", 80)}{testo("Tecnico o referente", "tecnico", 300)}
        </div>
        <div className="space-y-1"><Label htmlFor="native-prezzi" className="text-xs">Riferimenti dei prezzi</Label>
          <Textarea id="native-prezzi" rows={2} maxLength={2000} placeholder="Es. Prezzario Regione Lombardia 2026, prezzi dell'impresa" value={bozza.riferimentoPrezzi} onChange={e => onChange({ riferimentoPrezzi: e.target.value })} /></div>
      </div>
    </details>
  </div>;
}
