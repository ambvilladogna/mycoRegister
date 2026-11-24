// List Species Modal component
import L from 'leaflet';
import ModalUtils from '../utils/modal.js';

const THUNDERFOREST_API_KEY = __THUNDERFOREST_API_KEY__;

const listSpeciesModal = {
  constructor() {
    this.modal = null;
    this.localityCount = 1;
    this.collectorCount = 1;
    this.db = null;
  },

  // Hook for autocomplete values - to be implemented
  getLocalityAutocomplete: async function () {
    const db = this.db.getLocalDatabase();
    const result = await db.find({
      selector: { type: 'fungiSample' },
      fields: ['locality']
    });
    const values = [...new Set(result.docs.map(doc => doc.locality).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return values;
  },

  getCollectorAutocomplete: async function () {
    const db = this.db.getLocalDatabase();
    const result = await db.find({
      selector: { type: 'fungiSample' },
      fields: ['collector']
    });
    const values = [...new Set(result.docs.map(doc => doc.collector).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return values;
  },

  buildQueryString: function (formData) {
    const query = {
      selector: {
        type: 'fungiSample'
      }
    };

    // Add date filters if provided
    if (formData.dateFrom) {
      query.selector.collectionDate = query.selector.collectionDate || {};
      query.selector.collectionDate.$gte = formData.dateFrom;
    }

    if (formData.dateTo) {
      query.selector.collectionDate = query.selector.collectionDate || {};
      query.selector.collectionDate.$lte = formData.dateTo;
    }

    if (!formData.useCoordinates) {
      // Add località filters if provided
      if (formData.locality.length > 0) {
        query.selector.locality = {
          $in: formData.locality
        };
      }
    } else {
      query.selector.localityCoordinates = { $exists: true };
    }

    // Add collector filters if provided
    if (formData.collector.length > 0) {
      query.selector.collector = {
        $in: formData.collector
      };
    }

    return query;
  },

  executeQuery: async function (queryString) {
    // console.log('Executing query:', queryString);
    const db = this.db.getLocalDatabase();
    const result = await db.find({
      selector: queryString.selector,
      fields: ['taxonGenus', 'taxonSpecies', 'authority', 'localityCoordinates']
    });
    return result.docs || [];
  },


  checkFirstWordsMatch: function (str1, str2) {
    return str1.trim().split(' ')[0] === str2.trim();
  },

  getDetails: async function (genus, species) {
    try {
      const db = this.db.getLocalDatabase();
      const result = await db.find({
        selector: {
          type: 'census',
          taxonGenus: genus,
          taxonSpecies: species
        }
      });
      let doc;
      if (result.docs.length === 0) {
        return {};
      } else {
        doc = result.docs[0];
        if (doc.taxonGenus === doc.acceptedGenus && this.checkFirstWordsMatch(doc.taxonSpecies, doc.acceptedSpecies))
          return { lineage: doc.lineage };
        else
          return {
            currentName: `${doc.acceptedGenus} ${doc.acceptedSpecies}`,
            currentAuth: `${doc.acceptedAuthority} ${doc.acceptedYear}`,
            lineage: doc.lineage
          };
      }
    } catch (error) {
      console.error('Error fetching current name:', error);
      throw error;
    }
  },

  extractUniqueSpecies: function (samples) {
    const speciesMap = new Map();

    samples.forEach(sample => {
      if (!sample.taxonGenus || !sample.taxonSpecies) {
        return; // Skip incomplete records
      }

      const key = `${sample.taxonGenus}_${sample.taxonSpecies}`;

      if (!speciesMap.has(key)) {
        const fullName = sample.authority
          ? `${sample.taxonGenus} ${sample.taxonSpecies} ${sample.authority}`
          : `${sample.taxonGenus} ${sample.taxonSpecies}`;


        speciesMap.set(key, {
          genus: sample.taxonGenus,
          species: sample.taxonSpecies,
          authority: sample.authority || ''
        });
      }
    });

    // Convert to sorted array
    return Array.from(speciesMap.values()).sort((a, b) => {
      if (a.genus !== b.genus) return a.genus.localeCompare(b.genus);
      return a.species.localeCompare(b.species);
    });
  },

  enrichWithDetails: async function (speciesList) {
    for (const sp of speciesList) {
      const currentName = await this.getDetails(sp.genus, sp.species);
      sp.currentName = currentName.currentName || '';
      sp.currentAuth = currentName.currentAuth || '';
      sp.lineage = currentName.lineage || '';
    }
    return speciesList;
  },

  generateHTML: function (species, startDate, endDate, localities, collectors, totalSamples) {
    const dateRange = startDate === endDate
      ? `del ${new Date(startDate).toLocaleDateString('it-IT')}`
      : `dal ${new Date(startDate).toLocaleDateString('it-IT')} al ${new Date(endDate).toLocaleDateString('it-IT')}`;

    const html = `<!DOCTYPE html>
<html lang="it">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lista Specie Fungine - ${dateRange}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }

        .header {
            text-align: center;
            padding: 30px 20px;
            background-color: #2c5530;
            color: white;
        }

        .header h1 {
            font-size: 2.2em;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .stats {
            padding: 20px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
            text-align: center;
            color: #495057;
        }

        .species-list {
            padding: 20px 0;
        }

        .species-item {
            padding: 15px 30px;
            border-bottom: 1px solid #f0f0f0;
        }

        .species-item:last-child {
            border-bottom: none;
        }

        .species-name {
            font-size: 1.1em;
            font-weight: 600;
            color: #2c5530;
            margin-bottom: 5px;
        }

        .species-name .genus {
            font-style: italic;
        }

        .species-name .species {
            font-style: italic;
        }

        .species-lineage {
            font-size: 0.9em;
            color: #6c757d;
            margin-bottom: 5px;
        }
        .synonym-info {
            background-color: #fff3cd;
            padding: 8px 12px;
            border-left: 4px solid #ffc107;
            border-radius: 4px;
            font-size: 0.9em;
            color: #856404;
            margin-top: 8px;
        }

        .synonym-label {
            font-weight: 600;
        }

        .footer {
            padding: 20px;
            background-color: #f8f9fa;
            text-align: center;
            color: #6c757d;
            font-size: 0.9em;
            border-top: 1px solid #dee2e6;
        }

        @media print {
            body {
                background-color: white;
                padding: 0;
            }
            
            .container {
                box-shadow: none;
                max-width: none;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        <div class="header">
            <h1>Lista Specie Fungine</h1>
            <p>Campioni raccolti ${dateRange}</p>
            ${localities.length > 0 ? `<p>Raccolti in località: ${localities.join(' - ')}</p>` : ''}
            ${collectors.length > 0 ? `<p>Raccolti da ${collectors.join(', ')}</p>` : ''}
        </div>

        <div class="stats">
            <strong>${species.length} specie</strong> identificate da <strong>${totalSamples} campioni</strong> raccolti
        </div>

        <div class="species-list">
            ${species.map(sp => {
      let synonymInfo = '';
      if (sp.currentName && sp.currentName !== sp.fullName) {
        synonymInfo = `
                        <div class="synonym-info">
                            <span class="synonym-label">Sinonimo di:</span><i> ${sp.currentName}</i> ${sp.currentAuth ? ` ${sp.currentAuth}` : ''}
                        </div>
                    `;
      }

      return `
                    <div class="species-item">
                        <div class="species-name">
                            <span class="genus">${sp.genus}</span> 
                            <span class="species">${sp.species}</span>
                            ${sp.authority ? ` ${sp.authority}` : ''}
                        </div>
                        <div class="species-lineage">
                            ${sp.lineage || ''}
                        </div>
                        ${synonymInfo}
                    </div>
                `;
    }).join('')}
        </div>

        <div class="footer">
            Generato il ${new Date().toLocaleDateString('it-IT')} alle ${new Date().toLocaleTimeString('it-IT')}
        </div>
    </div>
</body>

</html>`;

    return html;
  },

  addLocalityField: function (container, index) {
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'form-group';
    fieldGroup.dataset.fieldIndex = index;
    fieldGroup.style.position = 'relative';
    fieldGroup.innerHTML = `
      <label for="locality-${index}">Località ${index > 1 ? index : ''}:</label>
      <input type="text" id="locality-${index}" name="locality" class="locality-field" autocomplete="off">
    `;
    container.appendChild(fieldGroup);

    const input = fieldGroup.querySelector(`#locality-${index}`);
    this.setupAutocomplete(input, this.getLocalityAutocomplete.bind(this));
    this.setupFieldWatcher(input, container, 'locality');
  },

  addCollectorField: function (container, index) {
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'form-group';
    fieldGroup.dataset.fieldIndex = index;
    fieldGroup.style.position = 'relative';
    fieldGroup.innerHTML = `
      <label for="collector-${index}">Raccoglitore ${index > 1 ? index : ''}:</label>
      <input type="text" id="collector-${index}" name="collector" class="collector-field" autocomplete="off">
    `;
    container.appendChild(fieldGroup);

    const input = fieldGroup.querySelector(`#collector-${index}`);
    this.setupAutocomplete(input, this.getCollectorAutocomplete.bind(this));
    this.setupFieldWatcher(input, container, 'collector');
  },

  setupAutocomplete: function (inputElement, getDataFunction) {
    // Check if autocomplete is already set up for this field
    if (inputElement.hasAttribute('collectionDate-autocomplete-setup')) {
      return; // Already set up, don't duplicate
    }

    // Mark as set up
    inputElement.setAttribute('collectionDate-autocomplete-setup', 'true');

    // Create autocomplete container
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';
    autocompleteContainer.style.display = 'none';
    autocompleteContainer.style.position = 'absolute';
    autocompleteContainer.style.width = 'calc(100% - 1rem)';
    autocompleteContainer.style.maxHeight = '200px';
    autocompleteContainer.style.overflowY = 'auto';
    autocompleteContainer.style.backgroundColor = '#fff';
    autocompleteContainer.style.border = '1px solid #ddd';
    autocompleteContainer.style.borderTop = 'none';
    autocompleteContainer.style.zIndex = '1000';

    // Store reference to container on the input element
    inputElement.autocompleteContainer = autocompleteContainer;

    // Insert container after input
    inputElement.parentNode.insertBefore(autocompleteContainer, inputElement.nextSibling);

    // Add input event listener
    inputElement.addEventListener('input', async () => {
      const inputValue = inputElement.value.trim().toLowerCase();

      // Close autocomplete list if input is empty
      if (!inputValue) {
        autocompleteContainer.style.display = 'none';
        return;
      }

      // Get suggestions from the collectionDate function
      const suggestions = await getDataFunction();

      // Filter suggestions based on input
      const matches = suggestions.filter(value =>
        value && value.toString().toLowerCase().includes(inputValue)
      );

      // Display matches
      if (matches.length > 0) {
        autocompleteContainer.innerHTML = '';
        autocompleteContainer.style.display = 'block';

        matches.forEach(match => {
          const item = document.createElement('div');
          item.className = 'autocomplete-item';
          item.textContent = match;
          item.style.padding = '8px 12px';
          item.style.cursor = 'pointer';

          item.addEventListener('click', () => {
            inputElement.value = match;
            autocompleteContainer.style.display = 'none';
          });

          item.addEventListener('mouseover', () => {
            // Remove active class from all items
            autocompleteContainer.querySelectorAll('.autocomplete-item').forEach(i => {
              i.classList.remove('active');
            });
            item.classList.add('active');
          });

          item.addEventListener('mouseout', () => {
            item.classList.remove('active');
          });

          autocompleteContainer.appendChild(item);
        });
      } else {
        autocompleteContainer.style.display = 'none';
      }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target !== inputElement) {
        autocompleteContainer.style.display = 'none';
      }
    });

    // Handle keyboard navigation
    inputElement.addEventListener('keydown', (e) => {
      const items = autocompleteContainer.querySelectorAll('.autocomplete-item');
      let activeItem = autocompleteContainer.querySelector('.autocomplete-item.active');

      // Down arrow
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!activeItem) {
          if (items[0]) {
            items[0].classList.add('active');
          }
        } else {
          const nextItem = activeItem.nextElementSibling;
          if (nextItem) {
            activeItem.classList.remove('active');
            nextItem.classList.add('active');
          }
        }
      }

      // Up arrow
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeItem) {
          const prevItem = activeItem.previousElementSibling;
          if (prevItem) {
            activeItem.classList.remove('active');
            prevItem.classList.add('active');
          }
        }
      }

      // Enter
      else if (e.key === 'Enter' && activeItem) {
        e.preventDefault();
        inputElement.value = activeItem.textContent;
        autocompleteContainer.style.display = 'none';
      }

      // Escape
      else if (e.key === 'Escape') {
        autocompleteContainer.style.display = 'none';
      }
    });
  },

  setupFieldWatcher: function (input, container, fieldType) {
    const self = this;
    input.addEventListener('input', () => {
      if (input.value.trim()) {
        const allFields = container.querySelectorAll(`input[name="${fieldType}"]`);
        const lastField = allFields[allFields.length - 1];

        if (lastField === input) {
          if (fieldType === 'locality') {
            self.localityCount++;
            self.addLocalityField(container, self.localityCount);
          } else if (fieldType === 'collector') {
            self.collectorCount++;
            self.addCollectorField(container, self.collectorCount);
          }
        }
      }
    });
  },

  // Function to toggle between locality fields and map search
  setupCoordinatesToggle: function (modalBody, self) {
    const checkbox = modalBody.querySelector('#use-coordinates');
    const localityContainer = modalBody.querySelector('#locality-fields-container');
    const mapContainer = modalBody.querySelector('#map-search-container');
    const radiusInput = modalBody.querySelector('#search-radius');
    const decrementButton = modalBody.querySelector('#decrement-radius');
    const incrementButton = modalBody.querySelector('#increment-radius');

    let map = null;
    let marker = null;
    let circle = null;
    let selectedCoords = null;

    function updateRadiusAndCircle(newRadius) {
      // Make sure radius is a number and respects the minimum (0.1)
      let radiusKm = Math.max(0.1, parseFloat(newRadius));

      // Round to one decimal place to avoid floating point issues
      radiusKm = Math.round(radiusKm * 10) / 10;

      // Update the input value
      radiusInput.value = radiusKm;

      // Update the circle on the map if a center has been selected
      if (circle && selectedCoords) {
        map.removeLayer(circle);
        circle = L.circle(selectedCoords, {
          radius: radiusKm * 1000, // Convert km to meters
          color: '#2c5530',
          fillColor: '#2c5530',
          fillOpacity: 0.2
        }).addTo(map);
      }
    }

    // Handlers for increment/decrement buttons
    decrementButton.addEventListener('click', function () {
      const currentRadius = parseFloat(radiusInput.value) || 0.5;
      updateRadiusAndCircle(currentRadius - 0.1);
    });

    incrementButton.addEventListener('click', function () {
      const currentRadius = parseFloat(radiusInput.value) || 0.5;
      updateRadiusAndCircle(currentRadius + 0.1);
    });

    // Update the circle radius when the input is changed manually
    radiusInput.addEventListener('input', function () {
      updateRadiusAndCircle(this.value);
    });

    function initializeMap() {
      if (map) return; // Already initialized

      map = L.map('map', {
        center: [45.896178, 9.982462],
        zoom: 12.50,
        zoomControl: false
      });

      L.control.zoom({
        position: 'bottomright'
      }).addTo(map);

      L.tileLayer('https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=' + THUNDERFOREST_API_KEY, {
        attribution: 'Maps &copy; <a href="https://www.thunderforest.com">Thunderforest</a>, Data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Add click handler to select center point
      map.on('click', function (e) {
        selectedCoords = e.latlng;

        // Remove existing marker and circle
        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);

        // Add new marker
        marker = L.marker(e.latlng).addTo(map);

        // Add circle based on radius
        const radiusInput = modalBody.querySelector('#search-radius');
        const radiusKm = parseFloat(radiusInput.value) || 0.5;
        circle = L.circle(e.latlng, {
          radius: radiusKm * 1000, // Convert km to meters
          color: '#2c5530',
          fillColor: '#2c5530',
          fillOpacity: 0.2
        }).addTo(map);

        // Update coordinates display
        const coordsInput = modalBody.querySelector('#center-coords');
        coordsInput.value = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
      });
    }

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        // Switch to map mode
        localityContainer.style.display = 'none';
        mapContainer.style.display = 'block';

        // Initialize map after container is visible
        setTimeout(() => {
          initializeMap();
          map.invalidateSize(); // Refresh map size
        }, 100);
      } else {
        // Switch to locality fields mode
        localityContainer.style.display = 'block';
        mapContainer.style.display = 'none';
      }
    });

    // Return getter for selected coordinates
    return {
      getSelectedCoords: () => selectedCoords,
      getRadius: () => {
        const radiusInput = modalBody.querySelector('#search-radius');
        return parseFloat(radiusInput.value) || 0.5;
      }
    };
  },

  haversineDistance: function (lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  init: async function (dbService) {
    this.db = dbService;
    const self = this;
    this.modal = ModalUtils.create('Estrai elenco specie', function (modalBody) {
      modalBody.innerHTML = `
      <div>
      <form autocomplete="off">
          <div class="form-group">
              <label for="date-from">Raccolto da:</label>
              <input type="date" id="date-from" name="date-from">
          </div>
          <div class="form-group">
              <label for="date-to">Raccolto fino a:</label>
              <input type="date" id="date-to" name="date-to">
          </div>      
          <div class="form-group">
              <label>
                  <input type="checkbox" id="use-coordinates" name="use-coordinates">
                  Usa coordinate geografiche
              </label>
          </div>
          
          <div id="locality-fields-container">
              <div id="locality-container"></div>
          </div>
          
          <div id="map-search-container" style="display: none;">
              <div class="form-group">
                  <label for="area-desc">Descrizione:</label>
                  <input type="text" id="area-desc" name="area-desc" placeholder="Dai un nome all'area di ricerca">
              </div>
              <div class="form-group">
                  <label for="center-coords">Coordinate centro:</label>
                  <input type="text" id="center-coords" name="center-coords" readonly placeholder="Clicca sulla mappa">
              </div>
              <div class="form-group">
                  <label for="search-radius">Raggio di ricerca (km):</label>
                  
                  <div style="display: flex; align-items: center; width: 100%;">
                      <button type="button" id="decrement-radius" style="flex-shrink: 0; padding: 0 8px; font-size: 1.5rem; line-height: 1; height: 38px; border: none; background: none; cursor: pointer; color: #333; margin-right: 5px;">-</button>
                      <input type="number" id="search-radius" name="search-radius" min="0.1" step="0.1" value="0.5" style="flex-grow: 1; text-align: center;">
                      <button type="button" id="increment-radius" style="flex-shrink: 0; padding: 0 8px; font-size: 1.5rem; line-height: 1; height: 38px; border: none; background: none; cursor: pointer; color: #333; margin-left: 5px;">+</button>
                  </div>
              </div>
              <div class="form-group">
                  <label>Clicca sulla mappa per selezionare il centro della ricerca</label>
                  <div id="map" style="height: 400px; width: 100%; border: 1px solid #ddd; border-radius: 4px;"></div>
              </div>
          </div>
          
          <div id="collector-container"></div>
          
          <div class="btnColumn">
              <button type="submit" class="btn primary maxWidth">Estrai</button>
              <button type="button" id="cancel-btn" class="btn primary maxWidth">Annulla</button>
          </div>    
      </form>
      <div id="modal-message"></div>
      </div>
      `;

      Promise.resolve().then(() => {
        // Initialize first locality and collector fields
        const localityContainer = modalBody.querySelector('#locality-container');
        const collectorContainer = modalBody.querySelector('#collector-container');

        self.localityCount = 1;
        self.collectorCount = 1;

        self.addLocalityField(localityContainer, self.localityCount);
        self.addCollectorField(collectorContainer, self.collectorCount);

        const submitBtn = modalBody.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.addEventListener('click', async (event) => {
            event.preventDefault();

            const dateFrom = modalBody.querySelector('#date-from').value;
            const dateTo = modalBody.querySelector('#date-to').value;

            const useCoordinates = modalBody.querySelector('#use-coordinates').checked;

            const areaDesc = modalBody.querySelector('#area-desc').value.trim();

            const centerCoords = modalBody.querySelector('#center-coords').value;
            if (useCoordinates && !centerCoords) {
              const messageDiv = modalBody.querySelector('#modal-message');
              messageDiv.className = 'modal-error';
              messageDiv.textContent = 'Seleziona il centro delle coordinate sulla mappa.';
              return;
            }
            const [centerLat, centerLng] = centerCoords.split(',').map(parseFloat);

            const searchRadius = parseFloat(modalBody.querySelector('#search-radius').value) || 0.5;

            const localityFields = modalBody.querySelectorAll('input[name="locality"]');
            const localityValues = Array.from(localityFields)
              .map(field => field.value.trim())
              .filter(value => value !== '');

            const collectorFields = modalBody.querySelectorAll('input[name="collector"]');
            const collectorValues = Array.from(collectorFields)
              .map(field => field.value.trim())
              .filter(value => value !== '');

            const formData = {
              dateFrom: dateFrom,
              dateTo: dateTo,
              useCoordinates: useCoordinates,
              locality: localityValues,
              collector: collectorValues
            };

            const queryString = self.buildQueryString(formData);
            const messageDiv = modalBody.querySelector('#modal-message');

            try {
              let results = await self.executeQuery(queryString);

              if (useCoordinates) {
                results = results.filter(doc => {
                  const [lat, lng] = doc.localityCoordinates.split(',').map(parseFloat);
                  return self.haversineDistance(centerLat, centerLng, lat, lng) <= searchRadius;
                });
              }

              const totalSamples = results.length;
              const uniqueSpecies = self.extractUniqueSpecies(results);
              const enrichedSpecies = await self.enrichWithDetails(uniqueSpecies);

              if (useCoordinates) {
                formData.locality = areaDesc ? [`${areaDesc} (entro ${searchRadius} km)`] : [];
              }

              const htmlContent = self.generateHTML(
                enrichedSpecies,
                formData.dateFrom || '1950-01-01',
                formData.dateTo || new Date().toISOString().split('T')[0],
                formData.locality,
                formData.collector,
                totalSamples
              );

              // Create a Blob from the HTML content
              const blob = new Blob([htmlContent], { type: 'text/html' });
              const url = URL.createObjectURL(blob);

              window.open(url, '_blank');
            } catch (error) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = error.message || 'Errore durante l\'esecuzione della query.';
            }
          });
        }

        const cancelBtn = modalBody.querySelector('#cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', async () => {
            self.modal.destroy();
            self.modal = null;
          });
        }

        self.setupCoordinatesToggle(modalBody, self);
      });
    });
  },

  show: async function (session, dbService) {
    if (!this.modal) await this.init(dbService);
    this.modal.show();
  }
};

export { listSpeciesModal };