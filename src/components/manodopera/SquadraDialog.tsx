/**
 * Nuova squadra / modifica squadra (Manodopera e Mezzi, 26/09/2026).
 *
 * Nome, colore, chi ci lavora e il responsabile: uno della squadra o un'altra
 * persona dell'azienda. Un operaio sta in una squadra per volta: sceglierlo
 * qui lo sposta dalla sua squadra di prima (lo diciamo accanto al nome).
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Crown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import {
  COLORI_SQUADRA, messaggioErroreOperai, useOperai, usePersoneSquadra, useSalvaSquadra, type Squadra,
} from "@/hooks/useOperai";
import { cn } from "@/lib/utils";

const NESSUNO = "__nessuno__";

export function SquadraDialog({
  aperto,
  onAperto,
  squadra = null,
  preselezionati = [],
  onSalvata,
}: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  /** null = nuova squadra. */
  squadra?: Squadra | null;
  /** Operai già scelti quando si apre (es. «Aggiungi a una squadra» da un operaio). */
  preselezionati?: string[];
  onSalvata?: (id: string) => void;
}) {
  const salva = useSalvaSquadra();
  const { data: operai = [] } = useOperai();
  const { data: persone = [] } = usePersoneSquadra(aperto);

  const [nome, setNome] = useState("");
  const [colore, setColore] = useState<string>(COLORI_SQUADRA[0]);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [responsabile, setResponsabile] = useState<string>(NESSUNO);
  const [cerca, setCerca] = useState("");

  useEffect(() => {
    if (!aperto) return;
    setNome(squadra?.nome ?? "");
    setColore(squadra?.colore ?? COLORI_SQUADRA[0]);
    setScelti(new Set(squadra ? squadra.componenti.map((c) => c.id) : preselezionati));
    setResponsabile(squadra?.responsabile?.id ?? NESSUNO);
    setCerca("");
    // preselezionati: solo all'apertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, squadra]);

  const attivi = useMemo(() => operai.filter((o) => o.attivo), [operai]);
  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return attivi;
    return attivi.filter((o) => [o.nome, o.cognome, o.mansione].some((x) => x?.toLowerCase().includes(q)));
  }, [attivi, cerca]);

  // Il nome si trova anche prima che arrivi l'elenco delle persone: per il
  // responsabile già scelto lo conosce la squadra stessa.
  const nomeDi = (id: string) => {
    const p = persone.find((x) => x.id === id)
      ?? attivi.find((x) => x.id === id)
      ?? (squadra?.responsabile?.id === id ? squadra.responsabile : null);
    return p ? `${p.nome} ${p.cognome}` : "Responsabile scelto";
  };
  const componentiScelti = attivi.filter((o) => scelti.has(o.id));
  const altrePersone = persone.filter((p) => !scelti.has(p.id));

  const alterna = (id: string) =>
    setScelti((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Dai un nome alla squadra.");
      return;
    }
    salva.mutate(
      {
        id: squadra?.id ?? null,
        dati: {
          nome: nome.trim(),
          colore,
          responsabile_id: responsabile === NESSUNO ? null : responsabile,
          componenti: [...scelti],
        },
      },
      {
        onSuccess: (id) => {
          toast.success(squadra ? "Squadra aggiornata" : `«${nome.trim()}» è pronta: la trovi nelle commesse`);
          onAperto(false);
          onSalvata?.(id);
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare la squadra. Riprova tra qualche secondo.")),
      },
    );
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !salva.isPending && onAperto(o)}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{squadra ? "Modifica squadra" : "Nuova squadra"}</DialogTitle>
          <DialogDescription>
            Dai un nome, scegli chi ci lavora e chi la guida. Poi la metti sulle commesse: i suoi operai si trovano il cantiere nell'app.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={invia} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="squadra-nome">Nome della squadra</Label>
                <Input
                  id="squadra-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Es. Squadra Posa Nord"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium" id="squadra-colore">Colore</span>
                <div role="radiogroup" aria-labelledby="squadra-colore" className="flex flex-wrap gap-1.5 pt-1">
                  {COLORI_SQUADRA.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={colore === c}
                      aria-label={`Colore ${c}`}
                      onClick={() => setColore(c)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        colore === c && "ring-2 ring-slate-900",
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {colore === c && <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <Label htmlFor="squadra-cerca">Chi ci lavora</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {scelti.size === 1 ? "1 operaio" : `${scelti.size} operai`}
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="squadra-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un operaio" className="pl-9" autoComplete="off" />
              </div>
              {attivi.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  Non ci sono ancora operai. Aggiungili dalla scheda Operai, poi torna qui.
                </p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {visibili.map((o) => {
                    const dentro = scelti.has(o.id);
                    const altrove = o.squadra_id && o.squadra_id !== squadra?.id ? o.squadra : null;
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={dentro}
                          onClick={() => alterna(o.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50",
                            dentro && "bg-orange-50/60",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              dentro ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white",
                            )}
                          >
                            {dentro && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <AvatarOperaio nome={o.nome} cognome={o.cognome} colore={o.colore_avatar} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{o.nome} {o.cognome}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {o.mansione ?? "Operaio"}
                              {altrove && (dentro
                                ? <span className="text-orange-700"> · lascia «{altrove}»</span>
                                : <span> · ora in «{altrove}»</span>)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="squadra-responsabile" className="flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />Responsabile
              </Label>
              <Select value={responsabile} onValueChange={setResponsabile}>
                <SelectTrigger id="squadra-responsabile">
                  <SelectValue placeholder="Scegli chi guida la squadra">
                    {responsabile === NESSUNO ? "Nessun responsabile" : nomeDi(responsabile)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>Nessun responsabile</SelectItem>
                  {responsabile !== NESSUNO && !scelti.has(responsabile) && !persone.some((p) => p.id === responsabile) && (
                    <SelectItem value={responsabile}>{nomeDi(responsabile)}</SelectItem>
                  )}
                  {componentiScelti.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Della squadra</SelectLabel>
                      {componentiScelti.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.nome} {o.cognome}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {altrePersone.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Altre persone dell'azienda</SelectLabel>
                      {altrePersone.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} {p.cognome}{p.mansione ? ` · ${p.mansione}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Può essere uno della squadra o un'altra persona, per esempio il geometra. Sulla commessa può fare da capocantiere.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t px-5 py-3 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onAperto(false)} disabled={salva.isPending}>Annulla</Button>
            <Button
              type="submit"
              disabled={salva.isPending}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
            >
              {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {squadra ? "Salva" : "Crea squadra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
