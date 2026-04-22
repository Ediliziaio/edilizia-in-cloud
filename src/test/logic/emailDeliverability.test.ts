// ============================================================================
// emailDeliverability.test — Test aggregazione deliverability (FASE 11)
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  emptyBucket,
  addToBucket,
  aggregateDeliveryRows,
  deliveryRatePct,
  bounceRatePct,
  spamRatePct,
  rate,
  rangeToCutoff,
  type DeliveryRow,
} from "@/lib/email/deliverabilityAggregation";

describe("emptyBucket", () => {
  it("inizializza tutti i contatori a 0", () => {
    const b = emptyBucket();
    expect(b).toEqual({
      total: 0, sent: 0, delivered: 0, bounced: 0, spam: 0, dropped: 0, failed: 0,
    });
  });
});

describe("addToBucket", () => {
  it("incrementa total per qualsiasi status", () => {
    const b = emptyBucket();
    addToBucket(b, "delivered");
    addToBucket(b, null);          // status ignoto
    addToBucket(b, "unrecognized"); // status non-nell'enum
    expect(b.total).toBe(3);
    expect(b.delivered).toBe(1);
  });

  it("incrementa il contatore corrispondente allo status", () => {
    const b = emptyBucket();
    addToBucket(b, "sent");
    addToBucket(b, "delivered");
    addToBucket(b, "bounced");
    addToBucket(b, "spam");
    addToBucket(b, "dropped");
    addToBucket(b, "failed");
    expect(b).toEqual({
      total: 6, sent: 1, delivered: 1, bounced: 1, spam: 1, dropped: 1, failed: 1,
    });
  });

  it("non incrementa contatori specifici per status sconosciuto", () => {
    const b = emptyBucket();
    addToBucket(b, "rejected"); // non nell'enum → solo total++
    addToBucket(b, null);
    expect(b.total).toBe(2);
    expect(b.sent + b.delivered + b.bounced + b.spam + b.dropped + b.failed).toBe(0);
  });
});

describe("aggregateDeliveryRows", () => {
  const rows: DeliveryRow[] = [
    { stream: "transactional", provider: "resend",        status: "delivered", company_id: "c1", sent_at: "2026-04-20T10:00:00Z" },
    { stream: "transactional", provider: "resend",        status: "delivered", company_id: "c1", sent_at: "2026-04-20T11:00:00Z" },
    { stream: "transactional", provider: "sendgrid",      status: "bounced",   company_id: "c2", sent_at: "2026-04-20T12:00:00Z" },
    { stream: "marketing",     provider: "elastic_email", status: "delivered", company_id: "c1", sent_at: "2026-04-20T13:00:00Z" },
    { stream: "marketing",     provider: "elastic_email", status: "spam",      company_id: "c3", sent_at: "2026-04-20T14:00:00Z" },
    { stream: null,            provider: null,            status: "sent",      company_id: null, sent_at: "2026-04-20T15:00:00Z" },
  ];

  it("aggrega il bucket globale correttamente", () => {
    const r = aggregateDeliveryRows(rows);
    expect(r.global.total).toBe(6);
    expect(r.global.delivered).toBe(3);
    expect(r.global.bounced).toBe(1);
    expect(r.global.spam).toBe(1);
    expect(r.global.sent).toBe(1);
  });

  it("raggruppa per stream con fallback 'unknown'", () => {
    const r = aggregateDeliveryRows(rows);
    expect(r.byStream.transactional.total).toBe(3);
    expect(r.byStream.transactional.delivered).toBe(2);
    expect(r.byStream.transactional.bounced).toBe(1);
    expect(r.byStream.marketing.total).toBe(2);
    expect(r.byStream.unknown.total).toBe(1);
  });

  it("raggruppa per provider con fallback 'unknown'", () => {
    const r = aggregateDeliveryRows(rows);
    expect(r.byProvider.resend.total).toBe(2);
    expect(r.byProvider.sendgrid.total).toBe(1);
    expect(r.byProvider.elastic_email.total).toBe(2);
    expect(r.byProvider.unknown.total).toBe(1);
  });

  it("ordina top companies per volume desc e tronca a 10", () => {
    // c1=3 (2 transactional + 1 marketing), c2=1 bounce, c3=1 spam ; null non conteggiato
    const r = aggregateDeliveryRows(rows);
    expect(r.topCompanies[0]).toMatchObject({ id: "c1", total: 3 });
    expect(r.topCompanies[0].delivered).toBe(3);
    expect(r.topCompanies.length).toBe(3);
    expect(r.topCompanies.every((c) => c.id !== null)).toBe(true);
  });

  it("tronca top companies a 10 anche con molte aziende", () => {
    const many: DeliveryRow[] = Array.from({ length: 15 }, (_, i) => ({
      stream: "transactional",
      provider: "resend",
      status: "delivered",
      company_id: `c${i}`,
      sent_at: "2026-04-20T10:00:00Z",
    }));
    const r = aggregateDeliveryRows(many);
    expect(r.topCompanies.length).toBe(10);
  });

  it("gestisce input vuoto senza crash", () => {
    const r = aggregateDeliveryRows([]);
    expect(r.global).toEqual(emptyBucket());
    expect(r.byStream).toEqual({});
    expect(r.byProvider).toEqual({});
    expect(r.topCompanies).toEqual([]);
  });
});

describe("rate%", () => {
  it("delivery rate: sent+delivered / total", () => {
    expect(deliveryRatePct({ total: 100, sent: 10, delivered: 85, bounced: 3, spam: 1, dropped: 0, failed: 1 })).toBe(95);
  });

  it("bounce rate: bounced / total", () => {
    expect(bounceRatePct({ total: 100, sent: 0, delivered: 95, bounced: 5, spam: 0, dropped: 0, failed: 0 })).toBe(5);
  });

  it("spam rate: spam / total", () => {
    expect(spamRatePct({ total: 1000, sent: 0, delivered: 990, bounced: 0, spam: 3, dropped: 0, failed: 7 })).toBe(0.3);
  });

  it("tutti i rate restituiscono 0 quando total è 0 (nessuna divisione per zero)", () => {
    const empty = emptyBucket();
    expect(deliveryRatePct(empty)).toBe(0);
    expect(bounceRatePct(empty)).toBe(0);
    expect(spamRatePct(empty)).toBe(0);
  });
});

describe("rate (stringified %)", () => {
  it("format con 2 decimali + segno %", () => {
    expect(rate(33, 100)).toBe("33.00%");
    expect(rate(1, 3)).toBe("33.33%");
  });

  it("torna '0%' quando total è 0", () => {
    expect(rate(5, 0)).toBe("0%");
    expect(rate(0, 0)).toBe("0%");
  });
});

describe("rangeToCutoff", () => {
  const NOW = new Date("2026-04-22T12:00:00.000Z");

  it("7d produce cutoff 7 giorni fa", () => {
    const cutoff = rangeToCutoff("7d", NOW);
    const cutoffDate = new Date(cutoff);
    const deltaDays = (NOW.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(deltaDays).toBeCloseTo(7, 1);
  });

  it("30d produce cutoff 30 giorni fa", () => {
    const cutoff = rangeToCutoff("30d", NOW);
    const cutoffDate = new Date(cutoff);
    const deltaDays = (NOW.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(deltaDays).toBeCloseTo(30, 1);
  });

  it("90d produce cutoff 90 giorni fa", () => {
    const cutoff = rangeToCutoff("90d", NOW);
    const cutoffDate = new Date(cutoff);
    const deltaDays = (NOW.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(deltaDays).toBeCloseTo(90, 1);
  });

  it("restituisce ISO 8601 valido", () => {
    const cutoff = rangeToCutoff("7d", NOW);
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
