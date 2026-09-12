/**
 * La libreria di piattaforma delle marche e delle serie di profilo.
 *
 * È il livello che mancava sopra le tipologie: un serramentista che entra dice
 * «monto Aluplast Ideal 5000», e da qui quella frase diventa un listino. Il
 * superadmin tiene in ordine l'elenco; l'azienda poi la importa dal suo Listino
 * con "Aggiungi una serie".
 *
 * I dati tecnici (profondità, camere, Uw) si compilano dalla scheda del
 * fornitore: restano vuoti finché qualcuno non li ha sotto gli occhi, perché un
 * numero sbagliato qui finisce su ogni preventivo di ogni azienda.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Layers, Loader2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ETICHETTA_FASCIA, ETICHETTA_MATERIALE, type FasciaSerie } from "@/hooks/useSerieSerramenti";

interface Marca {
  id: string;
  nome: string;
  slug: string;
  paese: string | null;
  materiali: string[];
  is_active: boolean;
  sort_order: number;
}

interface Serie {
  id: string;
  marca_id: string;
  nome: string;
  slug: string;
  materiale: string;
  profondita_mm: number | null;
  camere: number | null;
  guarnizioni: number | null;
  uw_min: number | null;
  fascia: FasciaSerie | null;
  differenza_pct: number;
  is_active: boolean;
  sort_order: number;
}

/** Il nome diventa uno slug stabile: è la chiave della linea nel listino. */
function slugifica(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const MATERIALI = ["pvc", "alluminio", "legno", "legno_alluminio", "acciaio"] as const;
const FASCE: FasciaSerie[] = ["basic", "medium", "top"];

export function LibreriaMarcheSerie() {
  const qc = useQueryClient();
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [marcaInModifica, setMarcaInModifica] = useState<Partial<Marca> | null>(null);
  const [serieInModifica, setSerieInModifica] = useState<Partial<Serie> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-serramenti-libreria"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [m, s] = await Promise.all([
        db.from("serramenti_marche").select("*").order("sort_order").order("nome"),
        db.from("serramenti_serie").select("*").order("sort_order").order("nome"),
      ]);
      if (m.error) throw m.error;
      if (s.error) throw s.error;
      return { marche: (m.data ?? []) as Marca[], serie: (s.data ?? []) as Serie[] };
    },
  });

  const seriePerMarca = useMemo(() => {
    const mappa = new Map<string, Serie[]>();
    for (const s of data?.serie ?? []) {
      const elenco = mappa.get(s.marca_id);
      if (elenco) elenco.push(s);
      else mappa.set(s.marca_id, [s]);
    }
    return mappa;
  }, [data]);

  const salva = useMutation({
    mutationFn: async (p: { tabella: "serramenti_marche" | "serramenti_serie"; riga: Record<string, unknown> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { id, ...campi } = p.riga as { id?: string };
      const q = id
        ? db.from(p.tabella).update(campi).eq("id", id)
        : db.from(p.tabella).insert(p.riga);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-serramenti-libreria"] });
      void qc.invalidateQueries({ queryKey: ["serramenti-libreria"] });
      toast.success("Libreria aggiornata");
      setMarcaInModifica(null);
      setSerieInModifica(null);
    },
    onError: (e: Error) => toast.error("Non sono riuscito a salvare", { description: e.message }),
  });

  const apriChiudi = (id: string) =>
    setAperte((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Marche e serie di profilo
          </CardTitle>
          <CardDescription>
            Il livello sopra le tipologie. L'azienda importa una serie e se la
            ritrova come linea dentro le finestre che ha già, senza duplicare il
            listino.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMarcaInModifica({ nome: "", materiali: ["pvc"], is_active: true, sort_order: 50 })}
        >
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Marca
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading && (
          <p className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carico la libreria…
          </p>
        )}
        <ul className="divide-y">
          {(data?.marche ?? []).map((m) => {
            const serie = seriePerMarca.get(m.id) ?? [];
            const aperta = aperte.has(m.id);
            return (
              <li key={m.id}>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => apriChiudi(m.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                    aria-expanded={aperta}
                  >
                    {aperta ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="font-medium">{m.nome}</span>
                    {m.paese && <span className="text-xs text-muted-foreground">{m.paese}</span>}
                    <span className="text-xs text-muted-foreground">
                      {m.materiali.map((x) => ETICHETTA_MATERIALE[x] ?? x).join(" · ")}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {serie.length} serie
                    </Badge>
                    {!m.is_active && (
                      <Badge variant="outline" className="text-[10px]">
                        nascosta
                      </Badge>
                    )}
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => setMarcaInModifica(m)} aria-label={`Modifica ${m.nome}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSerieInModifica({
                        marca_id: m.id,
                        nome: "",
                        materiale: m.materiali[0] ?? "pvc",
                        fascia: "medium",
                        differenza_pct: 0,
                        is_active: true,
                        sort_order: (serie.at(-1)?.sort_order ?? 0) + 1,
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Serie
                  </Button>
                </div>

                {aperta && (
                  <ul className="bg-muted/30 border-t divide-y">
                    {serie.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 pl-10 pr-4 py-2 text-sm">
                        <span className="flex-1">
                          {s.nome}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {ETICHETTA_MATERIALE[s.materiale] ?? s.materiale}
                            {s.profondita_mm ? ` · ${s.profondita_mm} mm` : ""}
                            {s.camere ? ` · ${s.camere} camere` : ""}
                            {s.uw_min ? ` · Uw ${s.uw_min}` : ""}
                          </span>
                        </span>
                        {s.fascia && (
                          <Badge variant="secondary" className="text-[10px]">
                            {ETICHETTA_FASCIA[s.fascia]}
                          </Badge>
                        )}
                        <span className="text-xs tabular-nums text-muted-foreground w-14 text-right">
                          {s.differenza_pct > 0 ? "+" : ""}
                          {s.differenza_pct}%
                        </span>
                        {!s.is_active && (
                          <Badge variant="outline" className="text-[10px]">
                            nascosta
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setSerieInModifica(s)} aria-label={`Modifica ${s.nome}`}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                    {serie.length === 0 && (
                      <li className="pl-10 pr-4 py-3 text-sm text-muted-foreground">
                        Nessuna serie: aggiungine una con il pulsante qui sopra.
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>

      {/* Marca */}
      <Dialog open={marcaInModifica !== null} onOpenChange={(o) => !o && setMarcaInModifica(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{marcaInModifica?.id ? "Modifica marca" : "Nuova marca"}</DialogTitle>
            <DialogDescription>Il nome è quello che vedrà il serramentista.</DialogDescription>
          </DialogHeader>
          {marcaInModifica && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="marca-nome">Nome</Label>
                <Input
                  id="marca-nome"
                  value={marcaInModifica.nome ?? ""}
                  onChange={(e) => setMarcaInModifica({ ...marcaInModifica, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca-paese">Paese</Label>
                <Input
                  id="marca-paese"
                  value={marcaInModifica.paese ?? ""}
                  onChange={(e) => setMarcaInModifica({ ...marcaInModifica, paese: e.target.value })}
                  placeholder="DE, IT, BE…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Materiali</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIALI.map((mat) => {
                    const scelti = marcaInModifica.materiali ?? [];
                    const dentro = scelti.includes(mat);
                    return (
                      <button
                        key={mat}
                        type="button"
                        onClick={() =>
                          setMarcaInModifica({
                            ...marcaInModifica,
                            materiali: dentro ? scelti.filter((x) => x !== mat) : [...scelti, mat],
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          dentro ? "border-blue-500 bg-blue-50 text-blue-800" : "border-border"
                        }`}
                      >
                        {ETICHETTA_MATERIALE[mat]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={marcaInModifica.is_active ?? true}
                  onCheckedChange={(v) => setMarcaInModifica({ ...marcaInModifica, is_active: v })}
                />
                Visibile alle aziende
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarcaInModifica(null)}>
              Annulla
            </Button>
            <Button
              disabled={!marcaInModifica?.nome?.trim() || salva.isPending}
              onClick={() =>
                marcaInModifica &&
                salva.mutate({
                  tabella: "serramenti_marche",
                  riga: {
                    ...(marcaInModifica.id ? { id: marcaInModifica.id } : {}),
                    nome: marcaInModifica.nome?.trim(),
                    slug: marcaInModifica.slug ?? slugifica(marcaInModifica.nome ?? ""),
                    paese: marcaInModifica.paese?.trim() || null,
                    materiali: marcaInModifica.materiali ?? [],
                    is_active: marcaInModifica.is_active ?? true,
                    sort_order: marcaInModifica.sort_order ?? 50,
                  },
                })
              }
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Serie */}
      <Dialog open={serieInModifica !== null} onOpenChange={(o) => !o && setSerieInModifica(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{serieInModifica?.id ? "Modifica serie" : "Nuova serie"}</DialogTitle>
            <DialogDescription>
              Profondità, camere e Uw si copiano dalla scheda del fornitore: lasciali
              vuoti finché non li hai davanti.
            </DialogDescription>
          </DialogHeader>
          {serieInModifica && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="serie-nome">Nome</Label>
                  <Input
                    id="serie-nome"
                    value={serieInModifica.nome ?? ""}
                    onChange={(e) => setSerieInModifica({ ...serieInModifica, nome: e.target.value })}
                    placeholder="Ideal 5000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="serie-mat">Materiale</Label>
                  <select
                    id="serie-mat"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={serieInModifica.materiale ?? "pvc"}
                    onChange={(e) => setSerieInModifica({ ...serieInModifica, materiale: e.target.value })}
                  >
                    {MATERIALI.map((mat) => (
                      <option key={mat} value={mat}>
                        {ETICHETTA_MATERIALE[mat]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="serie-fascia">Fascia</Label>
                  <select
                    id="serie-fascia"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={serieInModifica.fascia ?? "medium"}
                    onChange={(e) =>
                      setSerieInModifica({ ...serieInModifica, fascia: e.target.value as FasciaSerie })
                    }
                  >
                    {FASCE.map((f) => (
                      <option key={f} value={f}>
                        {ETICHETTA_FASCIA[f]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="serie-diff-admin">Scostamento suggerito (%)</Label>
                  <Input
                    id="serie-diff-admin"
                    className="text-right"
                    inputMode="decimal"
                    value={String(serieInModifica.differenza_pct ?? 0)}
                    onChange={(e) =>
                      setSerieInModifica({
                        ...serieInModifica,
                        differenza_pct: Number(e.target.value.replace(",", ".")) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                {([
                  ["profondita_mm", "Profondità (mm)"],
                  ["camere", "Camere"],
                  ["guarnizioni", "Guarnizioni"],
                  ["uw_min", "Uw minimo"],
                ] as const).map(([campo, etichetta]) => (
                  <div key={campo} className="space-y-1.5">
                    <Label htmlFor={`serie-${campo}`} className="text-xs">
                      {etichetta}
                    </Label>
                    <Input
                      id={`serie-${campo}`}
                      className="text-right"
                      inputMode="decimal"
                      value={serieInModifica[campo] == null ? "" : String(serieInModifica[campo])}
                      onChange={(e) => {
                        const grezzo = e.target.value.trim().replace(",", ".");
                        setSerieInModifica({
                          ...serieInModifica,
                          [campo]: grezzo === "" ? null : Number(grezzo),
                        });
                      }}
                    />
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={serieInModifica.is_active ?? true}
                  onCheckedChange={(v) => setSerieInModifica({ ...serieInModifica, is_active: v })}
                />
                Visibile alle aziende
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSerieInModifica(null)}>
              Annulla
            </Button>
            <Button
              disabled={!serieInModifica?.nome?.trim() || salva.isPending}
              onClick={() =>
                serieInModifica &&
                salva.mutate({
                  tabella: "serramenti_serie",
                  riga: {
                    ...(serieInModifica.id ? { id: serieInModifica.id } : {}),
                    marca_id: serieInModifica.marca_id,
                    nome: serieInModifica.nome?.trim(),
                    slug: serieInModifica.slug ?? slugifica(serieInModifica.nome ?? ""),
                    materiale: serieInModifica.materiale ?? "pvc",
                    fascia: serieInModifica.fascia ?? "medium",
                    differenza_pct: serieInModifica.differenza_pct ?? 0,
                    profondita_mm: serieInModifica.profondita_mm ?? null,
                    camere: serieInModifica.camere ?? null,
                    guarnizioni: serieInModifica.guarnizioni ?? null,
                    uw_min: serieInModifica.uw_min ?? null,
                    is_active: serieInModifica.is_active ?? true,
                    sort_order: serieInModifica.sort_order ?? 50,
                  },
                })
              }
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
