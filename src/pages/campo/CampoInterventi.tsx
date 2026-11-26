/**
 * Tutti i miei interventi (manutenzioni, assistenze) da oggi alle prossime 4 settimane, giorno per giorno
 * (26/11/2026). Si arriva dal menu «Altro» → Interventi; ogni scheda apre l'intervento.
 */
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, Loader2, MapPin, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { giornoRoma, interventoFatto, interventoIniziato, oraRoma, spostaGiorno, useMieiInterventi, type InterventoCampo } from "@/lib/campo/interventi";

export default function CampoInterventi() {
  const t = useT();
  const oggi = giornoRoma(new Date().toISOString());
  const { data = [], isLoading, isError, refetch } = useMieiInterventi(spostaGiorno(oggi, -1), spostaGiorno(oggi, 28));
  const perGiorno = new Map<string, InterventoCampo[]>();
  for (const i of data) {
    const g = giornoRoma(i.quando);
    if (g < oggi && interventoFatto(i)) continue; // ieri: solo quelli rimasti da fare
    perGiorno.set(g, [...(perGiorno.get(g) ?? []), i]);
  }
  const nomeGiorno = (g: string) => g === oggi ? t("Oggi") : g === spostaGiorno(oggi, 1) ? t("Domani") : g === spostaGiorno(oggi, -1) ? t("Ieri")
    : new Date(`${g}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
      <h1 className="flex items-center gap-2 text-[17px] font-black"><Wrench className="size-5 text-primary" aria-hidden="true" />{t("Interventi")}</h1>
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : isError ? <p className="text-sm">{t("Non riesco a leggere gli interventi.")} <button type="button" className="font-semibold text-primary underline" onClick={() => void refetch()}>{t("Riprova")}</button></p>
        : perGiorno.size === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("Nessun intervento in programma nelle prossime settimane.")}</div>
        ) : [...perGiorno.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, lista]) => (
          <section key={g} className="space-y-2">
            <h2 className={cn("px-1 text-xs font-bold uppercase tracking-wide", g === oggi ? "text-primary" : "text-muted-foreground")}>{nomeGiorno(g)}</h2>
            <ul className="space-y-2">
              {lista.map(i => {
                const fatto = interventoFatto(i); const inCorso = !fatto && interventoIniziato(i);
                return (
                  <li key={i.id}>
                    <Link to={`/campo/intervento/${i.id}`} className={cn("flex items-start gap-3 rounded-2xl border bg-background p-3 active:bg-muted", fatto && "opacity-70")}>
                      <span className={cn("w-12 shrink-0 rounded-xl py-1.5 text-center text-[13px] font-bold tabular-nums", fatto ? "bg-emerald-50 text-emerald-800" : inCorso ? "bg-blue-50 text-blue-800" : "bg-muted")}>
                        {fatto ? <CheckCircle2 className="mx-auto size-5" aria-label={t("Fatto")} /> : oraRoma(i.quando)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block text-sm font-semibold leading-snug">{i.titolo ?? t("Intervento")}</span>
                        {i.cliente?.nome && <span dir="auto" className="block truncate text-xs text-muted-foreground">{i.cliente.nome}</span>}
                        {i.indirizzo && <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{i.indirizzo}</span></span>}
                      </span>
                      <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
