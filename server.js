require('dotenv').config();
const express = require('express');
const axios = require('axios');
const turf = require('@turf/turf');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});


// Load the GeoJSON data for Homestead
const homesteadBoundary = JSON.parse(fs.readFileSync('./homestead_boundary.geojson', 'utf-8'));

// Function to geocode an address using Google Maps API
async function geocodeAddress(address) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    try {
        const response = await axios.get(url);
        if (response.data.status === 'OK') {
            const { lat, lng } = response.data.results[0].geometry.location;
            return { lat, lng };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Function to check if a given point is within the Homestead boundary
function isWithinHomestead(lat, lng) {
    const point = turf.point([lng, lat]);
    const isInside = turf.booleanPointInPolygon(point, homesteadBoundary);
    return isInside;
}

// Endpoint to check if an address is within Homestead
app.post('/check-address', async (req, res) => {
    const { address } = req.body;
    if (!address) {
        return res.status(400).send('No address provided.');
    }

    const location = await geocodeAddress(address);
    if (!location) {
        return res.status(404).send('Address could not be geocoded.');
    }

    const isInside = isWithinHomestead(location.lat, location.lng);
    const message = isInside ? 
        "Yes, the address you've entered falls within the municipality of Homestead." :
        "No, the address you've entered does not fall within the municipality of Homestead.";
    
    res.send({ message });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
