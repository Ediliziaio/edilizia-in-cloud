/** Nei Bagni, con la revisione della bozza AI, un'unità che il computo non ha non diventa «cad» di nascosto. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const stato = vi.hoisted(() => ({ review: {} as unknown, scegli: null as null | ((v: unknown[]) => unknown), toast: vi.fn() }));
vi.mock("@/components/moduli/ScegliVociListino", () => ({ ScegliVociListino: ({ onPick }: { onPick: (v: unknown[]) => unknown }): null => { stato.scegli = onPick; return null; } }));
vi.mock("@/components/bagni/ComputoEditor/ComputoReviewContext", () => ({ useComputoReview: () => stato.review }));
vi.mock("sonner", () => ({ toast: { error: stato.toast } }));
vi.mock("@/hooks/useBagniListino", () => ({ useListinoCapitoli: vi.fn(), useListinoVociSearch: vi.fn(), usePrefillFromArticolo: vi.fn(), mapUnitaMisura: vi.fn() }));
import AddVocePicker from "@/components/bagni/ComputoEditor/AddVocePicker";

describe("scelta delle voci nei Bagni", () => {
  beforeEach(() => { stato.review = {}; stato.toast.mockClear(); });
  const monta = () => { const onPick = vi.fn(); render(<AddVocePicker open onOpenChange={() => {}} onPick={onPick} />); return onPick; };

  it("in revisione, un'unità non supportata ferma tutto e lo dice", () => {
    const onPick = monta();
    expect(stato.scegli!([{ descrizione: "Sabbia", unita_misura: "cad", sourceUnit: "conf" }])).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    expect(stato.toast).toHaveBeenCalled();
  });
  it("in revisione, l'unità della fonte prende il posto di quella adattata", () => {
    const onPick = monta();
    stato.scegli!([{ descrizione: "Gres", unita_misura: "cad", sourceUnit: "mq" }]);
    expect(onPick.mock.calls[0][0][0].unita_misura).toBe("mq");
  });
  it("fuori dalla revisione passa com'è", () => {
    stato.review = null;
    const onPick = monta();
    stato.scegli!([{ descrizione: "Sabbia", unita_misura: "cad", sourceUnit: "conf" }]);
    expect(onPick.mock.calls[0][0][0].unita_misura).toBe("cad");
  });
});
