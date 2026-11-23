/**
 * Scelta della categoria di cassa per un movimento: ricerca per nome, codice,
 * categoria o descrizione; solo le voci attive che vanno bene per quel verso
 * (un'uscita non vede le voci di sole entrate, nessuno vede gli ammortamenti).
 * Usato nella colonna Categoria, nel popup del movimento e nel popup di
 * classificazione del Cash flow: un selettore solo, lo stesso dappertutto.
 */
import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { vociPerMovimento, type VoceCatalogo } from "@/lib/finance/cassaVoci";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ScegliVoceCassa({
  catalogo,
  importo,
  selezionata,
  onScegli,
  occupato,
  altezza = "max-h-80",
  autoFocus = true,
}: {
  catalogo: VoceCatalogo[] | undefined;
  /** Con segno: decide se mostrare voci di entrata o di uscita. */
  importo: number;
  selezionata?: string | null;
  onScegli: (voce: VoceCatalogo) => void;
  occupato?: boolean;
  altezza?: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [cerca, setCerca] = useState("");
  const gruppi = useMemo(() => vociPerMovimento(catalogo ?? [], importo, cerca), [catalogo, importo, cerca]);
  const [aperta, setAperta] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Input
        autoFocus={autoFocus}
        placeholder={importo >= 0 ? t("Cerca una voce di entrata…") : t("Cerca una voce di uscita…")}
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        aria-label={t("Cerca una categoria")}
      />
      <div className={cn("overflow-y-auto rounded-md border", altezza)} role="listbox" aria-label={t("Categorie")}>
        {!catalogo ? (
          <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Caricamento catalogo…")}
          </p>
        ) : gruppi.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {t("Nessuna voce trovata. Le voci si attivano o si aggiungono in Controllo di gestione → Configurazione.")}
          </p>
        ) : (
          gruppi.map((g) => (
            <div key={g.categoria.id}>
              <p className="sticky top-0 z-10 border-b bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {g.categoria.nome}
                {g.area && <span className="font-normal"> · {g.area.nome}</span>}
              </p>
              {g.voci.map((v) => {
                const scelta = v.id === selezionata;
                return (
                  <div key={v.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      role="option"
                      aria-selected={scelta}
                      disabled={occupato}
                      onClick={() => onScegli(v)}
                      onMouseEnter={() => setAperta(v.id)}
                      onFocus={() => setAperta(v.id)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-60",
                        v.livello === "sottovoce" && "pl-7",
                        scelta && "bg-primary/5",
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{v.codice}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{v.nome}</span>
                        {aperta === v.id && v.descrizione && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{v.descrizione}</span>
                        )}
                      </span>
                      {scelta && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
