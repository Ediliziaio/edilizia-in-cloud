import { verificaPiva } from "../../../supabase/functions/_shared/controlliDocumento";
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
const valore = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
const oggetto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const numero = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "Da verificare"
    : n.toLocaleString(intlCampo(), { maximumFractionDigits: 6 });
export function RigheLetteBolla({
  righe,
  documento,
  nomeFile,
}: {
  righe: DDTRigaNuova[];
  documento: Record<string, unknown> | null;
  nomeFile: string;
}) {
  const t = useT();
  const luogo = oggetto(documento?.luogo_destinazione);
  const mittente = oggetto(documento?.mittente);
  const indirizzo = [
    luogo.ragione_sociale,
    luogo.indirizzo,
    luogo.cap,
    luogo.comune,
    luogo.provincia,
  ]
    .map(valore)
    .filter(Boolean)
    .join(" · ");
  const causale = valore(oggetto(documento?.intestazione).causale);
  const note = valore(oggetto(documento?.riferimenti).note_libere);
  return (
    <div className="space-y-2">
      {valore(mittente.partita_iva) && (
        <p className="text-xs text-muted-foreground">{t("P.IVA letta: {partita_iva}", { partita_iva: String(valore(mittente.partita_iva) ?? "") })}</p>
      )}
      {verificaPiva(mittente.partita_iva) === "non_valida" && (
        <p role="alert" className="text-xs font-medium text-amber-800">
          {t("Partita IVA letta incompleta o non valida: controllala sul documento prima di scegliere il fornitore.")}
        </p>
      )}
      {indirizzo && (
        <p className="text-xs">
          <span className="font-medium">{t("Consegna sul documento:")}</span>{" "}
          {indirizzo}{t(". Controlla la destinazione e la commessa qui sopra.")}
        </p>
      )}
      {causale && (
        <p className="text-xs">
          <span className="font-medium">{t("Causale:")}</span> {causale}
        </p>
      )}
      {note && (
        <details className="rounded-md bg-muted/40 p-2 text-xs">
          <summary className="cursor-pointer font-medium">
            {t("Annotazioni sul documento")}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
            {note}
          </p>
        </details>
      )}
      <details className="rounded-md border bg-background p-2">
        <summary className="cursor-pointer text-xs font-medium">{t("Controlla le righe lette ({n}) · {nomeFile}", { n: righe.length, nomeFile: String(nomeFile ?? "") })}</summary>
        <p className="my-2 text-xs text-muted-foreground">
          {t("Confronta articoli, unità e quantità con l’originale. Un prezzo assente resta da definire.")}
        </p>
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[480px] text-left text-xs"
            aria-label={t("Righe lette {nomeFile}", { nomeFile: String(nomeFile ?? "") })}
          >
            <thead>
              <tr className="border-b">
                <th className="p-2">{t("Codice")}</th>
                <th className="p-2">{t("Articolo")}</th>
                <th className="p-2">UM</th>
                <th className="p-2 text-right">{t("Quantità")}</th>
                <th className="p-2 text-right">{t("Prezzo unitario")}</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={i} className="border-b align-top last:border-0">
                  <td className="p-2">{r.codice_articolo || "—"}</td>
                  <td className="whitespace-pre-wrap p-2">
                    {r.descrizione ||
                      r.testo_grezzo ||
                      t("Descrizione da verificare")}
                  </td>
                  <td className="p-2">{r.unita_misura || t("Da verificare")}</td>
                  <td className="p-2 text-right">{numero(r.quantita)}</td>
                  <td className="p-2 text-right">
                    {r.prezzo_unitario == null
                      ? t("Non indicato")
                      : `${numero(r.prezzo_unitario)} €`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
