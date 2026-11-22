import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useVociListinoFornitore } from "@/hooks/useListinoFornitore";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { prezzoNetto } from "@/lib/listino/listinoFornitore";
import { euroAnalisi, risorsaVuota, type RisorsaCosto } from "@/lib/preventivi/analisiCosti";

export default function ListinoFornitoreAnalisi({ companyId, onAggiungi }: {
  companyId: string;
  onAggiungi: (r: RisorsaCosto) => void;
}) {
  const [ricerca, cerca] = useState("");
  const [fornitore, scegliFornitore] = useState<{ id: string; name: string } | null>(null);
  const testo = useDebounce(ricerca.trim().slice(0, 100), 250);
  const { data, isPending, error } = useQuery({
    queryKey: ["analisi-costi", "fornitori", companyId, testo],
    retry: false,
    queryFn: async ({ signal }) => {
      const query = supabase.from("suppliers").select("id,name").eq("company_id", companyId).eq("is_active", true);
      const nome = testo.replace(/[\\%_]/g, "\\$&");
      const risposta = await (nome ? query.ilike("name", `%${nome}%`) : query).order("name").limit(30).abortSignal(signal);
      if (risposta.error) throw new Error("Elenco fornitori non disponibile.");
      return risposta.data;
    },
  });
  const { voci, isLoading } = useVociListinoFornitore(fornitore?.id);
  const [articolo, cercaArticolo] = useState("");
  const valida = (r: typeof voci[number]) => !r.listinoScadutoIl && !!r.unita?.trim() && Number.isFinite(r.prezzo)
    && r.prezzo >= 0 && r.sconto_pct >= 0 && r.sconto_pct <= 100;
  const visibili = voci.filter(r => valida(r) && `${r.codice ?? ""} ${r.descrizione}`.toLocaleLowerCase("it").includes(articolo.trim().toLocaleLowerCase("it")));
  return <section aria-label="Materiali dal fornitore" className="space-y-2 rounded-md border bg-white p-2.5 text-sm">
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-medium">Cerca fornitore
        <Input value={ricerca} onChange={e => cerca(e.target.value)} placeholder="Ragione sociale" />
      </label>
      <div className="space-y-1">
        <Label htmlFor="fornitore-analisi" className="text-xs">Fornitore</Label>
        <UniformSelect id="fornitore-analisi" className="h-9 w-full rounded-md border bg-background px-2"
          value={fornitore?.id ?? ""} onChange={e => {
            scegliFornitore(data?.find(f => f.id === e.target.value) ?? null);
            cercaArticolo("");
          }}>
          <option value="">Scegli un fornitore</option>
          {fornitore && !data?.some(f => f.id === fornitore.id) && <option value={fornitore.id}>{fornitore.name}</option>}
          {data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </UniformSelect>
      </div>
    </div>
    {error && <p role="alert" className="text-xs text-amber-800">{error.message}</p>}
    {isPending && <p role="status" className="text-xs text-muted-foreground">Cerco i fornitori…</p>}
    {fornitore && <label className="block space-y-1 text-xs font-medium">Cerca articolo nel listino in vigore
      <Input value={articolo} onChange={e => cercaArticolo(e.target.value)} placeholder="Codice o descrizione" />
    </label>}
    {fornitore && isLoading && <p role="status" className="text-xs text-muted-foreground">Apro il listino…</p>}
    {fornitore && !isLoading && !visibili.length && <p className="text-xs text-muted-foreground">Nessuna voce utilizzabile in un listino in vigore.</p>}
    {!!visibili.length && <ul className="max-h-56 divide-y overflow-auto rounded-md border">
      {visibili.slice(0, 25).map(r => <li key={r.id} className="p-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between gap-2 whitespace-normal px-1.5 py-2 text-left"
          onClick={() => {
            if (!fornitore || !valida(r)) return;
            onAggiungi({ ...risorsaVuota("materiale"), nome: r.descrizione.slice(0, 500), unita: r.unita!.trim().slice(0, 32),
              prezzo: String(prezzoNetto(r.prezzo, r.sconto_pct)), base: "unitaria", quantita: "",
              fonte: [fornitore.name, r.codice, `Letto il ${new Date().toLocaleDateString("it-IT")}`].filter(Boolean).join(" · ").slice(0, 500) });
          }}>
          <span className="min-w-0 break-words">{[r.codice, r.descrizione].filter(Boolean).join(" · ")}</span>
          <span className="shrink-0 tabular-nums">{euroAnalisi.format(prezzoNetto(r.prezzo, r.sconto_pct))} / {r.unita}</span>
        </Button>
      </li>)}
    </ul>}
    {visibili.length > 25 && <p className="text-xs text-muted-foreground">Affina la ricerca per vedere gli altri articoli.</p>}
  </section>;
}
