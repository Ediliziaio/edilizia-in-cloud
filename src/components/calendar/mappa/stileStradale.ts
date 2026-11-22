import type { LineLayerSpecification, StyleSpecification } from "maplibre-gl";

const origine = "https://tiles.openfreemap.org";

const strade: LineLayerSpecification = {
  id: "strade", type: "line", source: "openmaptiles", "source-layer": "transportation",
  filter: ["all", ["==", ["geometry-type"], "LineString"],
    ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false]],
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": ["match", ["get", "class"], "motorway", "#ffbc58", "trunk", "#ffd279", "primary", "#ffe4a1",
      "secondary", "#fff2c5", "tertiary", "#fff9e8", "#fff"],
    "line-width": ["interpolate", ["exponential", 1.35], ["zoom"],
      5, ["match", ["get", "class"], ["motorway", "trunk"], 1.1, 0.5],
      10, ["match", ["get", "class"], ["motorway", "trunk"], 2.4, "primary", 1.8, 1],
      15, ["match", ["get", "class"], ["motorway", "trunk"], 8, ["primary", "secondary"], 5, 2.5],
      19, ["match", ["get", "class"], ["motorway", "trunk"], 20, ["primary", "secondary"], 15, 9]],
  },
};

const nome: readonly ["coalesce", ["get", "name:it"], ["get", "name"]] = [
  "coalesce", ["get", "name:it"], ["get", "name"],
];

export const stileStradaleOpenFreeMap: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector", url: `${origine}/planet`,
      attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  glyphs: `${origine}/fonts/{fontstack}/{range}.pbf`,
  layers: [
    { id: "sfondo", type: "background", paint: { "background-color": "#f4f2eb" } },
    { id: "verde", type: "fill", source: "openmaptiles", "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["grass", "wood", "farmland"], true, false], paint: { "fill-color": "#dce8ce", "fill-opacity": 0.75 } },
    { id: "abitato", type: "fill", source: "openmaptiles", "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["residential", "suburb", "commercial", "industrial"], true, false], paint: { "fill-color": "#e9e6df", "fill-opacity": 0.8 } },
    { id: "acqua", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#b7d8eb" } },
    { id: "fiumi", type: "line", source: "openmaptiles", "source-layer": "waterway",
      paint: { "line-color": "#a6cce5", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 17, 3] } },
    { id: "edifici", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      paint: { "fill-color": "#dfd8ce", "fill-outline-color": "#d3ccc2" } },
    { ...strade, id: "strade-locali", minzoom: 12,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["match", ["get", "class"], ["minor", "service", "track", "path"], true, false]],
      paint: { ...strade.paint, "line-color": "#fffdf7", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 19, 7] } },
    { ...strade, id: "bordi-strade",
      paint: { ...strade.paint, "line-color": "#cfc4b4", "line-gap-width": strade.paint?.["line-width"], "line-width": 0.7 } },
    strade,
    { id: "confini", type: "line", source: "openmaptiles", "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 4], maxzoom: 11, paint: { "line-color": "#a7a6ad", "line-dasharray": [3, 2] } },
    { id: "nomi-vie", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 12,
      layout: { "symbol-placement": "line", "text-field": [...nome], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": "#55534c", "text-halo-color": "#fffcf4", "text-halo-width": 1.25 } },
    { id: "nomi-localita", type: "symbol", source: "openmaptiles", "source-layer": "place",
      filter: ["match", ["get", "class"], ["country", "state", "city", "town", "village", "suburb", "neighbourhood"], true, false],
      layout: { "text-field": [...nome], "text-font": ["Noto Sans Regular"],
        "text-size": ["match", ["get", "class"], ["country", "city"], 15, "town", 13, 11], "text-max-width": 12 },
      paint: { "text-color": "#354152", "text-halo-color": "#fcfaf5", "text-halo-width": 1.5 } },
  ],
};
