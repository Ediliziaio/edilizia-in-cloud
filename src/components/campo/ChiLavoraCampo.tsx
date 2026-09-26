/**
 * «Con chi lavori» nella pagina del cantiere (26/09/2026): la mia squadra coi
 * nomi dei colleghi, caposquadra e capocantiere col bottone per chiamarli, e
 * chi altro c'è oggi (solo i nomi di squadre e ditte). La ditta vede solo il
 * suo referente. Ore e timbrature degli altri restano a chi comanda.
 */
import { Link } from "react-router-dom";
import { Phone, Users } from "lucide-react";
import { linkTelefono, useChiLavora, type Contatto } from "@/hooks/campo/useCampoGiornata";

function Persona({ ruolo, contatto }: { ruolo: string; contatto: Contatto }) {
  const tel = linkTelefono(contatto.telefono);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{ruolo}: </span>
        <span className="font-semibold">{contatto.nome}</span>
      </p>
      {tel && (
        <a href={tel} aria-label={`Chiama ${contatto.nome}`}
           className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border bg-background px-3 text-xs font-semibold active:bg-muted">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />Chiama
        </a>
      )}
    </div>
  );
}

export function ChiLavoraCampo({ orderId }: { orderId: string }) {
  const { data } = useChiLavora(orderId);
  if (!data) return null;

  const { mie_squadre: squadre, anche_oggi: altri } = data;
  const capoSquadra = squadre.some((s) => s.sono_caposquadra);
  const vedeChiCe = data.sono_capocantiere || capoSquadra;
  const niente = !data.capocantiere && !data.sono_capocantiere && squadre.length === 0 && altri.length === 0;
  if (niente) return null;

  return (
    <section aria-labelledby="chi-lavora" className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
      <p id="chi-lavora" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Con chi lavori</p>

      {squadre.map((s) => {
        const compagni = s.compagni.filter((c) => !c.sei_tu).map((c) => c.nome).filter(Boolean);
        return (
          <div key={s.id} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.colore ?? "#94a3b8" }} aria-hidden="true" />
              {s.nome}
              {!s.oggi_qui && <span className="font-normal text-muted-foreground">· oggi non è qui</span>}
            </p>
            {s.sono_caposquadra
              ? <p className="text-sm font-semibold text-primary">Il caposquadra sei tu</p>
              : s.caposquadra && <Persona ruolo="Caposquadra" contatto={s.caposquadra} />}
            {compagni.length > 0 && (
              <p className="text-sm"><span className="text-muted-foreground">Con te: </span>{compagni.join(", ")}</p>
            )}
          </div>
        );
      })}

      {data.sono_capocantiere
        ? <p className="text-sm font-semibold text-primary">Il capocantiere sei tu</p>
        : data.capocantiere
          ? <Persona ruolo="Capocantiere" contatto={data.capocantiere} />
          : <p className="text-sm text-muted-foreground">Il capocantiere non è ancora stato scelto.</p>}

      {altri.length > 0 && (
        <p className="text-sm"><span className="text-muted-foreground">Oggi ci sono anche: </span>{altri.join(", ")}</p>
      )}

      {vedeChiCe && (
        <Link to={`/campo/squadra/${orderId}`}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-50 text-sm font-semibold text-orange-800 active:bg-orange-100">
          <Users className="h-4 w-4" aria-hidden="true" />Chi c'è oggi
        </Link>
      )}
    </section>
  );
}
