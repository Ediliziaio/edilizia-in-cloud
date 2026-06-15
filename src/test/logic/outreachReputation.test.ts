import { describe, it, expect } from "vitest";
import {
  shouldPauseSender,
  classifyDeliveryEvent,
} from "../../../supabase/functions/_shared/outreach-reputation";

describe("shouldPauseSender", () => {
  it("sotto il volume minimo non mette in pausa", () => {
    expect(shouldPauseSender({ sent: 5, bounceCount: 5, complaintCount: 0 })).toBe(false);
  });
  it("bounce rate ≥8% su volume sufficiente → pausa", () => {
    expect(shouldPauseSender({ sent: 100, bounceCount: 8, complaintCount: 0 })).toBe(true);
  });
  it("bounce rate sotto soglia → ok", () => {
    expect(shouldPauseSender({ sent: 100, bounceCount: 7, complaintCount: 0 })).toBe(false);
  });
  it("complaint rate ≥0.5% → pausa", () => {
    expect(shouldPauseSender({ sent: 200, bounceCount: 0, complaintCount: 1 })).toBe(true);
  });
  it("soglie custom", () => {
    expect(shouldPauseSender({ sent: 50, bounceCount: 3, complaintCount: 0 }, { maxBounceRate: 0.05 })).toBe(true);
  });
});

describe("classifyDeliveryEvent — SES/SNS", () => {
  it("bounce permanente SES", () => {
    const p = {
      notificationType: "Bounce",
      bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "Bad@X.it" }, { emailAddress: "due@y.it" }] },
    };
    expect(classifyDeliveryEvent(p)).toEqual({ type: "bounce", emails: ["bad@x.it", "due@y.it"], permanent: true });
  });
  it("complaint SES", () => {
    const p = { notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "spam@z.it" }] } };
    expect(classifyDeliveryEvent(p)).toEqual({ type: "complaint", emails: ["spam@z.it"], permanent: true });
  });
  it("bounce transitorio = non permanente", () => {
    const p = { notificationType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@b.it" }] } };
    expect(classifyDeliveryEvent(p).permanent).toBe(false);
  });
});

describe("classifyDeliveryEvent — generico", () => {
  it("evento hard_bounce con email", () => {
    expect(classifyDeliveryEvent({ event: "hard_bounce", email: "x@y.it" }))
      .toEqual({ type: "bounce", emails: ["x@y.it"], permanent: true });
  });
  it("spam complaint generico", () => {
    expect(classifyDeliveryEvent({ type: "spamcomplaint", recipient: "p@q.it" }))
      .toEqual({ type: "complaint", emails: ["p@q.it"], permanent: true });
  });
  it("una normale risposta non è un evento di recapito", () => {
    expect(classifyDeliveryEvent({ from: "lead@azienda.it", subject: "Re: ciao" }).type).toBe("none");
  });
  it("payload nullo/non-oggetto → none", () => {
    expect(classifyDeliveryEvent(null).type).toBe("none");
    expect(classifyDeliveryEvent("stringa").type).toBe("none");
  });
});
