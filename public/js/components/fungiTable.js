// fungiTable.js - Component for displaying fungi samples in a responsive table
// uses /js/services/dbService.js';
// uses /js/services/FungiService.js';
// uses /js/models/fungiSample.js';
// uses /js/services/fungiSampleForm.js';

import DOMPurify from 'dompurify';
import { UserPreferences } from '../utils/userPreferences.js';
import { spinner } from './spinner.js';

class FilterPreferences extends UserPreferences {
  constructor() {
    super('filterPreferences');
  }

  /**
   * Save filter state for a specific data type
   * @param {string} dataType - the data type (collected, exsiccata, census)
   * @param {string} searchValue - the search filter value
   */
  saveFilterState(dataType, searchValue) {
    const filterKey = `${dataType}_search`;
    this.set(filterKey, searchValue);
  }

  /**
   * Get saved filter state for a data type
   * @param {string} dataType - the data type
   * @returns {string} saved search value or empty string
   */
  getFilterState(dataType) {
    const filterKey = `${dataType}_search`;
    return this.get(filterKey, '');
  }

  /**
   * Save the last selected data type
   * @param {string} dataType - the selected data type
   */
  saveLastDataType(dataType) {
    this.set('lastDataType', dataType);
  }

  /**
   * Get the last selected data type
   * @returns {string} last data type or 'collected' as default
   */
  getLastDataType() {
    return this.get('lastDataType', 'collected');
  }
}

class FungiTableComponent {
  constructor(config) {
    this.dbService = config.dbService;
    this.fungiService = config.fungiService;
    this.fungiSampleModel = config.fungiSampleModel;
    this.fungiSampleForm = config.fungiSampleForm;
    // DOM elements
    this.tableContainer = document.querySelector('.table-container');
    this.tableHead = document.querySelector('.table thead');
    this.tableBody = document.getElementById('table-body');
    this.dataFilter = document.getElementById('data-type');
    this.searchInput = document.getElementById('search-fungi');
    this.clearSearch = document.getElementById('clear-search');
    this.dataFilterTimeout = null; // For debouncing data filter changes
    this.searchTimeout = null; // For debouncing search input
    this.docsCount = document.getElementById('docs-count');
    this.tableInfoTooltip = document.getElementById('table-info-tooltip');
    this.samplesActionBtns = document.getElementById('samples-action-buttons');
    this.newButton = document.getElementById('new-fungi-btn');
    this.editButton = document.getElementById('edit-fungi-btn');
    this.deleteButton = document.getElementById('delete-fungi-btn');
    this.censusActionBtns = document.getElementById('census-action-buttons');
    this.indexF = document.getElementById('if-btn');
    this.catOfL = document.getElementById('col-btn');
    this.noRecordsMessage = document.getElementById('no-records-message');
    this.sortField = 'collectionDate'; // Default sort field
    this.sortDirection = 'desc'; // Default sort direction


    // Component state
    this.fungiSamples = [];
    this.selectedSampleId = null;
    this.isLoading = true;
    // DB 
    this.isSyncing = false;
    this.pendingChanges = false;
    this.debounceTimer = null;
    this.debounceDelay = 500; // milliseconds

    // Set up event listeners
    this.setupEventListeners();

    this.filterPrefs = new FilterPreferences();

    // Restore last data filter preferences
    const lastDataType = this.filterPrefs.getLastDataType();
    this.dataFilter.value = lastDataType || 'collected'; // Default to 'collected' if no preference
    const lastSearch = this.filterPrefs.getFilterState(lastDataType);
    this.searchInput.value = lastSearch || ''; // Default to empty search if no preference
    if (lastSearch.length > 0) {
      this.clearSearch.classList.remove('hidden');
    } else {
      this.clearSearch.classList.add('hidden');
    }

    // Initialize
    // this.init();
  }

  isShowingSamples() {
    return this.dataFilter.value === 'collected' || this.dataFilter.value === 'exsiccata';
  }

  isShowingCensus() {
    return this.dataFilter.value === 'census';
  }

  getResponsiveFields() {
    const width = window.innerWidth;

    if (width <= 768) {
      return ['taxonGenus', 'taxonSpecies', 'collectionDate'];
    } else if (width <= 1024) {
      return ['taxonGenus', 'taxonSpecies', 'collectionDate', 'locality', 'habitat'];
    } else {
      return ['taxonGenus', 'taxonSpecies', 'authority', 'collectionDate', 'locality', 'habitat', 'collector'];
    }
  }

  /**
 * Sets visible fields for display in the UI table
 * @param {Array} fields - Array of field objects or field names to display
 * @returns {Array} - The validated and set visible fields
 * @throws {Error} - If any field is not found in tableHeaders
 */
  setVisibleFields(fields) {
    // Handle case when no fields are provided
    if (!fields || fields.length === 0) {
      this.visibleFields = [];
      return this.visibleFields;
    }

    // Create a map of valid fields from tableHeaders for quick lookup
    const validFields = {};
    this.fungiSampleModel.tableHeaders.forEach(header => {
      validFields[header.field] = header;
    });

    // Process and validate each field
    const processedFields = fields.map(field => {
      // If input is just a string (field name), convert to object format
      const fieldName = typeof field === 'string' ? field : field.field;

      // Verify the field exists in tableHeaders
      if (!validFields[fieldName]) {
        throw new Error(`Field "${fieldName}" is not defined in tableHeaders`);
      }

      // If field is already in correct format, use it; otherwise get from tableHeaders
      return typeof field === 'object' && field.field && field.label ?
        field : validFields[fieldName];
    });

    // Set the visible fields
    this.visibleFields = processedFields;

    return this.visibleFields;
  }

  async init(isAuthenticated = false) {
    this.updateTableCtrls();

    // Generate table headers based on visible fields
    this.generateTableHeaders();

    // Load initial data
    if (isAuthenticated) {
      const searchTerm = this.searchInput.value.trim();
      await this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);
    }

    // Set up sync & db listeners
    this.setupSyncStateListener();
    this.setupDbChangeListener();

    await this.fungiSampleForm.init();
  }

  updateTableCtrls() {
    if (this.isShowingSamples()) {
      this.samplesActionBtns.classList.remove('hidden');
      this.censusActionBtns.classList.add('hidden');
      this.sortField = 'collectionDate'; // Default sort field
      this.sortDirection = 'desc'; // Default sort direction
      this.setVisibleFields(this.getResponsiveFields());
    }
    if (this.isShowingCensus()) {
      this.samplesActionBtns.classList.add('hidden');
      this.censusActionBtns.classList.remove('hidden');
      this.sortField = this.fungiSampleModel.censusHeaders[0].field; // Default sort field
      this.sortDirection = 'asc'; // Default sort direction
      this.visibleFields = [];
      this.fungiSampleModel.censusHeaders.forEach(header => {
        this.visibleFields.push(header);
      });
    }
  }

  generateTableHeaders() {
    // Clear existing headers
    const headerRow = this.tableHead.querySelector('tr');
    headerRow.innerHTML = '';

    // Generate headers based on visible fields
    this.visibleFields.forEach(field => {
      const th = document.createElement('th');
      th.textContent = field.label;

      if (field.sortable) {
        th.classList.add('sortable');
        th.setAttribute('data-field', field.field);

        // Add sort indicator
        const sortIcon = document.createElement('span');
        sortIcon.classList.add('sort-icon');
        sortIcon.innerHTML = '▲▼'; // Unicode triangles
        sortIcon.classList.add('unsorted'); // Default state is unsorted/gray
        th.appendChild(sortIcon);

        // Mark active sort column
        if (this.sortField === field.field) {
          th.classList.add('sorted');
          th.classList.add(this.sortDirection);
        }
      }

      headerRow.appendChild(th);
    });
  }

  handleResize() {
    // Debounce the resize event to avoid excessive calls
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.updateResponsiveLayout();
    }, 150); // 150ms delay
  }

  updateResponsiveLayout() {
    const newFields = this.getResponsiveFields();

    // Only update if the fields actually changed
    const currentFieldNames = this.visibleFields.map(f => f.field);
    const newFieldNames = newFields;

    if (JSON.stringify(currentFieldNames) !== JSON.stringify(newFieldNames)) {
      if (this.isShowingSamples()) {
        this.setVisibleFields(newFields);
      }
      this.generateTableHeaders();
      this.renderTable();
    }
  }

  setupEventListeners() {
    // Data filter & search input
    this.dataFilter.addEventListener('change', this.handleDataFilter.bind(this));
    this.searchInput.addEventListener('input', this.handleSearch.bind(this));
    this.clearSearch.addEventListener('click', this.handleClearSearch.bind(this));

    // Action buttons
    this.newButton.addEventListener('click', this.handleNew.bind(this));
    this.editButton.addEventListener('click', this.handleEdit.bind(this));
    this.deleteButton.addEventListener('click', this.handleDelete.bind(this));
    this.indexF.addEventListener('click', this.handleIF.bind(this));
    this.catOfL.addEventListener('click', this.handleCol.bind(this));

    // Delegated event for table row selection
    this.tableBody.addEventListener('click', this.handleRowClick.bind(this));

    // Add click event for sortable headers
    this.tableHead.addEventListener('click', this.handleHeaderClick.bind(this));

    window.addEventListener('resize', this.handleResize.bind(this));
  }

  // Debounced handler
  handleDatabaseChanges = async () => {
    const searchTerm = this.searchInput.value.trim();
    await this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);
    if (this.fungiSamples.length > 0) {
      console.log('Updating autocompletion...');
      await this.fungiSampleForm.refreshAutocompleteData();
      // await this.fungiSampleForm.refreshAuthorityCache();
    }
  }

  /*
  async handleSyncDataChange(event) {
    const { info } = event.detail;

    // Check if the changes include fungi samples
    if (info && info.direction) {
      const changesIncludeFungiSamples = info.change && info.change.docs &&
        info.change.docs.some(doc => doc.type === 'fungiSample');

      // Reload data if fungi samples were changed
      if (changesIncludeFungiSamples) {
        const searchTerm = this.searchInput.value.trim();
        await this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);

      }
    }
  }
  */

  setupSyncStateListener() {
    // Listen for sync state changes
    this.dbService.addEventListener('sync:state-changed', (event) => {
      const { newState } = event.detail;

      if (newState === 'change') {
        this.isSyncing = true;
      } else if (newState === 'paused') {
        this.isSyncing = false;
        // If there were pending changes during sync, process them now
        if (this.pendingChanges) {
          this.handleDatabaseChanges();
          this.pendingChanges = false;
        }
      }
    });
  }

  setupDbChangeListener() {
    // Listen for sync changes that might affect our data
    this.dbService.getLocalDatabase().changes({
      since: 'now',
      live: true,
      include_docs: true
    }).on('change', async (change) => {
      let changesIncludeFungiSamples = false;
      if (change.deleted) {
        changesIncludeFungiSamples = true;
      } else {
        if (change.doc && change.doc.type === 'fungiSample')
          changesIncludeFungiSamples = true;
      }
      if (changesIncludeFungiSamples) {
        if (this.isSyncing) {
          // Just flag that we have pending changes
          this.pendingChanges = true;
        } else {
          // Process changes normally with debouncing
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = setTimeout(() => {
            this.handleDatabaseChanges();
            this.debounceTimer = null;
          }, this.debounceDelay);
        }
      }
    })
  }

  checkFirstWordsMatch(str1, str2) {
    return str1.trim().split(' ')[0] === str2.trim();
  }

  async loadFungiSamples(searchTerm = '', sortBy, sortDirection) {
    this.setLoading(true);
    spinner.startSpinner();
    this.docsCount.textContent = 'Caricamento campioni...';

    try {
      const result = await this.fungiService.search(this.dataFilter.value, searchTerm, sortBy, sortDirection);
      // console.log('Fungi samples loaded:', result);
      this.fungiSamples = result.docs || [];
      const ofTotal = result.hasMore ? ` di ${result.totalCount}` : '';
      if (result.docsCount === 1)
        this.docsCount.textContent = `${result.count} campione`;
      else
        this.docsCount.textContent = `${result.count}${ofTotal} campioni`;
      if (result.hasMore)
        this.tableInfoTooltip.classList.remove('hidden');
      else
        this.tableInfoTooltip.classList.add('hidden');

      if (this.isShowingCensus() && this.fungiSamples.length > 0) {
        this.fungiSamples.forEach(sample => {
          sample.fullName = `<i>${sample.taxonGenus} ${sample.taxonSpecies}</i> ${sample.authority} ${sample.year}`;
          sample.currName = `${(sample.taxonGenus === sample.acceptedGenus && this.checkFirstWordsMatch(sample.taxonSpecies, sample.acceptedSpecies)) ? '' : '<i>' + sample.acceptedGenus + ' ' + sample.acceptedSpecies + '</i> ' + sample.acceptedAuthority + ' ' + sample.acceptedYear}`;
        });
      }

      if (this.isShowingSamples() && this.fungiSamples.length > 0) {
        // Sort the data
        this.fungiSamples = this.sortData(this.fungiSamples, sortBy, sortDirection);
      }

      // Render the data
      this.renderTable();
    } catch (error) {
      console.error('Error loading fungi samples:', error);
      this.showError("Errore durante il caricamento dati. Prova ancora.");
      this.docsCount.textContent = `Errore. 'loadFungiSamples': ${error.message}`;
    } finally {
      spinner.stopSpinner();
      this.setLoading(false);
    }
  }

  sortData(data, sortField, sortDirection) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return data;
    }

    const validSortFields = [
      'taxonGenus',
      'taxonSpecies',
      'authority',
      'collectionDate',
      'locality',
      'habitat',
      'collector'
    ];

    // Validate sortField
    if (!validSortFields.includes(sortField)) {
      console.warn(`Invalid sort field: ${sortField}. Using 'taxonGenus' as default.`);
      sortField = 'taxonGenus';
    }

    // Validate sortDirection
    if (!['asc', 'desc'].includes(sortDirection)) {
      console.warn(`Invalid sort direction: ${sortDirection}. Using 'asc' as default.`);
      sortDirection = 'asc';
    }

    return data.slice().sort((a, b) => {
      // Helper function to safely get field value
      const getFieldValue = (obj, field) => {
        const value = obj[field];
        if (value === null || value === undefined) return '';
        return String(value).toLowerCase();
      };

      // Helper function to compare dates
      const compareDates = (dateA, dateB) => {
        const a_date = new Date(dateA || 0);
        const b_date = new Date(dateB || 0);
        return b_date - a_date; // desc order for dates
      };

      // Helper function for string comparison
      const compareStrings = (strA, strB, direction = 'asc') => {
        const comparison = strA.localeCompare(strB, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
        return direction === 'desc' ? -comparison : comparison;
      };

      // 1. Primary sort by the specified field and direction
      const primaryA = getFieldValue(a, sortField);
      const primaryB = getFieldValue(b, sortField);

      let primaryComparison = 0;
      if (sortField === 'collectionDate') {
        primaryComparison = sortDirection === 'desc'
          ? compareDates(primaryA, primaryB)
          : -compareDates(primaryA, primaryB);
      } else {
        primaryComparison = compareStrings(primaryA, primaryB, sortDirection);
      }

      if (primaryComparison !== 0) {
        return primaryComparison;
      }

      // 2. Secondary sort by collectionDate (desc) - only if not already primary
      if (sortField !== 'collectionDate') {
        const dateComparison = compareDates(a.collectionDate, b.collectionDate);
        if (dateComparison !== 0) {
          return dateComparison;
        }
      }

      // 3. Tertiary sort by taxonGenus (asc) - only if not already primary
      if (sortField !== 'taxonGenus') {
        const genusA = getFieldValue(a, 'taxonGenus');
        const genusB = getFieldValue(b, 'taxonGenus');
        const genusComparison = compareStrings(genusA, genusB, 'asc');
        if (genusComparison !== 0) {
          return genusComparison;
        }
      }

      // 4. Quaternary sort by taxonSpecies (asc) - only if not already primary
      if (sortField !== 'taxonSpecies') {
        const speciesA = getFieldValue(a, 'taxonSpecies');
        const speciesB = getFieldValue(b, 'taxonSpecies');
        return compareStrings(speciesA, speciesB, 'asc');
      }

      return 0;
    });
  }

  clearTable() {
    this.tableBody.innerHTML = '';
  }

  renderTable() {
    // Clear current table content
    this.tableBody.innerHTML = '';

    // Show no records message if empty
    if (this.fungiSamples.length === 0) {
      this.noRecordsMessage.classList.remove('hidden');
      return;
    }

    // Hide no records message if we have data
    this.noRecordsMessage.classList.add('hidden');

    // Render each row
    this.fungiSamples.forEach(sample => {
      const row = document.createElement('tr');

      // Set data-id attribute for selection
      row.setAttribute('data-id', sample._id);

      // Add selected class if this is the selected row
      if (sample._id === this.selectedSampleId) {
        row.classList.add('selected');
      }

      // Create cells for each visible field
      this.visibleFields.forEach(fieldConfig => {
        const cell = document.createElement('td');

        if (fieldConfig.field === 'taxonGenus' || fieldConfig.field === 'taxonSpecies') {
          cell.classList.add('italic');
        }

        // Format value based on field type
        if (fieldConfig.field === 'collectionDate') {
          cell.textContent = this.formatDate(sample[fieldConfig.field]);
        } else {
          if (fieldConfig.field === 'fullName' || fieldConfig.field === 'currName') {
            cell.innerHTML = DOMPurify.sanitize(sample[fieldConfig.field] || '');
          } else {
            cell.textContent = sample[fieldConfig.field] || '';
          }
        }

        row.appendChild(cell);
      });

      this.tableBody.appendChild(row);
    });

    // Update sort indicators
    this.updateSortIndicators();
  }

  updateSortIndicators() {
    // Reset all headers to unsorted/gray state
    this.tableHead.querySelectorAll('th').forEach(th => {
      th.classList.remove('sorted', 'asc', 'desc');

      // Reset all icons to unsorted state
      const icon = th.querySelector('.sort-icon');
      if (icon) {
        icon.classList.add('unsorted');
        icon.innerHTML = '▲▼'; // Reset to both triangles
      }
    });

    // Add sort classes to current sort field header
    const activeHeader = this.tableHead.querySelector(`th[data-field="${this.sortField}"]`);
    if (activeHeader) {
      activeHeader.classList.add('sorted', this.sortDirection);

      // Update active sort icon
      const sortIcon = activeHeader.querySelector('.sort-icon');
      if (sortIcon) {
        sortIcon.classList.remove('unsorted');
        // Show only the active direction triangle
        sortIcon.innerHTML = this.sortDirection === 'asc' ? '▲' : '▼';
      }
    }
  }

  setLoading(isLoading) {
    this.isLoading = isLoading;

    // You can add a loading indicator here
    if (isLoading) {
      this.tableContainer.classList.add('loading');
    } else {
      this.tableContainer.classList.remove('loading');
    }
  }

  showError(message) {
    // In a real app, you might want to show an error message to the user
    console.error(message);
    // Example implementation could add a toast notification or alert
  }

  getSelectedSample() {
    if (!this.selectedSampleId) return null;
    return this.fungiSamples.find(sample => sample._id === this.selectedSampleId);
  }

  // Event Handlers

  handleSearch(event) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      const searchTerm = event.target.value.trim();
      if (searchTerm.length > 0) {
        this.clearSearch.classList.remove('hidden');
      } else {
        this.clearSearch.classList.add('hidden');
      }
      const currentDataType = this.dataFilter.value;
      this.filterPrefs.saveFilterState(currentDataType, searchTerm);
      this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);

    }, 500); // Debounce search input
  }

  handleClearSearch(event) {
    this.searchInput.value = '';
    this.clearSearch.classList.add('hidden');
    this.searchInput.focus(); // Keep focus on input for better UX
    const currentDataType = this.dataFilter.value;
    this.filterPrefs.saveFilterState(currentDataType, '');
    this.loadFungiSamples('', this.sortField, this.sortDirection);
  }

  handleDataFilter(event) {
    const newDataType = this.dataFilter.value;

    // Save current search for the previous data type
    const previousDataType = this.filterPrefs.getLastDataType();
    this.filterPrefs.saveFilterState(previousDataType, this.searchInput.value);

    // Save new data type selection
    this.filterPrefs.saveLastDataType(newDataType);

    // Load search value for new data type
    const savedSearch = this.filterPrefs.getFilterState(newDataType);
    this.searchInput.value = savedSearch;
    if (savedSearch.length > 0) {
      this.clearSearch.classList.remove('hidden');
    } else {
      this.clearSearch.classList.add('hidden');
    }

    // Update table
    this.updateTableCtrls();
    this.generateTableHeaders();
    this.clearTable();

    const searchTerm = this.searchInput.value.trim();
    // Debounce this in a real application

    this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);
  }

  handleHeaderClick(event) {
    // Find the closest th element
    const header = event.target.closest('th');
    if (!header || !header.classList.contains('sortable')) return;

    const field = header.getAttribute('data-field');

    // Update sort direction  
    if (this.sortField === field) {
      // Toggle direction if already sorting by this field
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New sort field, default to ascending
      this.sortField = field;
      this.sortDirection = 'asc';
    }

    const searchTerm = this.searchInput.value.trim();
    this.loadFungiSamples(searchTerm, this.sortField, this.sortDirection);
    // better load sorted data from db
    // Sort and re-render
    // this.sortData();
    //
    // this.renderTable();
  }

  handleRowClick(event) {
    // Find the closest tr element
    const row = event.target.closest('tr');
    if (!row) return;

    // Get the data-id value
    const sampleId = row.getAttribute('data-id');
    if (!sampleId) return;

    // Update selection
    this.selectedSampleId = sampleId;

    // Update UI - remove selected class from all rows
    this.tableBody.querySelectorAll('tr').forEach(r => {
      r.classList.remove('selected');
    });

    // Add selected class to clicked row
    row.classList.add('selected');

    // Enable action buttons
    this.editButton.disabled = false;
    this.deleteButton.disabled = false;
  }

  async handleNew() {
    // Here you would open a modal with a form for creating a new fungi sample
    // DEBUG: 
    // this.fungiService.testPouchDBFindAndSort();
    this.fungiSampleForm.openModal();
  }

  async handleEdit() {
    const selectedSample = this.getSelectedSample();
    if (!selectedSample) return;
    // Here you would open a modal with a form for editing the selected fungi sample
    // console.log('Edit fungi sample button clicked', selectedSample);
    this.fungiSampleForm.loadFungiSampleForEdit(selectedSample._id);
    // this.fungiSampleForm.openModal();
    // Implementation would depend on your modal/form system
  }

  async handleDelete() {
    const selectedSample = this.getSelectedSample();
    if (!selectedSample) return;

    if (confirm(`Sei sicuro di voler rimuovere ${selectedSample.taxonGenus} ${selectedSample.taxonSpecies}?`)) {
      try {
        await this.fungiService.delete(selectedSample._id);

        // Remove from local array
        this.fungiSamples = this.fungiSamples.filter(sample => sample._id !== selectedSample._id);

        // Clear selection
        this.selectedSampleId = null;
        this.editButton.disabled = true;
        this.deleteButton.disabled = true;

        // Re-render table
        this.renderTable();
      } catch (error) {
        console.error('Error deleting fungi sample:', error);
        this.showError('Errore durante la rimozione del campione. Prova ancora.');
      }
    }
  }

  async handleIF() {
    const selectedSample = this.getSelectedSample();
    if (!selectedSample) return;
    const fullUrl = `https://www.indexfungorum.org/names/NamesRecord.asp?RecordID=${selectedSample.speciesFungorumRecordId}`;
    window.open(fullUrl, '_blank');
  }

  async handleCol() {
    const selectedSample = this.getSelectedSample();
    if (!selectedSample) return;
    try {
      const text = `${selectedSample.taxonGenus} ${selectedSample.taxonSpecies}`;
      await navigator.clipboard.writeText(text);
      console.log('Text copied to clipboard: ' + text);
      // Open CoL (Catalogue of Life) in new tab
      window.open('https://www.catalogueoflife.org/', '_blank');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('Text copied to clipboard (fallback): ' + text);
      } catch (fallbackErr) {
        console.error('Fallback copy failed: ', fallbackErr);
      }
      document.body.removeChild(textArea);
      // Still open the new tab even if copy fails
      window.open('https://www.catalogueoflife.org/', '_blank');
    }
  }

  // Utility functions

  formatDate(dateString) {
    if (!dateString) return '';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (error) {
      return dateString;
    }
  }

  escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';

    // Return the string directly without HTML escaping
    // This is safe for textContent but would not be safe for innerHTML
    return unsafe.toString();
  }
}

export { FungiTableComponent };