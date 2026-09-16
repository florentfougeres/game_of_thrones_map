/* Carte de Westeros — MapLibre GL
 * Toutes les couches sont des fichiers GeoJSON statiques chargés depuis ce dépôt.
 */

const GLYPHS_URL = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

const DATA_FILES = {
  fond: "fond.geojson",
  frontiere: "frontiere.geojson",
  iles: "iles.geojson",
  lacs: "lacs.geojson",
  lieux: "lieux.geojson",
  mur: "mur.geojson",
  paysage: "paysage.geojson",
  politique: "politique.geojson",
  regions: "regions.geojson",
  rivieres: "rivieres.geojson",
  routes: "routes.geojson",
};

const COLORS = {
  water: "#a9d8e3",
  land: "#f5ecdf",
  landLine: "#e3cfae",
  lake: "#8fc6d6",
  lakeLine: "#5fa0b3",
  river: "#7fc0d2",
  border: "#c99bb0",
  route: "#e0a685",
  wallCasing: "#5b7fa6",
  wallLine: "#eef8fb",
  waterLabel: "#3a7385",
  waterLabelHalo: "#fbf6ec",
  region: "rgba(122, 108, 138, 0.55)",
  regionHalo: "rgba(250, 245, 234, 0.85)",
  city: { fill: "#f6cf7e", stroke: "#d98a98" },
  town: { fill: "#f2b98a", stroke: "#c98a6e" },
  castle: { fill: "#9aa8c2", stroke: "#5c6b8a" },
  ruin: { fill: "#c7c0d1", stroke: "#8f889c" },
  forest: { fill: "rgba(122, 178, 140, 0.18)", text: "#4f8a68" },
  mountain: { fill: "rgba(158, 142, 168, 0.18)", text: "#7a6a8a" },
  swamp: { fill: "rgba(140, 160, 110, 0.16)", text: "#748a52" },
  stepp: { fill: "rgba(224, 190, 120, 0.16)", text: "#b8903f" },
  regionWater: { text: "#4a92a8" },
  regionShore: { text: "#b39a7a" },
  regionLand: { text: "#a68a6e" },
  regionDesert: { text: "#d99a5e" },
};

const HOUSE_LABELS_FR = {
  "Wildlings": "Sauvageons",
  "Night's Watch": "Garde de Nuit",
};

const CATEGORY_LABELS = {
  iles: "Île",
  lacs: "Lac",
  politique: "Royaume",
  rivieres: "Rivière",
  routes: "Route",
  City: "Ville",
  Town: "Bourg",
  Castle: "Château",
  Ruin: "Ruine",
  Other: "Lieu",
  forest: "Forêt",
  mountain: "Montagne",
  swamp: "Marais",
  stepp: "Steppe",
  water: "Mer",
  shore: "Rivage",
  land: "Contrée",
  desert: "Désert",
};

const CATEGORY_COLORS = {
  iles: "#a68a5c",
  lacs: COLORS.lake,
  politique: "#d98a72",
  rivieres: COLORS.river,
  routes: COLORS.route,
  City: COLORS.city.fill,
  Town: COLORS.town.fill,
  Castle: COLORS.castle.fill,
  Ruin: COLORS.ruin.fill,
  forest: COLORS.forest.text,
  mountain: COLORS.mountain.text,
  swamp: COLORS.swamp.text,
  stepp: COLORS.stepp.text,
  water: COLORS.regionWater.text,
  shore: COLORS.regionShore.text,
  land: COLORS.regionLand.text,
  desert: COLORS.regionDesert.text,
  Other: COLORS.ruin.fill,
};

/* ---------------------------------------------------------------- utils */

function stripDiacritics(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const GEOM_DEPTH = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
};

function getBBox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visit(pt) {
    const [x, y] = pt;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function walk(coords, depth) {
    if (depth === 0) {
      visit(coords);
    } else {
      coords.forEach((c) => walk(c, depth - 1));
    }
  }

  walk(geometry.coordinates, GEOM_DEPTH[geometry.type]);
  return [[minX, minY], [maxX, maxY]];
}

function bboxCenter(bbox) {
  return [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
}

/* ---------------------------------------------------------------- paysage fade bands */

// Génère, pour chaque polygone de paysage, une série d'anneaux concentriques
// (via un buffer négatif) avec une opacité croissante vers le centre : ça
// donne un remplissage qui se fond progressivement sur les bords plutôt
// qu'une couleur plate coupée net.
const PAYSAGE_FADE_RINGS = [0, 0.1, 0.22, 0.36];
const PAYSAGE_FADE_OPACITY = [0.035, 0.07, 0.11, 0.15];

function buildPaysageFadeBands(paysageFC) {
  const bands = [];

  paysageFC.features.forEach((f) => {
    const bbox = getBBox(f.geometry);
    const sizeKm = Math.min(bbox[1][0] - bbox[0][0], bbox[1][1] - bbox[0][1]) * 111;

    PAYSAGE_FADE_RINGS.forEach((fraction, band) => {
      let geometry = f.geometry;
      if (fraction > 0) {
        try {
          const buffered = turf.buffer(f, -sizeKm * fraction, { units: "kilometers" });
          if (!buffered || !buffered.geometry) return;
          geometry = buffered.geometry;
        } catch (err) {
          return;
        }
      }
      bands.push({
        type: "Feature",
        geometry,
        properties: { type: f.properties.type, band },
      });
    });
  });

  return { type: "FeatureCollection", features: bands };
}

// Convertit chaque polygone en un point garanti sur sa surface (turf.pointOnFeature).
// MapLibre calcule sinon lui-même un point d'ancrage pour les labels posés sur des
// polygones, ce qui échoue silencieusement (aucun label affiché) pour les
// multi-polygones étroits/dispersés comme "Les Îles de Fer".
function buildLabelPoints(featureCollection) {
  const points = featureCollection.features.map((f) => {
    let geometry;
    try {
      geometry = turf.pointOnFeature(f).geometry;
    } catch (err) {
      geometry = { type: "Point", coordinates: bboxCenter(getBBox(f.geometry)) };
    }
    return { type: "Feature", geometry, properties: f.properties };
  });
  return { type: "FeatureCollection", features: points };
}

/* ---------------------------------------------------------------- load data */

async function loadAllData() {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Impossible de charger ${url}`);
      return [key, await res.json()];
    })
  );
  return Object.fromEntries(entries);
}

/* ---------------------------------------------------------------- main */

(async function main() {
  let data;
  try {
    data = await loadAllData();
  } catch (err) {
    console.error(err);
    document.getElementById("map").innerHTML =
      '<p style="color:#eee;padding:2rem;font-family:sans-serif;">Erreur de chargement des données cartographiques.</p>';
    return;
  }

  const fondBBox = getBBox(data.fond.features[0].geometry);
  const center = bboxCenter(fondBBox);

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      glyphs: GLYPHS_URL,
      sources: {},
      layers: [
        { id: "background", type: "background", paint: { "background-color": COLORS.water } },
      ],
    },
    center,
    zoom: 3,
    minZoom: 2,
    maxZoom: 11,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: "Données géographiques : ce dépôt · MapLibre GL JS",
    }),
    "bottom-right"
  );
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  map.on("load", () => {
    addSources(map, data);
    addLayers(map);

    // cadrage large sur l'ensemble de la carte, avec marge
    const pad = 40;
    map.fitBounds(fondBBox, { padding: pad, duration: 0 });
  });

  const searchIndex = buildSearchIndex(data);
  setupSearch(map, searchIndex);
  setupLegend(map);
})();

/* ---------------------------------------------------------------- sources & layers */

function addSources(map, data) {
  map.addSource("fond", { type: "geojson", data: data.fond });
  map.addSource("lacs", { type: "geojson", data: data.lacs });
  map.addSource("politique", { type: "geojson", data: data.politique });
  map.addSource("politique-points", { type: "geojson", data: buildLabelPoints(data.politique) });
  map.addSource("regions", { type: "geojson", data: data.regions });
  map.addSource("regions-points", { type: "geojson", data: buildLabelPoints(data.regions) });
  map.addSource("frontiere", { type: "geojson", data: data.frontiere });
  map.addSource("routes", { type: "geojson", data: data.routes });
  map.addSource("rivieres", { type: "geojson", data: data.rivieres });
  map.addSource("mur", { type: "geojson", data: data.mur });
  map.addSource("paysage", { type: "geojson", data: data.paysage });
  map.addSource("paysage-fade", { type: "geojson", data: buildPaysageFadeBands(data.paysage) });
  map.addSource("iles", { type: "geojson", data: data.iles });
  map.addSource("lieux", { type: "geojson", data: data.lieux });
  map.addSource("highlight", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}

function addLayers(map) {
  // ---- terre / eau -------------------------------------------------
  map.addLayer({
    id: "fond-fill",
    type: "fill",
    source: "fond",
    paint: { "fill-color": COLORS.land, "fill-outline-color": COLORS.landLine },
  });

  map.addLayer({
    id: "lacs-fill",
    type: "fill",
    source: "lacs",
    paint: { "fill-color": COLORS.lake },
  });
  map.addLayer({
    id: "lacs-outline",
    type: "line",
    source: "lacs",
    paint: { "line-color": COLORS.lakeLine, "line-width": 1 },
  });
  map.addLayer({
    id: "lacs-label",
    type: "symbol",
    source: "lacs",
    filter: ["has", "name_fr"],
    layout: {
      "text-field": ["get", "name_fr"],
      "text-font": ["Noto Sans Italic"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13],
    },
    paint: {
      "text-color": COLORS.waterLabel,
      "text-halo-color": COLORS.waterLabelHalo,
      "text-halo-width": 1.6,
    },
  });

  // ---- paysages (forêts, montagnes, marais, steppes) ----------------
  // anneaux concentriques (cf. buildPaysageFadeBands) : le remplissage se
  // fond progressivement sur les bords, sans aucun contour net.
  const paysageToneColor = [
    "match", ["get", "type"],
    "forest", COLORS.forest.text,
    "mountain", COLORS.mountain.text,
    "swamp", COLORS.swamp.text,
    "stepp", COLORS.stepp.text,
    "#a68a6e",
  ];
  map.addLayer({
    id: "paysage-fill",
    type: "fill",
    source: "paysage-fade",
    paint: {
      "fill-color": paysageToneColor,
      "fill-opacity": [
        "match", ["get", "band"],
        0, PAYSAGE_FADE_OPACITY[0],
        1, PAYSAGE_FADE_OPACITY[1],
        2, PAYSAGE_FADE_OPACITY[2],
        3, PAYSAGE_FADE_OPACITY[3],
        PAYSAGE_FADE_OPACITY[3],
      ],
      "fill-outline-color": "transparent",
    },
  });
  // ---- frontières ----------------------------------------------------
  map.addLayer({
    id: "frontiere-line",
    type: "line",
    source: "frontiere",
    paint: {
      "line-color": COLORS.border,
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 8, 2],
      "line-dasharray": [3, 2],
      "line-opacity": 0.8,
    },
  });

  // ---- routes ----------------------------------------------------
  map.addLayer({
    id: "routes-line",
    type: "line",
    source: "routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": COLORS.route,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        3, ["match", ["get", "size"], 2, 1.4, 1],
        8, ["match", ["get", "size"], 2, 4.5, 2.5],
      ],
      "line-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "routes-label",
    type: "symbol",
    source: "routes",
    filter: ["has", "name_fr"],
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "name_fr"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-letter-spacing": 0.02,
    },
    paint: {
      "text-color": COLORS.route,
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.4,
    },
  });

  // ---- rivières ----------------------------------------------------
  map.addLayer({
    id: "rivieres-line",
    type: "line",
    source: "rivieres",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": COLORS.river,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        3, ["match", ["get", "size"], 2, 1.6, 0.9],
        8, ["match", ["get", "size"], 2, 5, 2.2],
      ],
    },
  });
  map.addLayer({
    id: "rivieres-label",
    type: "symbol",
    source: "rivieres",
    filter: ["has", "name_fr"],
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "name_fr"],
      "text-font": ["Noto Sans Italic"],
      "text-size": 11,
      "text-letter-spacing": 0.02,
    },
    paint: {
      "text-color": COLORS.waterLabel,
      "text-halo-color": COLORS.waterLabelHalo,
      "text-halo-width": 1.6,
    },
  });

  // ---- le Mur ----------------------------------------------------
  map.addLayer({
    id: "mur-casing",
    type: "line",
    source: "mur",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": COLORS.wallCasing, "line-width": 6, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "mur-line",
    type: "line",
    source: "mur",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": COLORS.wallLine, "line-width": 2.6 },
  });
  map.addLayer({
    id: "mur-label",
    type: "symbol",
    source: "mur",
    layout: {
      "symbol-placement": "line",
      "text-field": "Le Mur",
      "text-font": ["Noto Sans Bold"],
      "text-size": 13,
      "text-letter-spacing": 0.08,
    },
    paint: {
      "text-color": COLORS.wallCasing,
      "text-halo-color": COLORS.wallLine,
      "text-halo-width": 1.5,
    },
  });

  // ---- régions (label uniquement, pas de géométrie visible) --------
  map.addLayer({
    id: "politique-label",
    type: "symbol",
    source: "politique-points",
    layout: {
      "text-field": [
        "upcase",
        [
          "coalesce",
          ["get", "name_fr"],
          ["match", ["get", "ClaimedBy"],
            "Wildlings", "Terres au-delà du Mur",
            "Night's Watch", "Garde de Nuit",
            ["get", "ClaimedBy"],
          ],
        ],
      ],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2, 13, 7, 22],
      "text-letter-spacing": 0.12,
      "text-max-width": 8,
    },
    paint: {
      "text-color": [
        "match", ["get", "ClaimedBy"],
        "Stark", "rgba(140, 155, 175, 0.7)",
        "Lannister", "rgba(214, 110, 110, 0.65)",
        "Baratheon", "rgba(168, 140, 90, 0.7)",
        "Tyrell", "rgba(140, 182, 110, 0.65)",
        "Martell", "rgba(224, 150, 100, 0.65)",
        "Greyjoy", "rgba(110, 140, 155, 0.7)",
        "Arryn", "rgba(140, 185, 220, 0.65)",
        "Tully", "rgba(120, 145, 205, 0.65)",
        "Night's Watch", "rgba(110, 110, 120, 0.7)",
        "Wildlings", "rgba(180, 145, 105, 0.65)",
        COLORS.region,
      ],
      "text-halo-color": COLORS.regionHalo,
      "text-halo-width": 1.5,
    },
  });

  // ---- régions géographiques (mers, rivages, monts, forêts, déserts) --
  // label uniquement, couleur et casse adaptées à la colonne "type"
  map.addLayer({
    id: "regions-label",
    type: "symbol",
    source: "regions-points",
    layout: {
      "text-field": [
        "match", ["get", "type"],
        "mountain", ["upcase", ["get", "name_fr"]],
        "desert", ["upcase", ["get", "name_fr"]],
        ["get", "name_fr"],
      ],
      "text-font": [
        "match", ["get", "type"],
        "mountain", ["literal", ["Noto Sans Bold"]],
        "desert", ["literal", ["Noto Sans Bold"]],
        "land", ["literal", ["Noto Sans Regular"]],
        ["literal", ["Noto Sans Italic"]],
      ],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 7, 17],
      "text-letter-spacing": ["match", ["get", "type"], "mountain", 0.1, "desert", 0.1, 0.02],
      "text-max-width": 8,
    },
    paint: {
      "text-color": [
        "match", ["get", "type"],
        "water", COLORS.regionWater.text,
        "shore", COLORS.regionShore.text,
        "land", COLORS.regionLand.text,
        "desert", COLORS.regionDesert.text,
        "mountain", COLORS.mountain.text,
        "forest", COLORS.forest.text,
        COLORS.regionLand.text,
      ],
      "text-halo-color": COLORS.regionHalo,
      "text-halo-width": 1.4,
    },
  });

  // ---- îles (label uniquement) ----------------------------------
  map.addLayer({
    id: "iles-label",
    type: "symbol",
    source: "iles",
    filter: ["has", "name_fr"],
    layout: {
      "text-field": ["get", "name_fr"],
      "text-font": ["Noto Sans Italic"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13],
    },
    paint: {
      "text-color": "#a68a5c",
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.4,
    },
  });

  // ---- paysages (label, style selon le type) -------------------------
  map.addLayer({
    id: "paysage-label",
    type: "symbol",
    source: "paysage",
    filter: ["has", "name_fr"],
    layout: {
      "text-field": [
        "match", ["get", "type"],
        "mountain", ["upcase", ["get", "name_fr"]],
        ["get", "name_fr"],
      ],
      "text-font": [
        "match", ["get", "type"],
        "mountain", ["literal", ["Noto Sans Bold"]],
        ["literal", ["Noto Sans Italic"]],
      ],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        3, ["match", ["get", "type"], "mountain", 11, "forest", 10, 9],
        8, ["match", ["get", "type"], "mountain", 15, "forest", 14, 12],
      ],
      "text-letter-spacing": ["match", ["get", "type"], "mountain", 0.08, 0.01],
      "symbol-placement": "point",
      "text-max-width": 7,
    },
    paint: {
      "text-color": paysageToneColor,
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.4,
    },
  });
  // labels génériques (pas de name_fr) : uniquement à partir d'un certain
  // zoom pour ne pas noyer la carte de "Montagne" / "Forêt" répétés
  map.addLayer({
    id: "paysage-label-generic",
    type: "symbol",
    source: "paysage",
    filter: ["!", ["has", "name_fr"]],
    minzoom: 5,
    layout: {
      "text-field": [
        "match", ["get", "type"],
        "forest", "Forêt",
        "mountain", "MONTAGNE",
        "swamp", "Marais",
        "stepp", "Steppe",
        "Paysage",
      ],
      "text-font": [
        "match", ["get", "type"],
        "mountain", ["literal", ["Noto Sans Bold"]],
        ["literal", ["Noto Sans Italic"]],
      ],
      "text-size": 10,
      "text-letter-spacing": ["match", ["get", "type"], "mountain", 0.08, 0.01],
      "symbol-placement": "point",
    },
    paint: {
      "text-color": paysageToneColor,
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.2,
      "text-opacity": 0.8,
    },
  });

  // ---- lieux : cercles par ordre d'importance ----------------------
  const lieuxTiers = [
    { id: "city", types: ["City"], minzoom: 0, r: [5, 9], color: COLORS.city, textMinzoom: 0, textSize: [13, 18], font: "Noto Sans Bold" },
    { id: "town", types: ["Town"], minzoom: 3, r: [4, 7], color: COLORS.town, textMinzoom: 3, textSize: [11, 14], font: "Noto Sans Bold" },
    { id: "castle", types: ["Castle"], minzoom: 4, r: [3.4, 6], color: COLORS.castle, textMinzoom: 4.5, textSize: [10, 13], font: "Noto Sans Regular" },
    { id: "ruin", types: ["Ruin", "Other"], minzoom: 5, r: [2.8, 5], color: COLORS.ruin, textMinzoom: 5.5, textSize: [9, 11], font: "Noto Sans Italic" },
  ];

  lieuxTiers.forEach((tier) => {
    map.addLayer({
      id: `lieux-circle-${tier.id}`,
      type: "circle",
      source: "lieux",
      minzoom: tier.minzoom,
      filter: ["in", ["get", "type"], ["literal", tier.types]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, tier.r[0], 9, tier.r[1]],
        "circle-color": tier.color.fill,
        "circle-stroke-color": tier.color.stroke,
        "circle-stroke-width": 1.2,
      },
    });
  });

  lieuxTiers.forEach((tier) => {
    map.addLayer({
      id: `lieux-label-${tier.id}`,
      type: "symbol",
      source: "lieux",
      minzoom: tier.textMinzoom,
      filter: ["all", ["has", "name_fr"], ["in", ["get", "type"], ["literal", tier.types]]],
      layout: {
        "text-field": ["get", "name_fr"],
        "text-font": [tier.font],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, tier.textSize[0], 9, tier.textSize[1]],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.6,
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        "text-color": tier.color.stroke,
        "text-halo-color": COLORS.land,
        "text-halo-width": 1.6,
      },
    });
  });

  // ---- surbrillance de recherche ----------------------------------
  map.addLayer({
    id: "highlight-fill",
    type: "fill",
    source: "highlight",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#e08fa3", "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "highlight-line",
    type: "line",
    source: "highlight",
    filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": "#e08fa3", "line-width": 3, "line-opacity": 0.85 },
  });
}

/* ---------------------------------------------------------------- search index */

function buildSearchIndex(data) {
  const index = [];

  function addFeatures(key, features, categoryFn, colorFn, nameFn) {
    features.forEach((f) => {
      const name = nameFn ? nameFn(f) : f.properties.name_fr;
      if (!name) return;
      index.push({
        name,
        category: categoryFn(f),
        color: colorFn(f),
        geometry: f.geometry,
        properties: f.properties,
        sourceKey: key,
      });
    });
  }

  addFeatures("iles", data.iles.features, () => CATEGORY_LABELS.iles, () => CATEGORY_COLORS.iles);
  addFeatures("lacs", data.lacs.features, () => CATEGORY_LABELS.lacs, () => CATEGORY_COLORS.lacs);
  addFeatures(
    "politique",
    data.politique.features,
    () => CATEGORY_LABELS.politique,
    () => CATEGORY_COLORS.politique,
    (f) => f.properties.name_fr || HOUSE_LABELS_FR[f.properties.ClaimedBy] || f.properties.ClaimedBy
  );
  addFeatures("rivieres", data.rivieres.features, () => CATEGORY_LABELS.rivieres, () => CATEGORY_COLORS.rivieres);
  addFeatures("routes", data.routes.features, () => CATEGORY_LABELS.routes, () => CATEGORY_COLORS.routes);
  addFeatures(
    "lieux",
    data.lieux.features,
    (f) => CATEGORY_LABELS[f.properties.type] || "Lieu",
    (f) => CATEGORY_COLORS[f.properties.type] || CATEGORY_COLORS.Other
  );
  addFeatures(
    "paysage",
    data.paysage.features,
    (f) => CATEGORY_LABELS[f.properties.type] || "Paysage",
    (f) => CATEGORY_COLORS[f.properties.type] || "#a68a6e"
  );
  addFeatures(
    "regions",
    data.regions.features,
    (f) => CATEGORY_LABELS[f.properties.type] || "Région",
    (f) => CATEGORY_COLORS[f.properties.type] || "#a68a6e"
  );

  index.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return index;
}

/* ---------------------------------------------------------------- search UI */

function setupSearch(map, index) {
  const input = document.getElementById("search-input");
  const resultsEl = document.getElementById("search-results");
  let currentMarker = null;
  let activeIndex = -1;
  let currentMatches = [];

  function closeResults() {
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
    activeIndex = -1;
    currentMatches = [];
  }

  function renderResults(matches) {
    currentMatches = matches;
    activeIndex = -1;
    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">Aucun résultat</div>';
      resultsEl.classList.add("open");
      return;
    }
    resultsEl.innerHTML = matches
      .slice(0, 30)
      .map(
        (m, i) => `
      <div class="search-result" data-index="${i}">
        <span class="swatch" style="background:${m.color}"></span>
        <span class="name">${m.name}</span>
        <span class="cat">${m.category}</span>
      </div>`
      )
      .join("");
    resultsEl.classList.add("open");
    resultsEl.querySelectorAll(".search-result").forEach((el) => {
      el.addEventListener("click", () => selectMatch(matches[Number(el.dataset.index)]));
    });
  }

  function selectMatch(match) {
    input.value = match.name;
    closeResults();

    if (currentMarker) currentMarker.remove();

    let point;
    if (match.geometry.type === "Point") {
      point = match.geometry.coordinates;
      map.flyTo({ center: point, zoom: Math.max(map.getZoom(), 6.5), duration: 900 });
    } else {
      const bbox = getBBox(match.geometry);
      point = bboxCenter(bbox);
      map.fitBounds(bbox, { padding: 80, maxZoom: 7, duration: 900 });
    }

    const el = document.createElement("div");
    el.className = "highlight-marker";
    currentMarker = new maplibregl.Marker({ element: el }).setLngLat(point).addTo(map);

    map.getSource("highlight").setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: match.geometry, properties: {} }],
    });

    let extra = "";
    if (match.sourceKey === "politique" && match.properties.ClaimedBy) {
      extra = `<p class="popup-extra">Contrôlée par : ${match.properties.ClaimedBy}</p>`;
    }

    new maplibregl.Popup({ closeButton: true })
      .setLngLat(point)
      .setHTML(`<p class="popup-title">${match.name}</p><p class="popup-cat">${match.category}</p>${extra}`)
      .addTo(map);
  }

  input.addEventListener("input", () => {
    const q = stripDiacritics(input.value.trim());
    if (q.length === 0) {
      closeResults();
      return;
    }
    const matches = index.filter((e) => stripDiacritics(e.name).includes(q));
    renderResults(matches);
  });

  input.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll(".search-result");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      activeIndex = (activeIndex + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle("active", i === activeIndex));
      items[activeIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle("active", i === activeIndex));
      items[activeIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && currentMatches[activeIndex]) {
        selectMatch(currentMatches[activeIndex]);
      } else if (currentMatches.length > 0) {
        selectMatch(currentMatches[0]);
      }
    } else if (e.key === "Escape") {
      closeResults();
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-block")) closeResults();
  });
}

/* ---------------------------------------------------------------- legend */

function setupLegend(map) {
  const block = document.getElementById("legend-block");
  const header = document.getElementById("legend-toggle");
  header.addEventListener("click", () => block.classList.toggle("collapsed"));

  block.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
    chk.addEventListener("change", () => {
      const layerIds = chk.dataset.layers.split(",");
      const visibility = chk.checked ? "visible" : "none";
      layerIds.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibility);
        }
      });
    });
  });
}
