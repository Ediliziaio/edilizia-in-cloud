/**
 * «Indirizzo dei lavori», nel passo Contatto dei serramenti e nel passo Cliente degli edili: la spunta «Lavori allo stesso indirizzo del cliente» e, solo se i
 * lavori sono altrove, i quattro campi. Le regole (cosa si copia, quando) stanno in `useIndirizzoLavori` (serramenti)
 * e `useIndirizzoLavoriEdile` (edili, dove l'indirizzo da copiare è quello del contatto del CRM): qui c'è solo
 * quello che si vede. Senza spunta (`conSpunta={false}`: non c'è un indirizzo da copiare) restano i quattro campi.
 */
import { useEffect, useId, useRef, useState } from "react";
import { HardHat, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CampoIndirizzo, Indirizzo } from "@/lib/preventivatore/indirizzoLavori";

interface Props {
  /** I lavori sono in un altro posto: si vedono i campi. */
  altrove: boolean;
  /** Scelta dalla spunta: true = altrove. */
  onAltrove: (altrove: boolean) => void;
  /** L'indirizzo dei lavori com'è oggi nel preventivo. */
  lavori: Indirizzo;
  /** Il testo dell'indirizzo del cliente, mostrato mentre i lavori sono «uguale». */
  riassunto: string;
  /** Si scrive in un campo dei lavori. */
  onScrivi: (campo: CampoIndirizzo, valore: string) => void;
  /** Con false non c'è la spunta: non c'è un indirizzo del cliente da copiare, si scrive e basta. */
  conSpunta?: boolean;
  /** Il testo della spunta: «cliente» nei serramenti, «contatto» negli edili. */
  etichettaUguale?: string;
  /** Sotto la spunta accesa, quando non c'è ancora un indirizzo da mostrare. */
  suggerimentoVuoto?: string;
  className?: string;
}

type Suggerimento = { place_id: string; description: string };

/**
 * «Via e numero» con il menu che propone l'indirizzo esatto (30/10/2026), come
 * negli appuntamenti e nelle commesse: si scrive, si sceglie, e città, CAP e
 * provincia si compilano da soli. Se la ricerca non risponde si scrive a mano.
 */
function ViaConSuggerimenti({ id, valore, onScrivi }: { id: string; valore: string; onScrivi: (campo: CampoIndirizzo, valore: string) => void }) {
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(-1);
  const [caricamento, setCaricamento] = useState(false);
  const richiesta = useRef(0);
  const attesa = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { richiesta.current++; clearTimeout(attesa.current); }, []);

  const cerca = (testo: string) => {
    const n = ++richiesta.current;
    clearTimeout(attesa.current);
    setAttivo(-1);
    if (testo.trim().length < 4) { setSuggerimenti([]); setAperto(false); return; }
    attesa.current = setTimeout(async () => {
      setCaricamento(true);
      try {
        const { data, error } = await supabase.functions.invoke("maps-proxy", { body: { action: "autocomplete", query: testo, country: "it" } });
        if (n !== richiesta.current) return;
        const elenco = !error && !data?.error && Array.isArray(data?.predictions) ? (data.predictions as Suggerimento[]).slice(0, 6) : [];
        setSuggerimenti(elenco); setAperto(elenco.length > 0);
      } catch { if (n === richiesta.current) { setSuggerimenti([]); setAperto(false); } }
      finally { if (n === richiesta.current) setCaricamento(false); }
    }, 350);
  };

  const scegli = async (s: Suggerimento) => {
    const n = ++richiesta.current;
    setAperto(false); setSuggerimenti([]);
    onScrivi("indirizzo", s.description.split(",")[0]?.trim() || s.description);
    setCaricamento(true);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", { body: { action: "place-details", place_id: s.place_id } });
      if (n !== richiesta.current || error || data?.error || !data) return;
      if (data.address_line) onScrivi("indirizzo", String(data.address_line));
      if (data.city) onScrivi("citta", String(data.city));
      if (data.postal_code) onScrivi("cap", String(data.postal_code));
      if (data.province) onScrivi("provincia", String(data.province).slice(0, 2).toUpperCase());
    } catch { /* resta la via scelta: città e CAP si scrivono a mano */ }
    finally { if (n === richiesta.current) setCaricamento(false); }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={aperto}
        aria-controls={`${id}-elenco`}
        aria-autocomplete="list"
        aria-activedescendant={attivo >= 0 ? `${id}-opz-${attivo}` : undefined}
        value={valore}
        onChange={(e) => { onScrivi("indirizzo", e.target.value); cerca(e.target.value); }}
        onKeyDown={(e) => {
          if (!aperto || !suggerimenti.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAttivo(a => Math.min(a + 1, suggerimenti.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAttivo(a => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && attivo >= 0) { e.preventDefault(); void scegli(suggerimenti[attivo]); }
          else if (e.key === "Escape") setAperto(false);
        }}
        onBlur={() => setTimeout(() => setAperto(false), 150)}
        placeholder="Scrivi la via: ti propongo l'indirizzo esatto"
        autoComplete="off"
        className="h-9 pr-8"
      />
      {caricamento && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
      {aperto && (
        <ul id={`${id}-elenco`} role="listbox" aria-label="Indirizzi trovati" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-lg">
          {suggerimenti.map((s, k) => (
            <li key={s.place_id} id={`${id}-opz-${k}`} role="option" aria-selected={k === attivo}
              className={cn("flex cursor-pointer items-start gap-2 px-3 py-2", k === attivo ? "bg-accent" : "hover:bg-accent")}
              onMouseDown={(e) => { e.preventDefault(); void scegli(s); }}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0">{s.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IndirizzoDeiLavori({
  altrove, onAltrove, lavori, riassunto, onScrivi, className,
  conSpunta = true,
  etichettaUguale = "Lavori allo stesso indirizzo del cliente",
  suggerimentoVuoto = "Scrivi qui sopra l'indirizzo del cliente.",
}: Props) {
  const id = useId();
  return (
    <div className={cn("border-t border-slate-100 pt-3 max-sm:pt-2", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
        <HardHat className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> Indirizzo dei lavori
      </p>
      {conSpunta && (
        <label htmlFor={`${id}-uguale`} className="mt-1 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md py-2">
          <Checkbox
            id={`${id}-uguale`}
            checked={!altrove}
            onCheckedChange={(v) => onAltrove(v !== true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm text-slate-900">{etichettaUguale}</span>
            {!altrove && (
              <span className="block break-words text-xs text-slate-500">
                {riassunto || suggerimentoVuoto}
              </span>
            )}
          </span>
        </label>
      )}

      {(altrove || !conSpunta) && (
        <div role="group" aria-label="Indirizzo dei lavori" className={cn("grid grid-cols-12 gap-3 max-sm:gap-2", conSpunta ? "mt-1" : "mt-2")}>
          <div className="col-span-12">
            <Label htmlFor={`${id}-via`} className="text-xs">Via e numero</Label>
            <ViaConSuggerimenti id={`${id}-via`} valore={lavori.indirizzo ?? ""} onScrivi={onScrivi} />
          </div>
          <div className="col-span-6 max-sm:col-span-5">
            <Label htmlFor={`${id}-citta`} className="text-xs">Città</Label>
            <Input
              id={`${id}-citta`}
              value={lavori.citta ?? ""}
              onChange={(e) => onScrivi("citta", e.target.value)}
              placeholder="Torino"
              autoComplete="off"
              className="h-9"
            />
          </div>
          <div className="col-span-3">
            <Label htmlFor={`${id}-cap`} className="text-xs">CAP</Label>
            <Input
              id={`${id}-cap`}
              value={lavori.cap ?? ""}
              onChange={(e) => onScrivi("cap", e.target.value)}
              placeholder="10121"
              inputMode="numeric"
              autoComplete="off"
              className="h-9 max-sm:px-2"
            />
          </div>
          <div className="col-span-3 max-sm:col-span-4">
            <Label htmlFor={`${id}-provincia`} className="text-xs">Provincia</Label>
            <Input
              id={`${id}-provincia`}
              value={lavori.provincia ?? ""}
              onChange={(e) => onScrivi("provincia", e.target.value)}
              placeholder="TO"
              maxLength={2}
              autoComplete="off"
              className="h-9 uppercase"
            />
          </div>
        </div>
      )}
    </div>
  );
}
