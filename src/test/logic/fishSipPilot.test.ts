import { describe, expect, it } from "vitest";
import {
  buildSipPilot,
  FISH_SIP_ORIGINATION,
  type SipPilotInput,
} from "@/lib/fishSipPilot";

const input: SipPilotInput = {
  number: "+39 (02) 123-4567",
  testCaller: "+390000000101",
  officeGroup: "Ufficio",
  officeSeconds: 15,
  terminationHost: "",
  terminationTransport: "auto",
};

describe("bozza SIP per il pilota aziendale", () => {
  it("keeps the same authorized number for incoming and callback, and exports a non-submittable Fish draft", () => {
    const { plan, requestToCarrier } = buildSipPilot(input);
    expect(plan.carrier).toMatchObject({
      inbound: {
        number: "+39021234567",
        testCaller: input.testCaller,
        officeGroup: "Ufficio",
        officeSeconds: 15,
        when: "no_answer",
        fishDestination: FISH_SIP_ORIGINATION,
        preserveOriginalCaller: true,
        preserveDialedNumber: true,
      },
      outbound: {
        callerId: "+39021234567",
        allowedPilotDestination: input.testCaller,
        afterConsentAndHangup: true,
      },
    });
    expect(plan.fish.readyToSubmit).toBe(false);
    expect(plan.fish.request.body).toEqual({
      provider: "sip",
      phone_number: "+39021234567",
      label: "Numero aziendale esistente",
    });
    expect(requestToCarrier).toContain(input.testCaller);
    expect(requestToCarrier).toContain("solo se nessuno risponde");
  });

  it("includes the provider-approved host, port and transport without wiring them into the inbound route", () => {
    const { plan } = buildSipPilot({
      ...input,
      terminationHost: "sip.operatore.test:5061",
      terminationTransport: "tls",
    });
    expect(plan.fish.request.body).toMatchObject({
      termination_uri: "sip.operatore.test:5061",
      termination_transport: "tls",
    });
    expect(plan.carrier.inbound.fishDestination).toBe(FISH_SIP_ORIGINATION);
  });

  it("requires different lines for the office and the pilot and rejects malformed SIP host fields", () => {
    expect(() =>
      buildSipPilot({ ...input, testCaller: "+39021234567" }),
    ).toThrow(/diverso/);
    for (const host of [
      "sip:carrier.test",
      "carrier.test:65536",
      "user@carrier.test",
      "carrier.test/sip",
    ]) {
      expect(() => buildSipPilot({ ...input, terminationHost: host })).toThrow(
        /host SIP/,
      );
    }
  });
});
