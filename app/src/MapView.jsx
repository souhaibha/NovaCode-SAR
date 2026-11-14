import { useEffect, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const DATA = `${import.meta.env.BASE_URL}data/`;

// manifest bbox = [lon_min, lat_min, lon_max, lat_max]
// Leaflet bounds = [[lat_min, lon_min], [lat_max, lon_max]]
const toBounds = ([w, s, e, n]) => [
  [s, w],
  [n, e],
];

const fill = (template, date) => DATA + template.replace("{date}", date);

export default function MapView() {
  const [zone, setZone] = useState(null);
  const [aoi, setAoi] = useState(null);
  const [date, setDate] = useState("");
  const [pol, setPol] = useState("HH"); // "HH" or "HV"
  const [showWater, setShowWater] = useState(true);
  const [showChange, setShowChange] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${DATA}manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((m) => {
        const z = m.zones[0];
        setZone(z);
        setDate(z.dates[z.dates.length - 1]);
        return fetch(`${DATA}${z.id}/aoi.geojson`)
          .then((r) => (r.ok ? r.json() : null))
          .then(setAoi);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="p-4 text-red-400">Could not load data: {error}</p>;
  }
  if (!zone) return <p className="p-4 text-slate-300">Loading…</p>;

  const bounds = toBounds(zone.bbox);
  const center = [
    (zone.bbox[1] + zone.bbox[3]) / 2,
    (zone.bbox[0] + zone.bbox[2]) / 2,
  ];
  const change = zone.changes?.[0];

  return (
    <div className="flex h-screen flex-col bg-[#0B1220] text-slate-100">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-4 bg-[#111B2E] px-4 py-3 text-sm">
        <span className="font-semibold">{zone.name}</span>

        <label className="flex items-center gap-2">
          Date
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded bg-[#0B1220] px-2 py-1"
          >
            {zone.dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          Polarization
          <select
            value={pol}
            onChange={(e) => setPol(e.target.value)}
            className="rounded bg-[#0B1220] px-2 py-1"
          >
            <option value="HH">HH</option>
            <option value="HV">HV</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showWater}
            onChange={(e) => setShowWater(e.target.checked)}
          />
          Water
        </label>

        {change && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showChange}
              onChange={(e) => setShowChange(e.target.checked)}
            />
            Change {change.from} → {change.to}
          </label>
        )}

        <label className="flex items-center gap-2">
          Opacity
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
        </label>
      </div>

      {/* Map: the container needs an explicit height, so flex-1 + min-h-0 */}
      <div className="min-h-0 flex-1">
        <MapContainer
          bounds={bounds}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri"
          />

          {/* Radar image for the selected date and polarization */}
          <ImageOverlay
            key={`${pol}-${date}`}
            url={fill(zone.layers[pol], date)}
            bounds={bounds}
            opacity={opacity}
          />

          {showWater && zone.layers.water && (
            <ImageOverlay
              key={`water-${date}`}
              url={fill(zone.layers.water, date)}
              bounds={bounds}
            />
          )}

          {showChange && change && (
            <ImageOverlay
              key="change"
              url={DATA + change.file}
              bounds={bounds}
            />
          )}

          {aoi && (
            <GeoJSON
              data={aoi}
              style={{ color: "#2DD4BF", weight: 2, fillOpacity: 0 }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
