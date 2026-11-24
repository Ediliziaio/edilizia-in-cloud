import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const perPagina = 20;
type Opzione = { id: string; nome: string; codice?: string | null };

export function AmbitoOperazione({ fissi, figlie, valore, onChange, etichetta }: {
  fissi: Opzione[];
  figlie: FigliaGenerale[];
  valore: string;
  onChange: (id: string) => void;
  etichetta?: string;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [limite, setLimite] = useState(perPagina);
  const attiva = fissi.find(o => o.id === valore) ?? figlie.find(f => f.id === valore);
  const risultati = aperto ? figlie.filter(f => cercaNellOperazione(cerca, [f.codice, f.nome, f.indirizzo])) : [];
  const scegli = (id: string) => { onChange(id); setAperto(false); };
  const opzione = (o: Opzione) => (
    <CommandItem key={o.id} value={o.id} onSelect={() => scegli(o.id)}>
      <Check className={cn("size-4 shrink-0", o.id !== valore && "opacity-0")} aria-hidden="true" />
      <span className="min-w-0 break-words">{[o.nome, o.codice].filter(Boolean).join(" · ")}</span>
    </CommandItem>
  );

  return (
    <Popover open={aperto} onOpenChange={open => {
      setAperto(open);
      if (open) { setCerca(""); setLimite(perPagina); }
    }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={aperto} aria-label={etichetta ?? t("Ambito del cantiere")}
          className="h-8 min-w-0 flex-1 justify-between px-2.5 text-xs font-normal">
          <span className="truncate">{attiva ? [attiva.nome, attiva.codice].filter(Boolean).join(" · ") : t("Scegli ambito")}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} label={t("Cerca nell’ambito del cantiere")}>
          <CommandInput placeholder={t("Cerca unità, lotto o codice…")} value={cerca}
            onValueChange={s => { setCerca(s); setLimite(perPagina); }} />
          <CommandList>
            {!cerca.trim() && <CommandGroup>{fissi.map(opzione)}</CommandGroup>}
            {!risultati.length && <p role="status" className="px-3 py-3 text-xs text-muted-foreground">{t("Nessun risultato.")}</p>}
            {risultati.length > 0 && <CommandGroup>
              {risultati.slice(0, limite).map(opzione)}
              {risultati.length > limite && <CommandItem value="altri" onSelect={() => setLimite(n => n + perPagina)}>
                {t("Mostra altri risultati")}
              </CommandItem>}
            </CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
