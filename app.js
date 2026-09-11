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
  rivieres: "rivieres.geojson",
  routes: "routes.geojson",
};

const COLORS = {
  water: "#204a5c",
  land: "#e7d9b3",
  landLine: "#b9a06a",
  lake: "#3e7ea6",
  lakeLine: "#1d3f52",
  river: "#3e7ea6",
  border: "#5a3b22",
  route: "#8a5a2b",
  wallCasing: "#0c2d3a",
  wallLine: "#eaf7fb",
  region: "rgba(80, 46, 20, 0.6)",
  regionHalo: "rgba(236, 223, 192, 0.85)",
  city: { fill: "#f2c14e", stroke: "#7a1f1f" },
  town: { fill: "#d98a3d", stroke: "#6b4a25" },
  castle: { fill: "#4a5568", stroke: "#1f2530" },
  ruin: { fill: "#9a9a9a", stroke: "#5a5a5a" },
  forest: { fill: "rgba(46, 79, 42, 0.4)", line: "rgba(46, 79, 42, 0.7)", text: "#2e4f2a" },
  mountain: { fill: "rgba(96, 82, 66, 0.42)", line: "rgba(74, 60, 46, 0.75)", text: "#4a3c2e" },
  swamp: { fill: "rgba(72, 84, 42, 0.42)", line: "rgba(72, 84, 42, 0.75)", text: "#48542a" },
  stepp: { fill: "rgba(196, 164, 86, 0.35)", line: "rgba(160, 128, 60, 0.7)", text: "#8a6a2b" },
};

const CATEGORY_LABELS = {
  iles: "Île",
  lacs: "Lac",
  politique: "Région",
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
};

const CATEGORY_COLORS = {
  iles: "#8a6d3b",
  lacs: COLORS.lake,
  politique: "#8a2b14",
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

    setupInteractivity(map);
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
  map.addSource("frontiere", { type: "geojson", data: data.frontiere });
  map.addSource("routes", { type: "geojson", data: data.routes });
  map.addSource("rivieres", { type: "geojson", data: data.rivieres });
  map.addSource("mur", { type: "geojson", data: data.mur });
  map.addSource("paysage", { type: "geojson", data: data.paysage });
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

  // ---- paysages (forêts, montagnes, marais, steppes) ----------------
  map.addLayer({
    id: "paysage-fill",
    type: "fill",
    source: "paysage",
    paint: {
      "fill-color": [
        "match", ["get", "type"],
        "forest", COLORS.forest.fill,
        "mountain", COLORS.mountain.fill,
        "swamp", COLORS.swamp.fill,
        "stepp", COLORS.stepp.fill,
        "rgba(120,120,120,0.3)",
      ],
    },
  });
  const paysageLineColor = [
    "match", ["get", "type"],
    "forest", COLORS.forest.line,
    "mountain", COLORS.mountain.line,
    "swamp", COLORS.swamp.line,
    "stepp", COLORS.stepp.line,
    "rgba(90,90,90,0.6)",
  ];
  map.addLayer({
    id: "paysage-outline-mountain",
    type: "line",
    source: "paysage",
    filter: ["==", ["get", "type"], "mountain"],
    paint: { "line-color": paysageLineColor, "line-width": 1.2 },
  });
  map.addLayer({
    id: "paysage-outline-other",
    type: "line",
    source: "paysage",
    filter: ["!=", ["get", "type"], "mountain"],
    paint: {
      "line-color": paysageLineColor,
      "line-width": 0.7,
      "line-dasharray": [2, 1.5],
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
      "text-color": COLORS.river,
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.4,
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
    source: "politique",
    filter: ["has", "name_fr"],
    layout: {
      "text-field": ["upcase", ["get", "name_fr"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2, 13, 7, 22],
      "text-letter-spacing": 0.12,
      "text-max-width": 8,
    },
    paint: {
      "text-color": COLORS.region,
      "text-halo-color": COLORS.regionHalo,
      "text-halo-width": 1.5,
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
      "text-color": "#5a4327",
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
      "text-color": [
        "match", ["get", "type"],
        "forest", COLORS.forest.text,
        "mountain", COLORS.mountain.text,
        "swamp", COLORS.swamp.text,
        "stepp", COLORS.stepp.text,
        "#5a4327",
      ],
      "text-halo-color": COLORS.land,
      "text-halo-width": 1.4,
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
    paint: { "fill-color": "#8a1f1f", "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "highlight-line",
    type: "line",
    source: "highlight",
    filter: ["!=", ["geometry-type"], "Point"],
    paint: { "line-color": "#8a1f1f", "line-width": 3, "line-opacity": 0.85 },
  });
}

/* ---------------------------------------------------------------- interactivity (popups) */

function setupInteractivity(map) {
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" });

  const clickableLayers = [
    "lieux-circle-city", "lieux-circle-town", "lieux-circle-castle", "lieux-circle-ruin",
    "lacs-fill", "rivieres-line", "iles-label", "politique-label", "paysage-fill",
  ];

  clickableLayers.forEach((layerId) => {
    map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    map.on("click", layerId, (e) => {
      const f = e.features[0];
      const props = f.properties;
      const name = props.name_fr;
      if (!name) return;

      let category = "";
      let extra = "";
      if (layerId.startsWith("lieux-circle-")) {
        category = CATEGORY_LABELS[props.type] || "Lieu";
      } else if (layerId === "lacs-fill") {
        category = "Lac";
      } else if (layerId === "rivieres-line") {
        category = "Rivière";
      } else if (layerId === "iles-label") {
        category = "Île";
      } else if (layerId === "politique-label") {
        category = "Région";
        if (props.ClaimedBy) extra = `Contrôlée par : ${props.ClaimedBy}`;
      } else if (layerId === "paysage-fill") {
        category = CATEGORY_LABELS[props.type] || "Paysage";
      }

      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<p class="popup-title">${name}</p><p class="popup-cat">${category}</p>` +
            (extra ? `<p class="popup-extra">${extra}</p>` : "")
        )
        .addTo(map);
    });
  });
}

/* ---------------------------------------------------------------- search index */

function buildSearchIndex(data) {
  const index = [];

  function addFeatures(key, features, categoryFn, colorFn) {
    features.forEach((f) => {
      const name = f.properties.name_fr;
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
  addFeatures("politique", data.politique.features, () => CATEGORY_LABELS.politique, () => CATEGORY_COLORS.politique);
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
    (f) => CATEGORY_COLORS[f.properties.type] || "#5a4327"
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
