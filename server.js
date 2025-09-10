require('dotenv').config();
const express = require('express');
const axios = require('axios');
const turf = require('@turf/turf');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Serve static assets (adjust folder as needed)
// If your boundary.html + geojson are in the project root, use __dirname.
app.use(express.static(path.join(__dirname)));

// ---- Load & normalize GeoJSONs ----
function loadFeature(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (raw.type === 'FeatureCollection') return raw.features[0];
  if (raw.type === 'Feature') return raw;
  // If a bare geometry somehow, wrap as Feature
  return { type: 'Feature', properties: {}, geometry: raw.geometry || raw };
}

const homesteadFeature   = loadFeature(path.join(__dirname, 'homestead_boundary.geojson'));
const floridaCityFeature = loadFeature(path.join(__dirname, 'floridacity_boundary.geojson'));

const CITY_MAP = {
  homestead:   { key: 'homestead',   name: 'Homestead',    feature: homesteadFeature },
  floridacity: { key: 'floridacity', name: 'Florida City', feature: floridaCityFeature },
};

// ---- Helpers ----
async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  try {
    const { data } = await axios.get(url);
    if (data.status === 'OK' && data.results[0]) {
      const r = data.results[0];
      return {
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        place_id: r.place_id,
        formatted_address: r.formatted_address,
      };
    }
    return null;
  } catch (err) {
    console.error('Geocoding error:', err.message);
    return null;
  }
}

function isInside(lat, lng, feature) {
  const pt = turf.point([lng, lat]);
  const g = feature.geometry;
  if (g.type === 'Polygon')      return turf.booleanPointInPolygon(pt, turf.polygon(g.coordinates));
  if (g.type === 'MultiPolygon') return turf.booleanPointInPolygon(pt, turf.multiPolygon(g.coordinates));
  return false;
}

// ---- API: POST /check-address ----
// Body: { address: string, city?: 'homestead'|'floridacity' }
// If city omitted, we'll still tell you which city (if any) it falls into.
app.post('/check-address', async (req, res) => {
  try {
    const { address, city } = req.body || {};
    if (!address) return res.status(400).json({ error: 'No address provided.' });

    const geo = await geocodeAddress(address);
    if (!geo) return res.status(404).json({ error: 'Address could not be geocoded.' });

    const selectedKey = city && CITY_MAP[city] ? city : null;
    const selectedCity = selectedKey ? CITY_MAP[selectedKey] : null;

    const insideHomestead   = isInside(geo.lat, geo.lng, CITY_MAP.homestead.feature);
    const insideFloridaCity = isInside(geo.lat, geo.lng, CITY_MAP.floridacity.feature);

    // Figure out detected city (if any)
    let detectedKey = null;
    if (insideHomestead) detectedKey = 'homestead';
    else if (insideFloridaCity) detectedKey = 'floridacity';

    const insideSelected = selectedCity ? (selectedKey === 'homestead' ? insideHomestead : insideFloridaCity) : null;

    return res.json({
      geocode: geo,
      selected_city: selectedKey,          // echo what was requested (if any)
      detected_city: detectedKey,          // which city it actually falls in, or null
      inside_selected: insideSelected,     // true/false/null
      inside_any_city: !!detectedKey,      // boolean
      message: selectedCity
        ? (insideSelected
            ? `Yes, the address is within ${selectedCity.name}.`
            : `No, the address is not within ${selectedCity.name}.`)
        : (detectedKey
            ? `Address appears to be within ${CITY_MAP[detectedKey].name}.`
            : `Address does not appear within Homestead or Florida City.`),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Error handler (keep this last)
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

