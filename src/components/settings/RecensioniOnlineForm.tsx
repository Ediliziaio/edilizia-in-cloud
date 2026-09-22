import { useId, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAggiornaVotiOnline, useVotiOnline } from "@/hooks/useVotiOnline";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_VOTI_NEL_PDF, ORO_STELLE, PIATTAFORME_RECENSIONI, PUNTI_STELLA, leggiVotiOnline, recensioniScritte, stellePiene, votoScritto,
  type PiattaformaRecensioni,
} from "../../../supabase/functions/_shared/recensioniOnline";

/**
 * Il voto dell'azienda su Google, Trustpilot e simili, per la pagina «Dicono di
 * noi» dei preventivi. Si scrive a mano, com'è sulla scheda: nessun voto di
 * serie, e accanto la data, perché il voto cambia e il preventivo dice di quando è.
 */

interface Riga {
  piattaforma: PiattaformaRecensioni;
  nome: string;
  voto: string;
  numero: string;
  link: string;
  aggiornato: string | null;
}

const oggi = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const comeNumero = (v: string): number | null => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const rigaVuota = (piattaforma: PiattaformaRecensioni): Riga => ({ piattaforma, nome: "", voto: "", numero: "", link: "", aggiornato: null });

function rigaDaSalvato(r: Record<string, unknown>): Riga {
  return {
    piattaforma: (PIATTAFORME_RECENSIONI.some((p) => p.id === r.piattaforma) ? r.piattaforma : "google") as PiattaformaRecensioni,
    nome: typeof r.nome === "string" ? r.nome : "",
    voto: r.voto != null ? String(r.voto).replace(".", ",") : "",
    numero: r.numero != null ? String(r.numero) : "",
    link: typeof r.link === "string" ? r.link : "",
    aggiornato: typeof r.aggiornato === "string" ? r.aggiornato : null,
  };
}

/** Il problema di una riga, se ce n'è uno: detto come lo direbbe una persona. */
function problemaDi(r: Riga): string | null {
  const voto = comeNumero(r.voto);
  if (voto == null) return "Scrivi il voto, per esempio 4,8.";
  if (voto < 1 || voto > 5) return "Il voto va da 1 a 5.";
  if (r.piattaforma === "altro" && !r.nome.trim()) return "Scrivi il nome della piattaforma.";
  const numero = comeNumero(r.numero);
  if (r.numero.trim() && (numero == null || numero < 1 || !Number.isInteger(numero))) return "Il numero di recensioni è un numero intero.";
  return null;
}

function StelleAnteprima({ voto }: { voto: number }) {
  const id = useId();
  return (
    <span className="inline-flex gap-0.5" aria-label={`${votoScritto(voto)} su 5`}>
      {stellePiene(voto).map((pieno, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-${i}`}>
              <stop offset={pieno} stopColor={ORO_STELLE} />
              <stop offset={pieno} stopColor="#D5D9DF" />
            </linearGradient>
          </defs>
          <polygon points={PUNTI_STELLA} fill={`url(#${id}-${i})`} />
        </svg>
      ))}
    </span>
  );
}

export function RecensioniOnlineForm({ canEdit }: { canEdit: boolean }) {
  const { grezzo, caricato } = useVotiOnline();
  if (!caricato) {
    return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carico…</p>;
  }
  // Il modulo riparte da quello che c'è nel database ogni volta che cambia (anche dopo un salvataggio).
  return <ModuloVoti key={JSON.stringify(grezzo)} canEdit={canEdit} salvati={grezzo} />;
}

function ModuloVoti({ canEdit, salvati }: { canEdit: boolean; salvati: unknown[] }) {
  const companyId = useEffectiveCompanyId();
  const aggiorna = useAggiornaVotiOnline();
  const { toast } = useToast();
  const iniziali = useMemo(
    () => salvati.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object").map(rigaDaSalvato),
    [salvati],
  );
  const [righe, setRighe] = useState<Riga[]>(iniziali);
  const [salvando, setSalvando] = useState(false);

  const cambia = (i: number, patch: Partial<Riga>) => setRighe(righe.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const libere = PIATTAFORME_RECENSIONI.filter((p) => p.id === "altro" || !righe.some((r) => r.piattaforma === p.id));
  const problemi = righe.map(problemaDi);

  const salva = async () => {
    if (!companyId || problemi.some(Boolean)) return;
    setSalvando(true);
    try {
      const valore = righe.map((r) => {
        const prima = iniziali.find((x) => x.piattaforma === r.piattaforma && x.nome === r.nome);
        const uguale = prima && comeNumero(prima.voto) === comeNumero(r.voto) && comeNumero(prima.numero) === comeNumero(r.numero);
        return {
          piattaforma: r.piattaforma,
          ...(r.piattaforma === "altro" ? { nome: r.nome.trim() } : {}),
          voto: Math.round((comeNumero(r.voto) ?? 0) * 10) / 10,
          numero: comeNumero(r.numero),
          link: r.link.trim() || null,
          // Il mese che il preventivo stampa: cambia solo quando cambia il voto.
          aggiornato: uguale && prima?.aggiornato ? prima.aggiornato : oggi(),
        };
      });
      // Con i permessi che non bastano l'aggiornamento non dà errore: non tocca righe.
      const { data, error } = await supabase
        .from("companies")
        .update({ recensioni_online: valore } as never)
        .eq("id", companyId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Il tuo utente non può modificare il profilo dell'azienda: chiedi a un amministratore.");
      toast({ title: valore.length ? "Voto salvato: esce nei preventivi" : "Voto tolto dai preventivi" });
      // Rilette dal database, le righe ripartono da lì (il modulo ha per chiave i dati salvati).
      await aggiorna();
    } catch (e) {
      toast({ title: "Non salvato", description: e instanceof Error ? e.message : "Riprova tra poco.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const anteprima = leggiVotiOnline(
    righe.filter((r) => !problemaDi(r)).map((r) => ({ ...r, voto: comeNumero(r.voto), numero: comeNumero(r.numero) })),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Scrivi il voto e il numero di recensioni come li vedi oggi sulla tua scheda. Nel preventivo escono così,
        con il mese in cui li hai scritti: quando cambiano, aggiornali qui. Ne escono al massimo {MAX_VOTI_NEL_PDF}.
      </p>

      {righe.length === 0 ? (
        <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
          Nessun voto: nei preventivi la pagina «Dicono di noi» mostra solo le parole dei clienti scritte nel modello.
        </p>
      ) : null}

      {righe.map((r, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[150px_90px_120px_1fr_auto] items-end">
            <div className="space-y-1">
              <Label className="text-xs">Piattaforma</Label>
              <Select value={r.piattaforma} onValueChange={(v) => cambia(i, { piattaforma: v as PiattaformaRecensioni })} disabled={!canEdit}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIATTAFORME_RECENSIONI.filter((p) => p.id === r.piattaforma || libere.some((l) => l.id === p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`voto-${i}`}>Voto</Label>
              <Input id={`voto-${i}`} className="h-9" inputMode="decimal" placeholder="4,8" value={r.voto} disabled={!canEdit} onChange={(e) => cambia(i, { voto: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`numero-${i}`}>N. recensioni</Label>
              <Input id={`numero-${i}`} className="h-9" inputMode="numeric" placeholder="126" value={r.numero} disabled={!canEdit} onChange={(e) => cambia(i, { numero: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`link-${i}`}>Indirizzo della scheda (facoltativo)</Label>
              <Input id={`link-${i}`} className="h-9" placeholder="g.page/r/…" value={r.link} disabled={!canEdit} onChange={(e) => cambia(i, { link: e.target.value })} />
            </div>
            {canEdit ? (
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-rose-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Togli questo voto" onClick={() => setRighe(righe.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {r.piattaforma === "altro" ? (
            <Input className="h-9" placeholder="Nome della piattaforma, es. Houzz" value={r.nome} disabled={!canEdit} onChange={(e) => cambia(i, { nome: e.target.value })} />
          ) : null}
          {problemi[i] && (r.voto || r.numero) ? <p className="text-xs text-rose-600">{problemi[i]}</p> : null}
        </div>
      ))}

      {anteprima.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {anteprima.map((v) => (
            <div key={`${v.piattaforma}-${v.nome}`} className="rounded-md border-t-2 border-t-primary bg-muted/40 px-3 py-2 min-w-[140px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{v.nome}</p>
              <p className="text-xl font-bold leading-tight">{votoScritto(v.voto)} <span className="text-xs font-normal text-muted-foreground">su 5</span></p>
              <StelleAnteprima voto={v.voto} />
              {recensioniScritte(v.numero) ? <p className="text-xs font-medium mt-0.5">{recensioniScritte(v.numero)}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {righe.length < MAX_VOTI_NEL_PDF ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setRighe([...righe, rigaVuota(libere[0]?.id ?? "altro")])}>
              <Plus className="h-3.5 w-3.5" /> Aggiungi un voto
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={salva} disabled={salvando || problemi.some(Boolean)}>
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Salva
          </Button>
        </div>
      ) : null}
    </div>
  );
}
