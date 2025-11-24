const map = new maplibregl.Map({
    container: 'map',
    projection: 'globe',
    style: 'https://api.maptiler.com/maps/dataviz-v4/style.json?key=0Vzl9yHwu0Xyx4TwT2Iw',
    center: [0, 20],
    zoom: 1.5
});

// Store dark style URL
const darkStyleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const datavizStyleUrl = 'https://api.maptiler.com/maps/dataviz-v4/style.json?key=0Vzl9yHwu0Xyx4TwT2Iw';

// Load wetland colormap and initialize map
let wetlandColormap;
let wetlandColormapData;

fetch('wetland-colormap.json')
    .then(response => response.json())
    .then(data => {
        wetlandColormapData = data;
        // Extract just the color arrays for the tile service
        const colorArrays = {};
        for (const [key, value] of Object.entries(data)) {
            colorArrays[key] = value.color;
        }
        wetlandColormap = encodeURIComponent(JSON.stringify(colorArrays));
    })
    .catch(error => console.error('Error loading colormap:', error));

// Wait for map to load before adding wetlands layer
map.on('load', function () {
    // Ensure colormap is loaded
    if (!wetlandColormap) {
        console.error('Colormap not loaded yet');
        return;
    }

    map.addSource('wetlands-cog', {
        'type': 'raster',
        'tiles': [
            `https://titiler.nrp-nautilus.io/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@2x.png?url=https://minio.carlboettiger.info/public-wetlands/GLWD_v2_0/GLWD_v2_0_combined_classes/GLWD_v2_0_main_class.tif&colormap=${wetlandColormap}`
        ],
        'tileSize': 512
    });

    map.addLayer({
        'id': 'wetlands-layer',
        'type': 'raster',
        'source': 'wetlands-cog',
        'paint': {
            'raster-opacity': 0.7
        }
    });

    // Set up wetlands layer toggle after layer is added
    const wetlandsCheckbox = document.getElementById('wetlands-layer');
    if (wetlandsCheckbox) {
        wetlandsCheckbox.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();

            const visibility = map.getLayoutProperty('wetlands-layer', 'visibility');

            if (visibility === 'visible' || !visibility) {
                map.setLayoutProperty('wetlands-layer', 'visibility', 'none');
                this.checked = false;
            } else {
                this.checked = true;
                map.setLayoutProperty('wetlands-layer', 'visibility', 'visible');
            }
        };
    }
});

// Base layer switcher functionality
function switchBaseLayer(styleName) {
    const styleUrl = styleName === 'dark' ? darkStyleUrl : datavizStyleUrl;

    // Store current wetlands layer state
    const wetlandsVisible = map.getLayer('wetlands-layer') ?
        map.getLayoutProperty('wetlands-layer', 'visibility') !== 'none' : true;

    map.setStyle(styleUrl);

    // Re-add wetlands layer after style loads
    map.once('styledata', function () {
        map.addSource('wetlands-cog', {
            'type': 'raster',
            'tiles': [
                `https://titiler.nrp-nautilus.io/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@2x.png?url=https://minio.carlboettiger.info/public-wetlands/GLWD_v2_0/GLWD_v2_0_combined_classes/GLWD_v2_0_main_class.tif&colormap=${wetlandColormap}`
            ],
            'tileSize': 512
        });

        map.addLayer({
            'id': 'wetlands-layer',
            'type': 'raster',
            'source': 'wetlands-cog',
            'paint': {
                'raster-opacity': 0.7
            }
        });

        if (!wetlandsVisible) {
            map.setLayoutProperty('wetlands-layer', 'visibility', 'none');
            document.getElementById('wetlands-layer').checked = false;
        }
    });
}

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
    radio.addEventListener('change', function () {
        if (this.checked) {
            switchBaseLayer(this.value);
        }
    });
});

// Legend toggle functionality
const legendToggle = document.getElementById('legend-toggle');
const legendContent = document.getElementById('legend-content');

legendToggle.addEventListener('click', function () {
    legendContent.classList.toggle('collapsed');
    if (legendContent.classList.contains('collapsed')) {
        legendToggle.textContent = '+';
    } else {
        legendToggle.textContent = '−';
    }
});
