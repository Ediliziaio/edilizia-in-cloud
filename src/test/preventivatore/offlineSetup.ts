import { vi } from "vitest";
import { Socket } from "node:net";

const blocked = () => {
  throw new Error("Suite preventivatore offline: usare servizi simulati, rete non consentita.");
};

// Covers browser transports and Node transports, including libraries which do
// not use fetch. Explicit vi mocks in an individual test still work normally.
vi.stubGlobal("fetch", vi.fn(blocked));
vi.stubGlobal("WebSocket", class { constructor() { blocked(); } });
vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(blocked);
vi.spyOn(Socket.prototype, "connect").mockImplementation(blocked);

// Native wizard audits isolate these optional integrations; their own UI suites
// cover custom fields and survey import with the real query/router providers.
vi.mock("@/components/shared/QuoteCustomFieldsPanel", () => ({ QuoteCustomFieldsPanel: (): null => null }));
vi.mock("@/components/sopralluoghi/EnergyQuoteImport", () => ({ EnergyQuoteImport: (): null => null }));
