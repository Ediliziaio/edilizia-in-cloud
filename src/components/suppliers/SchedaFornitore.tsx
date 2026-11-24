import { Building2, CreditCard, MapPin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
import { formatCurrency } from "@/lib/formatters";
import { categorieFornitore } from "@/lib/fornitori/categorieFornitore";
import {
  etichettaRuoloReferente,
  referentiDi,
  sitoFornitore,
  terminiPagamentoTesto,
  type Supplier,
} from "@/lib/suppliers/anagraficaFornitore";
import type { ReactNode } from "react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function Pannello({
  titolo,
  icona,
  children,
}: {
  titolo: string;
  icona: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icona}
        {titolo}
      </h3>
      {children}
    </section>
  );
}
function Dato({ nome, valore }: { nome: string; valore?: ReactNode }) {
  const t = useT();
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{nome}</dt>
      <dd className="mt-1 break-words text-sm">
        {valore || <span className="text-muted-foreground">{t("Non indicato")}</span>}
      </dd>
    </div>
  );
}
function Recapiti({
  email,
  phone,
}: {
  email?: string | null;
  phone?: string | null;
}) {
  const t = useT();
  return (
    <dl className="space-y-3">
      <Dato
        nome="Email"
        valore={
          email && (
            <a
              className="break-all text-primary hover:underline"
              href={`mailto:${encodeURIComponent(email)}`}
            >
              {email}
            </a>
          )
        }
      />
      <Dato
        nome={t("Telefono")}
        valore={
          phone && (
            <a
              className="text-primary hover:underline"
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            >
              {phone}
            </a>
          )
        }
      />
    </dl>
  );
}

export function SchedaFornitore({
  supplier: s,
  onModifica,
}: {
  supplier: Supplier;
  onModifica?: () => void;
}) {
  const t = useT();
  const sito = sitoFornitore(s.website);
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-3">
      <Pannello
        titolo={t("Referente / responsabile")}
        icona={<UserRound className="h-4 w-4 text-primary" />}
      >
        <dl className="grid gap-3">
          <Dato nome={t("Nome e cognome")} valore={s.contact_name} />
          <Dato nome={t("Ruolo / reparto")} valore={s.contact_role} />
        </dl>
        <Recapiti email={s.contact_email} phone={s.contact_phone} />
        {!s.contact_name && onModifica && (
          <Button size="sm" variant="outline" onClick={onModifica}>
            {t("Aggiungi referente")}
          </Button>
        )}
        {referentiDi(s.altri_referenti).length > 0 && (
          <div className="space-y-3 border-t pt-3">
            {referentiDi(s.altri_referenti).map((r, i) => (
              <div key={i} className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">{etichettaRuoloReferente(r.ruolo)}</p>
                {r.nome && <p className="text-sm font-medium">{r.nome}</p>}
                {r.email && (
                  <a className="block break-all text-sm text-primary hover:underline" href={`mailto:${encodeURIComponent(r.email)}`}>
                    {r.email}
                  </a>
                )}
                {r.telefono && (
                  <a className="block text-sm text-primary hover:underline" href={`tel:${r.telefono.replace(/[^\d+]/g, "")}`}>
                    {r.telefono}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Pannello>
      <Pannello
        titolo={t("Contatti")}
        icona={<Building2 className="h-4 w-4 text-primary" />}
      >
        <p className="text-xs text-muted-foreground">
          {t("Recapiti generali dell’azienda")}
        </p>
        <Recapiti email={s.email} phone={s.phone} />
        <dl className="space-y-3">
          <Dato
            nome={t("Email per gli ordini")}
            valore={
              s.email_ordini && (
                <a className="break-all text-primary hover:underline" href={`mailto:${encodeURIComponent(s.email_ordini)}`}>
                  {s.email_ordini}
                </a>
              )
            }
          />
          <Dato
            nome={t("Sito web")}
            valore={
              sito ? (
                <a
                  className="break-all text-primary hover:underline"
                  href={sito}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.website}
                </a>
              ) : (
                s.website
              )
            }
          />
        </dl>
      </Pannello>
      <Pannello
        titolo={t("Sede e dati fiscali")}
        icona={<MapPin className="h-4 w-4 text-primary" />}
      >
        <dl className="space-y-3">
          <Dato
            nome={t("Indirizzo")}
            valore={[s.address, s.postal_code, s.city, s.province, s.country]
              .filter(Boolean)
              .join(", ")}
          />
          <Dato nome="P.IVA" valore={s.vat_number} />
          <Dato nome={t("Codice fiscale")} valore={s.fiscal_code} />
          <Dato nome={t("Categorie merceologiche")} valore={categorieFornitore(s).join(" · ")} />
          <Dato nome="PEC" valore={s.pec} />
          <Dato nome={t("Codice destinatario SDI")} valore={s.codice_sdi} />
          <Dato
            nome={t("Aliquota IVA")}
            valore={s.vat_rate == null ? undefined : `${s.vat_rate}%`}
          />
          {s.inversione_contabile && <Dato nome={t("Reverse charge")} valore={t("Sì, sui nuovi ordini")} />}
        </dl>
      </Pannello>
      <div className="xl:col-span-2">
        <Pannello
          titolo={t("Pagamenti e condizioni d’acquisto")}
          icona={<CreditCard className="h-4 w-4 text-primary" />}
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Dato
              nome={t("Modalità di pagamento")}
              valore={
                s.payment_method
                  ? etichettaPagamentoFornitore(s.payment_method)
                  : undefined
              }
            />
            <Dato
              nome="IBAN"
              valore={
                s.iban && (
                  <span className="break-all font-mono text-xs">{s.iban}</span>
                )
              }
            />
            <Dato nome={t("Banca")} valore={s.bank_name} />
            <Dato nome={t("Termini di pagamento")} valore={terminiPagamentoTesto(s) ?? undefined} />
            <Dato nome={t("Il nostro codice cliente")} valore={s.codice_cliente} />
            <Dato
              nome={t("Sconto concordato")}
              valore={s.sconto_percentuale == null ? undefined : `${String(s.sconto_percentuale).replace(".", ",")}%`}
            />
            <Dato
              nome={t("Consegna indicativa")}
              valore={
                s.lead_time_days == null
                  ? undefined
                  : t(s.lead_time_days === 1 ? "{n} giorno" : "{n} giorni", { n: s.lead_time_days })
              }
            />
            <Dato
              nome={t("Ordine minimo")}
              valore={
                s.min_order_amount == null
                  ? undefined
                  : formatCurrency(s.min_order_amount)
              }
            />
            <Dato
              nome={t("Fido concordato")}
              valore={
                s.credit_limit == null
                  ? undefined
                  : formatCurrency(s.credit_limit)
              }
            />
          </dl>
          <p className="text-xs text-muted-foreground">
            {t("Dati di riferimento: le condizioni effettive si concordano nel singolo ordine d’acquisto.")}
          </p>
        </Pannello>
      </div>
      {(s.ritiro_indirizzo || s.ritiro_citta || s.ritiro_note) && (
        <Pannello
          titolo={t("Ritiro merce / magazzino")}
          icona={<MapPin className="h-4 w-4 text-primary" />}
        >
          <dl className="space-y-3">
            <Dato nome={t("Indirizzo")} valore={[s.ritiro_indirizzo, s.ritiro_citta].filter(Boolean).join(", ")} />
            <Dato nome={t("Orari e note")} valore={s.ritiro_note} />
          </dl>
        </Pannello>
      )}
      <Pannello
        titolo={t("Note")}
        icona={<Building2 className="h-4 w-4 text-primary" />}
      >
        <p className="whitespace-pre-wrap break-words text-sm">
          {s.notes || t("Nessuna nota")}
        </p>
      </Pannello>
    </div>
  );
}
