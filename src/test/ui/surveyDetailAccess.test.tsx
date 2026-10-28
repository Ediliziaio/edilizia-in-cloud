import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useSurveyDetail, useSurveyReferences } from "@/hooks/useSurveyDetail";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import { SurveyAccessContext } from "@/contexts/SurveyAccessContext";
import { createElement, type ReactNode } from "react";
const mock = vi.hoisted(() => ({
  company: "company1",
  user: "user1",
  allowed: true,
  query: vi.fn(),
  get: vi.fn(),
  invalidate: vi.fn(),
  remove: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  channel: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: mock.company },
    user: { id: mock.user },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSopralluoghi: mock.allowed }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: mock.query,
  useQueryClient: () => ({ invalidateQueries: mock.invalidate }),
}));
vi.mock("@/lib/api/surveys", () => ({
  getSurvey: mock.get,
  listAssignees: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: mock.channel, removeChannel: mock.remove },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.company = "company1";
  mock.user = "user1";
  mock.allowed = true;
  const channel = { on: mock.on, subscribe: mock.subscribe };
  mock.channel.mockReturnValue(channel);
  mock.on.mockReturnValue(channel);
  mock.query.mockReturnValue({ data: null });
  mock.get.mockResolvedValue(makeSurveyDetail());
});
afterEach(cleanup);
describe("Accessi del sopralluogo condiviso fra pagina e popup", () => {
  it("isola la cache per utente, azienda e commessa e rimuove il canale alla chiusura", async () => {
    const v = renderHook(() => useSurveyDetail("survey1", "order1"));
    const q = mock.query.mock.calls[0][0];
    expect(q.queryKey).toEqual([
      "sopralluogo",
      "survey1",
      "company1",
      "user1",
      "order1",
      false,
    ]);
    expect(q.enabled).toBe(true);
    await expect(q.queryFn()).resolves.toMatchObject({
      survey: { id: "survey1" },
    });
    expect(mock.on).toHaveBeenCalledTimes(4);
    v.unmount();
    expect(mock.remove).toHaveBeenCalledTimes(1);
  });
  it.each([{ company_id: "other" }, { order_id: "other" }])(
    "rifiuta dati non appartenenti alla vista: %s",
    async (patch) => {
      const data = makeSurveyDetail();
      Object.assign(data.survey, patch);
      mock.get.mockResolvedValue(data);
      renderHook(() => useSurveyDetail("survey1", "order1"));
      await expect(mock.query.mock.calls[0][0].queryFn()).rejects.toThrow(
        "azienda o commessa",
      );
    },
  );
  it("senza permesso non avvia letture o realtime, nemmeno per riferimenti in cache", () => {
    mock.allowed = false;
    renderHook(() => useSurveyDetail("survey1", "order1"));
    renderHook(() => useSurveyReferences(makeSurveyDetail().survey));
    expect(mock.query.mock.calls.every(([q]) => q.enabled === false)).toBe(
      true,
    );
    expect(mock.channel).not.toHaveBeenCalled();
    expect(mock.get).not.toHaveBeenCalled();
  });
  it("separa la cache campo e non legge anagrafiche CRM per l’operatore", async () => {
    mock.allowed = false;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        SurveyAccessContext.Provider,
        { value: { field: true, canEdit: false } },
        children,
      );
    renderHook(() => useSurveyDetail("survey1"), { wrapper });
    const query = mock.query.mock.calls[0][0];
    expect(query.queryKey.at(-1)).toBe(true);
    expect(query.enabled).toBe(true);
    await query.queryFn();
    expect(mock.get).toHaveBeenCalledWith("survey1", true);
    const references = renderHook(
      () => useSurveyReferences(makeSurveyDetail().survey),
      { wrapper },
    );
    expect(mock.query.mock.calls.at(-1)?.[0].enabled).toBe(false);
    expect(references.result.current.data).toEqual({
      reference: null,
      assignees: ["Incarico autorizzato nell’app operai"],
    });
  });
});
