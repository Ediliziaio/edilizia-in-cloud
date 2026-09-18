import { describe, expect, it } from "vitest";
import {
  idsCitati,
  scegliInvio,
  scegliIscrizione,
  testoInvito,
  type InvioFatto,
} from "../../../supabase/functions/_shared/outreachRispostaBrand";

// 18/09/2026: l'avviso «Risposta email da X» nominava il brand sbagliato —
// pescava la prima iscrizione attiva del contatto, e chi è iscritto a tutti e
// tre i servizi rispondeva a ThermoDMR e risultava di Marketing Edile.
const EIC = "brand-eic";
const TDM = "brand-thermodmr";

const invio = (p: Partial<InvioFatto>): InvioFatto => ({
  enrollment_id: null, brand_id: null, sender_account_id: null, message_id: null, sent_at: null, ...p,
});

describe("a quale brand ha risposto", () => {
  it("l'header citato vince su tutto: è la prova", () => {
    const invii = [
      invio({ enrollment_id: "e-tdm", brand_id: TDM, sender_account_id: "c2", message_id: "<abc@tdm>", sent_at: "2026-09-10T08:00:00Z" }),
      invio({ enrollment_id: "e-eic", brand_id: EIC, sender_account_id: "c1", message_id: "<xyz@eic>", sent_at: "2026-09-17T08:00:00Z" }),
    ];
    const scelta = scegliInvio(invii, { casellaId: "c1", brandCasella: EIC, citati: idsCitati("<abc@tdm>", []) });
    expect(scelta).toEqual({ invio: invii[0], motivo: "header" });
  });

  it("senza header conta la casella che ha ricevuto, non la più recente in assoluto", () => {
    const invii = [
      invio({ enrollment_id: "e-eic", brand_id: EIC, sender_account_id: "c1", sent_at: "2026-09-12T08:00:00Z" }),
      invio({ enrollment_id: "e-tdm", brand_id: TDM, sender_account_id: "c2", sent_at: "2026-09-17T08:00:00Z" }),
    ];
    const scelta = scegliInvio(invii, { casellaId: "c1", brandCasella: EIC });
    expect(scelta?.invio.enrollment_id).toBe("e-eic");
    expect(scelta?.motivo).toBe("casella");
  });

  it("se quella casella non ha mai scritto, vale un'altra casella dello stesso brand", () => {
    const invii = [
      invio({ enrollment_id: "e-eic", brand_id: EIC, sender_account_id: "c9", sent_at: "2026-09-12T08:00:00Z" }),
      invio({ enrollment_id: "e-tdm", brand_id: TDM, sender_account_id: "c2", sent_at: "2026-09-17T08:00:00Z" }),
    ];
    expect(scegliInvio(invii, { casellaId: "c1", brandCasella: EIC })?.motivo).toBe("brand");
  });

  it("nessun invio a quell'indirizzo: non si inventa un brand", () => {
    expect(scegliInvio([], { casellaId: "c1", brandCasella: EIC })).toBeNull();
  });

  it("i Message-ID si confrontano senza <> e senza maiuscole", () => {
    expect(idsCitati(" <A@B.it> ", ["<c@d.it> <e@f.it>", null as unknown as string])).toEqual(["a@b.it", "c@d.it", "e@f.it"]);
    const invii = [invio({ enrollment_id: "e1", message_id: "A@B.it", sent_at: "2026-09-17T08:00:00Z" })];
    expect(scegliInvio(invii, { citati: ["<a@b.it>"] })?.motivo).toBe("header");
  });

  it("ripiego sulle iscrizioni: si preferisce il brand della casella", () => {
    const iscrizioni = [
      { id: "i-tdm", brandId: TDM, iscrittoIl: "2026-09-16T10:00:00Z" },
      { id: "i-eic", brandId: EIC, iscrittoIl: "2026-09-15T10:00:00Z" },
    ];
    expect(scegliIscrizione(iscrizioni, EIC)).toEqual({ id: "i-eic", brandId: EIC });
    // Nessun brand sulla casella: la più recente.
    expect(scegliIscrizione(iscrizioni, null)).toEqual({ id: "i-tdm", brandId: TDM });
    expect(scegliIscrizione([], EIC)).toBeNull();
  });

  it("la riga «Invito verificato» dice la verità, anche quando è scomoda", () => {
    const perCasella = scegliInvio(
      [invio({ brand_id: EIC, sender_account_id: "c1", sent_at: "2026-09-17T08:00:00Z" })],
      { casellaId: "c1", brandCasella: EIC },
    );
    expect(testoInvito(perCasella, "info@ediliziaincloud.it")).toBe("sì, scritta il 17/09/2026 da info@ediliziaincloud.it");
    expect(testoInvito(null, "info@ediliziaincloud.it")).toContain("nessuna email risulta inviata");
    const altroBrand = scegliInvio(
      [invio({ brand_id: TDM, sender_account_id: "c2", sent_at: "2026-09-17T08:00:00Z" })],
      { casellaId: "c1", brandCasella: EIC },
    );
    expect(testoInvito(altroBrand, "info@ediliziaincloud.it")).toContain("un altro brand");
  });
});
