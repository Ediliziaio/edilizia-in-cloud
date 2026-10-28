import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  map: vi.fn(),
  remove: vi.fn(),
  fit: vi.fn(),
  resize: vi.fn(),
  clear: vi.fn(),
  circle: vi.fn(),
  marker: vi.fn(),
  off: vi.fn(),
  onError: null as (() => void) | null,
}));
vi.mock("leaflet", () => ({
  default: {
    map: (...args: unknown[]) => {
      mocks.map(...args);
      return {
        remove: mocks.remove,
        fitBounds: mocks.fit,
        invalidateSize: mocks.resize,
      };
    },
    tileLayer: () => {
      const tiles = {
        addTo: () => tiles,
        on: (_event: string, cb: () => void) => {
          mocks.onError = cb;
        },
        off: mocks.off,
      };
      return tiles;
    },
    layerGroup: () => {
      const group = { addTo: () => group, clearLayers: mocks.clear };
      return group;
    },
    circle: (...args: unknown[]) => {
      mocks.circle(...args);
      return { addTo: vi.fn() };
    },
    circleMarker: (...args: unknown[]) => {
      mocks.marker(...args);
      return { addTo: vi.fn() };
    },
    latLng: () => ({
      toBounds: () => [
        [45, 9],
        [46, 10],
      ],
    }),
  },
}));
import HrSedeMap from "@/components/hr/HrSedeMap";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.onError = null;
});
afterEach(cleanup);
describe("mappa sedi isolata dalla versione di React", () => {
  it("mounts direct Leaflet, draws the radius, updates and removes cleanly", () => {
    const view = render(<HrSedeMap lat={45} lng={9} radius={200} />);
    expect(
      screen.getByRole("region", { name: "Mappa area timbratura" }),
    ).toBeInTheDocument();
    expect(mocks.circle).toHaveBeenCalledWith(
      [45, 9],
      expect.objectContaining({ radius: 200 }),
    );
    view.rerender(<HrSedeMap lat={45.5} lng={9.5} radius={500} />);
    expect(mocks.map).toHaveBeenCalledTimes(1);
    expect(mocks.circle).toHaveBeenLastCalledWith(
      [45.5, 9.5],
      expect.objectContaining({ radius: 500 }),
    );
    view.unmount();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.off).toHaveBeenCalledTimes(1);
  });
  it("shows tile failures without crashing the page", () => {
    render(<HrSedeMap lat={45} lng={9} radius={200} />);
    act(() => mocks.onError?.());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cartografia non disponibile",
    );
    expect(
      screen.getByRole("region", { name: "Mappa area timbratura" }),
    ).toBeInTheDocument();
  });
});
