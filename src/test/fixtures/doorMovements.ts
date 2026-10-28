/** Entirely synthetic survey values, never used as defaults for a real record. */
const common = {
  larghezza: 900,
  altezza: 2100,
  spessore_muro: 120,
  materiale: "laccato",
  rv_measure_basis: "foro",
  rv_door_layout: "singola",
  rv_door_sidelights: "no",
  rv_door_toplight: "no",
  rv_door_side_a: "Corridoio",
  rv_door_side_b: "Camera",
  rv_door_counterframe: "nuovo",
  rv_door_frame_state: "da_verificare",
};
export const DOOR_MOVEMENT_EXAMPLES: Array<{
  label: string;
  values: Record<string, unknown>;
}> = [
  {
    label: "Scorrevole esterno muro",
    values: {
      ...common,
      tipologia: "scorrevole_esterno",
      rv_door_slide_side: "sx",
      rv_door_slide_face: "a",
      rv_door_free_left: 1000,
      rv_door_track_length: 1900,
      rv_door_clear_width: 850,
      rv_door_counterframe: "non_previsto",
    },
  },
  {
    label: "Scomparsa doppia contrapposta",
    values: {
      ...common,
      tipologia: "scorrevole_scomparsa",
      larghezza: 1600,
      rv_door_layout: "doppia_simmetrica",
      rv_door_free_left: 900,
      rv_door_free_right: 900,
      rv_door_track_length: 3400,
    },
  },
  {
    label: "Libro simmetrico",
    values: {
      ...common,
      tipologia: "a_libro",
      rv_door_slide_side: "sx",
      rv_door_fold_layout: "simmetrica",
      rv_door_fold_toward: "b",
    },
  },
  {
    label: "Libro asimmetrico",
    values: {
      ...common,
      tipologia: "a_libro",
      rv_door_slide_side: "dx",
      rv_door_fold_layout: "asimmetrica",
      rv_door_fold_split_mm: 300,
      rv_door_fold_toward: "a",
    },
  },
  {
    label: "Soffietto · sei pannelli",
    values: {
      ...common,
      tipologia: "a_soffietto",
      rv_door_slide_side: "sx",
      rv_door_fold_panels: 6,
      rv_door_fold_toward: "b",
    },
  },
];
