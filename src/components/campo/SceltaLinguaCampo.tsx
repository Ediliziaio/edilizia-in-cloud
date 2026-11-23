/**
 * Scelta della lingua dell'app (area operai): un menu a tendina nella scheda «Lingua» del profilo
 * (richiesta del founder, 23/11/2026). Ogni lingua scritta come la legge chi la parla, con il nome italiano
 * sotto la tendina: l'ufficio o un collega può aiutare a trovarla. Sul telefono si apre la ruota del sistema.
 */
import { Languages } from "lucide-react";
import { LINGUE, linguaDa } from "@/lib/campo/lingua/lingue";
import { useLinguaCampo } from "@/lib/campo/lingua/LinguaCampo";

export function SceltaLinguaCampo() {
  const { lingua, scegli, t } = useLinguaCampo();
  return (
    <section id="lingua" aria-labelledby="titolo-lingua" className="rounded-2xl border bg-background p-4 shadow-sm max-sm:p-3">
      <label id="titolo-lingua" htmlFor="scelta-lingua" className="flex items-center gap-2 text-[15px] font-semibold">
        <Languages className="size-4 text-primary" aria-hidden="true" />{t("Lingua dell'app")}
      </label>
      <select id="scelta-lingua" value={lingua.codice}
        onChange={e => { const scelta = linguaDa(e.target.value); if (scelta) scegli(scelta.codice); }}
        className="mt-2 h-12 w-full max-w-sm rounded-xl border bg-background px-3 text-base">
        {LINGUE.map(l => (
          <option key={l.codice} value={l.codice}>
            {l.nome}
          </option>
        ))}
      </select>
      {/* Il nome italiano sotto, non nella tendina: a 390 px «Español (Argentina) — Spagnolo argentino» veniva tagliato. */}
      {lingua.codice !== "it" && <p className="mt-1 text-xs text-muted-foreground" lang="it" dir="ltr">{lingua.nomeItaliano}</p>}
    </section>
  );
}
