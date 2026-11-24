// Fungi Sample Form Component
// uses /js/models/fungiSample.js';
// uses /js/services/FungiService.js';

import DOMPurify from 'dompurify';
import { UserPreferences } from '../utils/userPreferences.js';

class FungiFormPreferences extends UserPreferences {
  constructor() {
    super('fungiSampleFormPreferences');
  }

  saveLastFieldValue(field, value) {
    this.set(`last-${field}`, value);
  }

  getLastFieldValue(field) {
    return this.get(`last-${field}`, '');
  }
}

class FungiSampleForm {
  constructor(config) {
    this.fungiSampleModel = config.fungiSampleModel;
    this.fungiService = config.fungiService;
    this.currentId = null;
    this.isEditing = false;
    this.autoCompleteData = {};
    this.isFormDirty = false;
    this.originalFormData = {}
    this.savedFormFields = [
      'collector',
      'collectionDate',
      'locality',
      'localityElevation',
      'localityCoordinates',
      'habitat',
      'notes',
      'determiner',
      'exsiccataCode',
      'useGPS'
    ]
    this.isGPSMode = false;
    this.isCapturingGPS = false;
  }

  // Initialize form
  async init() {
    // Get modal elements
    this.modal = document.getElementById('fungi-sample-modal');
    if (!this.modal) return;

    this.closeModalBtn = document.querySelector('.close-modal');

    // Get form elements
    this.form = document.getElementById('fungi-sample-form');
    this.formTitle = document.getElementById('form-title');
    this.fungiIdInput = document.getElementById('fungi-id');
    this.cancelBtn = document.getElementById('cancel-edit');
    this.sampleInfo = document.getElementById('sampleInfo');

    // Get GPS-related elements
    this.gpsCheckbox = document.getElementById('gpsCheckbox');
    this.useGPS = document.getElementById('useGPS');
    this.gpsCoordinatesRow = document.getElementById('gpsCoordinatesRow');
    this.gpsCoordinatesInput = document.getElementById('gpsCoordinates');
    this.refreshGPSBtn = document.getElementById('refreshGPS');
    this.gpsStatusSpan = document.getElementById('gpsStatus');
    this.manualLocalityRow = document.getElementById('manualLocalityRow');
    this.manualLocalityDetailsRow = document.getElementById('manualLocalityDetailsRow');

    // Get all form input fields
    this.formFields = {};
    this.fungiSampleModel.allFields.forEach(field => {
      // Skip type and fields starting with _
      if (field === 'type' || field === 'sampleType' || field.startsWith('_')) return;
      const element = document.getElementById(field);
      if (element) {
        this.formFields[field] = element;
      }
    });

    // Fetch and set up autocomplete data
    await this.setupAutocompleteData();

    // Set up event listeners
    this.setupEventListeners();

    this.fungiFormPrefs = new FungiFormPreferences();
  }

  // Fetch autocomplete data for all fields
  async refreshAutocompleteData() {
    try {
      for (const field in this.formFields) {
        // Skip select elements (already have options)
        if (this.formFields[field].tagName === 'SELECT') continue;
        // fields without autocomplete
        if (field === 'collectionDate') continue;
        if (field === 'localityCoordinates') continue;
        if (field === 'notes') continue;
        // fields managed with db queries
        if (field === 'taxonGenus') continue;
        if (field === 'taxonSpecies') continue;
        if (field === 'authority') continue;

        // Get unique values for this field
        const values = await this.fungiService.getAllUniqueValues(field);
        this.autoCompleteData[field] = values;
      }
      console.log('Autocomplete data refreshed');
    } catch (err) {
      console.error('Error refreshing autocomplete data', err);
    }
  }

  async setupAutocompleteData() {
    try {
      for (const field in this.formFields) {
        // Skip select elements (already have options)
        if (this.formFields[field].tagName === 'SELECT') continue;
        // fields without autocomplete
        if (field === 'collectionDate') continue;
        if (field === 'localityCoordinates') continue;
        if (field === 'notes') continue;
        // fields managed with db queries
        if (field === 'taxonGenus' || field === 'taxonSpecies' || field === 'authority') {
          this.setupFieldAutocomplete(field, []);
          continue;
        }

        // Get unique values for this field
        const values = await this.fungiService.getAllUniqueValues(field);
        this.autoCompleteData[field] = values;
        // Set up autocomplete for this field (only during initialization)
        this.setupFieldAutocomplete(field, values);
      }
    } catch (err) {
      console.error('Error setting up autocomplete data', err);
    }
  }

  // Set up autocomplete for a specific field
  setupFieldAutocomplete(field, initialValues) {
    const inputElement = this.formFields[field];
    if (!inputElement || inputElement.tagName === 'SELECT') return;

    // Check if autocomplete is already set up for this field
    if (inputElement.hasAttribute('data-autocomplete-setup')) {
      return;
    }

    // Mark as set up
    inputElement.setAttribute('data-autocomplete-setup', 'true');

    // Disable browser's default autocomplete
    inputElement.setAttribute('autocomplete', 'off');

    // Create autocomplete container
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';
    autocompleteContainer.style.display = 'none';
    autocompleteContainer.style.position = 'absolute';
    autocompleteContainer.style.width = '100%';
    autocompleteContainer.style.maxHeight = '200px';
    autocompleteContainer.style.overflowY = 'auto';
    autocompleteContainer.style.backgroundColor = '#fff';
    autocompleteContainer.style.border = '1px solid #ddd';
    autocompleteContainer.style.borderTop = 'none';
    autocompleteContainer.style.zIndex = '1000';

    // Store reference to container on the input element
    inputElement.autocompleteContainer = autocompleteContainer;

    // Insert container after input
    inputElement.parentNode.style.position = 'relative';
    inputElement.parentNode.insertBefore(autocompleteContainer, inputElement.nextSibling);

    // Add input event listener
    inputElement.addEventListener('input', async () => {
      this.isFormDirty = true;
      const inputValue = inputElement.value.trim().toLowerCase();

      // Close autocomplete list if input is empty
      if (!inputValue) {
        autocompleteContainer.style.display = 'none';
        return;
      }

      let matches = [];
      if (field === 'taxonGenus' && inputValue.length > 0) {
        matches = await this.fungiService.getGenus(inputValue);
      } else if (field === 'taxonSpecies' && inputValue.length > 0) {
        const genus = this.formFields.taxonGenus.value.trim();
        if (genus.length > 0)
          matches = await this.fungiService.getSpecies(genus, inputValue);
      } else {
        // Use current data from this.autoCompleteData
        const currentValues = this.autoCompleteData[field] || [];

        // Filter values
        matches = currentValues.filter(value =>
          value && value.toString().toLowerCase().includes(inputValue)
        );
      }

      // Display matches
      if (matches.length > 0) {
        autocompleteContainer.innerHTML = '';
        autocompleteContainer.style.display = 'block';

        matches.forEach(match => {
          const item = document.createElement('div');
          item.className = 'autocomplete-item';
          item.textContent = match;

          item.addEventListener('click', () => {
            inputElement.value = match;
            autocompleteContainer.style.display = 'none';
            this.isFormDirty = true;
          });

          item.addEventListener('mouseover', () => {
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
        this.isFormDirty = true;
      }

      // Escape
      else if (e.key === 'Escape') {
        autocompleteContainer.style.display = 'none';
      }
    });
  }

  validateBinomialNomenclature(value, type) {
    if (!value || !value.trim()) return value;

    let formatted;

    if (type === 'genus') {
      formatted = value.trim();
      // Genus should be capitalized and contain only letters
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
      // Remove any non-letter characters except spaces/hyphens for compound names
      formatted = formatted.replace(/[^a-zA-Z\s-]/g, '');
    } else if (type === 'species') {
      formatted = value;
      // Species should be lowercase and contain only letters
      formatted = formatted.toLowerCase();
      // Remove any non-letter characters except spaces, hyphens and periods
      formatted = formatted.replace(/[^a-zA-Z\s.-]/g, '');
      // Replace multiple consecutive spaces with a single space
      formatted = formatted.replace(/\s+/g, ' ');
    }

    return formatted;
  }

  // Check and auto-complete authority field and current name
  async autoCompleteAuthority() {
    const genusField = this.formFields.taxonGenus;
    const speciesField = this.formFields.taxonSpecies;
    const authorityField = this.formFields.authority;
    const currentNameField = document.getElementById('currentName');
    const currentNameRow = document.getElementById('currentNameRow');

    if (!genusField || !speciesField || !authorityField) return;

    const genus = genusField.value.trim();
    const species = speciesField.value.trim();

    if (!genus || !species) {
      // Clear authority if genus or species is empty
      if (!authorityField.value.trim() || authorityField.dataset.autoCompleted === 'true') {
        authorityField.value = '';
        authorityField.dataset.autoCompleted = 'false';
      }
      return;
    }

    const foundAuthority = await this.fungiService.getAuthority(genus, species);
    if (Object.keys(foundAuthority).length === 0 &&
      foundAuthority.constructor === Object) {
      // Clear authority if it was auto-completed but combination no longer exists
      if (authorityField.dataset.autoCompleted === 'true') {
        authorityField.value = '';
        authorityField.dataset.autoCompleted = 'false';
      }
    } else {
      // Only auto-complete if authority field is empty or was previously auto-completed
      if (!authorityField.value.trim() || authorityField.dataset.autoCompleted === 'true') {
        authorityField.value = foundAuthority.authority;
        authorityField.dataset.autoCompleted = 'true';
        if (foundAuthority.currentName) {
          currentNameField.innerHTML = DOMPurify.sanitize(foundAuthority.currentName);
          currentNameRow.classList.remove('hidden');
        }
      }
    }
  }

  // Function to show clear button when field has content
  showClearButtonIfNeeded(fieldName) {
    const field = document.getElementById(fieldName);
    const clearButton = document.getElementById('clear-' + fieldName);

    if (field && clearButton) {
      const hasContent = field.value && field.value.trim() !== '';
      if (hasContent)
        clearButton.classList.remove('hidden');
      else
        clearButton.classList.add('hidden');
    }
  }

  // Toggle GPS mode
  toggleGPSMode(enabled) {
    this.isGPSMode = enabled;

    if (enabled) {
      // Hide manual locality fields
      this.manualLocalityRow.style.display = 'none';
      this.manualLocalityDetailsRow.style.display = 'none';

      if (this.formFields.locality) {
        this.formFields.locality.value = '';
        this.formFields.locality.removeAttribute('required');
      }

      // Show GPS coordinates row
      this.gpsCoordinatesRow.style.display = 'block';

      // Clear manual fields
      if (this.formFields.localityElevation) this.formFields.localityElevation.value = '';
      if (this.formFields.localityCoordinates) this.formFields.localityCoordinates.value = '';

      // Capture GPS coordinates
      this.captureGPSCoordinates();
    } else {
      // Show manual locality fields
      this.manualLocalityRow.style.display = 'block';
      this.manualLocalityDetailsRow.style.display = 'flex';

      // Restore required attribute
      if (this.formFields.locality) {
        this.formFields.locality.setAttribute('required', '');
      }

      // Hide GPS coordinates row
      this.gpsCoordinatesRow.style.display = 'none';

      // Clear GPS field
      this.gpsCoordinatesInput.value = '';
      this.gpsStatusSpan.textContent = '';
    }
  }

  async captureGPSCoordinates() {
    if (this.isCapturingGPS) return;

    this.isCapturingGPS = true;
    this.gpsStatusSpan.textContent = 'Acquisizione...';
    this.gpsStatusSpan.style.color = '#666';
    this.gpsCoordinatesInput.value = '';

    if (!navigator.geolocation) {
      this.gpsStatusSpan.textContent = 'GPS non disponibile';
      this.gpsStatusSpan.style.color = '#ea4335';
      this.isCapturingGPS = false;
      return;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      // Check if accuracy is good enough (GPS typically < 50m, IP-based is often > 1000m)
      const accuracy = position.coords.accuracy;

      if (accuracy > 100) { // Adjust threshold as needed
        throw new Error(`Precisione GPS insufficiente (${Math.round(accuracy)}m)`);
      }

      const lat = position.coords.latitude.toFixed(6);
      const lon = position.coords.longitude.toFixed(6);
      const coordinates = `${lat}, ${lon}`;

      this.gpsCoordinatesInput.value = coordinates;
      this.gpsStatusSpan.textContent = `✓ (±${Math.round(accuracy)}m)`;
      this.gpsStatusSpan.style.color = '#34a853';
      this.isFormDirty = true;

    } catch (error) {
      console.error('Error capturing GPS coordinates:', error);
      this.gpsStatusSpan.textContent = error.message || 'GPS non disponibile';
      this.gpsStatusSpan.style.color = '#ea4335';
    } finally {
      this.isCapturingGPS = false;
    }
  }

  // Set up event listeners
  setupEventListeners() {
    // GPS checkbox
    if (this.useGPS) {
      this.useGPS.addEventListener('change', (e) => {
        this.isFormDirty = true;
        this.toggleGPSMode(e.target.checked);
      });
    }

    // GPS refresh button
    if (this.refreshGPSBtn) {
      this.refreshGPSBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.captureGPSCoordinates();
      });
    }

    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Use event delegation to handle all clear buttons with a single listener
    this.form.addEventListener('click', function (event) {
      // Check if the clicked element is a clear button
      if (event.target.classList.contains('clear-form-input-btn') || event.target.classList.contains('clear-form-text-btn')) {
        const buttonId = event.target.id;

        // Extract field name from button ID (remove 'clear-' prefix)
        const fieldName = buttonId.replace('clear-', '');

        // Find the corresponding form element
        const formElement = document.getElementById(fieldName);

        if (formElement) {
          // Clear the field based on its type
          const tagName = formElement.tagName.toLowerCase();

          // works only with input text and textarea elements
          if (formElement.value !== undefined) {
            formElement.value = '';
          }
          // Hide the clear button after clearing
          event.target.classList.add('hidden');

          // Trigger change event to notify other scripts
          formElement.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // clear authorithy and current name when clearing taxon fields
        if (fieldName === 'taxonGenus' || fieldName === 'taxonSpecies') {
          const authorityField = document.getElementById('authority');
          if (authorityField) {
            authorityField.value = '';
            authorityField.dataset.autoCompleted = 'false';
          }
          const currentNameField = document.getElementById('currentName');
          if (currentNameField) {
            currentNameField.innerHTML = '';
            const currentNameRow = document.getElementById('currentNameRow');
            currentNameRow.classList.add('hidden');
          }
        }
      }
    });

    // Cancel button
    this.cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.attemptToCloseForm();
    });

    // Close modal button
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => {
        this.attemptToCloseForm();
      });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.attemptToCloseForm();
      }
    });

    // Track form changes with binomial nomenclature validation and authority auto-completion
    for (const field in this.formFields) {
      if (this.formFields[field]) {
        // Special handling for taxonomic fields
        if (field === 'taxonGenus' || field === 'taxonSpecies') {
          this.formFields[field].addEventListener('input', (e) => {
            this.isFormDirty = true;
            this.showClearButtonIfNeeded(field);

            // Real-time validation and formatting
            const type = field === 'taxonGenus' ? 'genus' : 'species';
            const currentValue = e.target.value;
            const formattedValue = this.validateBinomialNomenclature(currentValue, type);

            // Only update if the value actually changed (prevents cursor jumping)
            if (currentValue !== formattedValue) {
              const cursorPosition = e.target.selectionStart;
              e.target.value = formattedValue;
              // Restore cursor position
              e.target.setSelectionRange(cursorPosition, cursorPosition);
            }
          });

          // Check for authority auto-completion on blur
          this.formFields[field].addEventListener('blur', (e) => {
            const type = field === 'taxonGenus' ? 'genus' : 'species';
            const formattedValue = this.validateBinomialNomenclature(e.target.value, type);
            e.target.value = formattedValue;

            // Check and auto-complete authority after formatting
            setTimeout(() => this.autoCompleteAuthority(), 300);
          });
        }
        // Special handling for authority field
        else if (field === 'authority') {
          this.formFields[field].addEventListener('input', () => {
            this.isFormDirty = true;
            this.showClearButtonIfNeeded(field);
            // Mark that user has manually edited authority
            this.formFields[field].dataset.autoCompleted = 'false';
          });
        }
        else {
          // Standard input handling for other fields
          this.formFields[field].addEventListener('input', () => {
            this.isFormDirty = true;
            this.showClearButtonIfNeeded(field);
          });
        }
      }
    }

    // Prevent accidental navigation away from dirty form
    window.addEventListener('beforeunload', (e) => {
      if (this.isFormDirty && this.modal.style.display === 'block') {
        e.preventDefault();
        return '';
      }
    });
  }

  // Toggle exsiccata code field visibility
  toggleExsiccataCodeField() {
    const selectedType = document.getElementById('data-type').value;
    if (selectedType === 'exsiccata') {
      this.sampleInfo.classList.remove('hidden');
    } else {
      this.sampleInfo.classList.add('hidden');
    }
  }

  // Attempt to close form, checking for unsaved changes
  attemptToCloseForm() {
    if (this.isFormDirty) {
      const confirmClose = confirm('Ci sono modifiche non salvate. Sei sicuro di voler chiuder questa scheda?');
      if (!confirmClose) {
        return;
      }
    }

    this.closeModal();
    this.resetForm();
  }

  // Open modal
  openModal() {
    this.modal.style.display = 'block';

    // Reset scroll position to top
    const modalContent = this.modal.querySelector('.large-form-modal-content');
    if (modalContent) {
      modalContent.scrollTop = 0;
    }
    // Reset current name as hidden
    const currentNameRow = document.getElementById('currentNameRow');
    currentNameRow.classList.add('hidden');

    // Show GPS option on new form
    if (!this.isEditing) {
      this.gpsCheckbox.style.display = 'block';
    }

    // Pre-set form fields values
    this.toggleExsiccataCodeField();
    // saved fields
    this.restoreLastFieldValues();
    // set collection date to today if empty
    if (document.getElementById('collectionDate').value === '') {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('collectionDate').value = today;
    }
    // Add animation class if it exists
    setTimeout(() => {
      this.modal.classList.add('modal-open');
      // Double-check scroll reset after animation
      if (modalContent) {
        modalContent.scrollTop = 0;
      }
    }, 10);
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  closeModal() {
    this.modal.classList.remove('modal-open');

    // Allow time for animation to complete
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 300);
    document.body.style.overflow = '';
  }

  restoreLastFieldValues() {
    // Restore last field values from user preferences
    for (const field of this.savedFormFields) {
      if (field === 'useGPS') {
        const lastGPSValue = this.fungiFormPrefs.getLastFieldValue('useGPS');
        if (lastGPSValue === 'true') {
          this.useGPS.checked = true;
          this.toggleGPSMode(true);
        }
        continue;
      }

      const lastValue = this.fungiFormPrefs.getLastFieldValue(field);
      if (lastValue) {
        const fieldElement = this.formFields[field];
        if (fieldElement) {
          fieldElement.value = lastValue;
          this.showClearButtonIfNeeded(field);
        }
      }
    }
  }

  saveLastFieldValues() {
    // Save last field values in user preferences
    for (const field of this.savedFormFields) {
      if (field === 'useGPS') {
        this.fungiFormPrefs.saveLastFieldValue('useGPS', this.useGPS.checked.toString());
        continue;
      }

      const fieldValue = this.formFields[field] ? this.formFields[field].value.trim() : '';
      this.fungiFormPrefs.saveLastFieldValue(field, fieldValue);
    }
  }

  restoreDocFieldValues(doc) {
    // Restore last field values from doc
    for (const field of this.savedFormFields) {
      if (field === 'useGPS') continue; // Skip GPS checkbox when editing

      const fieldElement = this.formFields[field];
      if (fieldElement) {
        fieldElement.value = doc[field] || '';
        this.showClearButtonIfNeeded(field);
      }
    }
  }

  // Handle form submission
  async handleSubmit() {
    try {
      // If GPS mode is active, copy coordinates to locality field
      if (this.isGPSMode && this.gpsCoordinatesInput.value.trim()) {
        if (this.formFields.locality) {
          this.formFields.locality.value = this.gpsCoordinatesInput.value.trim();
        }
        if (this.formFields.localityCoordinates) {
          this.formFields.localityCoordinates.value = this.gpsCoordinatesInput.value.trim();
        }
      }

      // Validate form data
      if (!this.validateForm()) {
        return;
      }

      // Get form data
      const fungiSampleData = this.getFormData();

      // Save last field values in user preferences
      this.saveLastFieldValues();

      // Determine if creating or updating
      let result;
      if (this.isEditing) {
        result = await this.fungiService.update(fungiSampleData);
      } else {
        result = await this.fungiService.create(fungiSampleData);
      }

      // Show success message
      this.showMessage('success', `Campione ${this.isEditing ? 'aggiornato' : 'creato'}.`);

      // Reset form and close modal
      this.resetForm();
      this.closeModal();

      // Trigger event to refresh fungi sample list
      window.dispatchEvent(new CustomEvent('fungi-sample-saved'));

    } catch (err) {
      console.error('Error saving fungi sample', err);
      this.showMessage('error', `Errore ${this.isEditing ? 'aggiornando' : 'creando'} il campione`);
    }
  }

  // Get form data
  getFormData() {
    const fungiSample = {};

    // Get values from all form fields
    for (const field in this.formFields) {
      if (this.formFields[field]) {
        fungiSample[field] = this.formFields[field].value.trim();
      }
    }

    // Add sampleType
    const sampleType = document.getElementById('data-type') ? document.getElementById('data-type').value : '';
    fungiSample.sampleType = sampleType;

    // Add ID if editing
    if (this.isEditing && this.currentId) {
      fungiSample._id = this.currentId;
    }

    return fungiSample;
  }

  // Save the original form data for dirty check
  saveOriginalFormData() {
    this.originalFormData = this.getFormData();
    this.isFormDirty = false;
  }

  // Validate form data
  validateForm() {
    // Clear previous error messages
    const errorElements = this.form.querySelectorAll('.error-message');
    errorElements.forEach(el => el.remove());

    let isValid = true;

    // Validate required fields
    this.fungiSampleModel.requiredFields.forEach(field => {
      const inputElement = this.formFields[field];
      if (inputElement && !inputElement.value.trim()) {
        this.showInputError(inputElement, `${this.formatFieldName(field)} è obbligatorio`);
        isValid = false;
      }
    });

    // Special validation for GPS mode - check if coordinates were captured
    if (this.isGPSMode && !this.gpsCoordinatesInput.value.trim()) {
      this.showMessage('error', 'Coordinate GPS non disponibili');
      isValid = false;
    }

    return isValid;
  }

  // Format field name for display
  formatFieldName(field) {
    // Convert camelCase to Title Case
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  }

  // Show input error
  showInputError(inputElement, message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;

    // Insert error message after input
    inputElement.parentNode.insertBefore(errorElement, inputElement.nextSibling);

    // Highlight input
    inputElement.style.borderColor = '#ea4335';

    // Add event listener to clear error when input changes
    const clearError = () => {
      if (errorElement.parentNode) {
        errorElement.remove();
        inputElement.style.borderColor = '';
        inputElement.removeEventListener('input', clearError);
      }
    };

    inputElement.addEventListener('input', clearError);
  }

  // Show message
  showMessage(type, message) {
    // Check if message container exists
    let messageContainer = document.getElementById('form-message');

    // Create if not exists
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'form-message';
      document.body.appendChild(messageContainer);
    }

    // Set message
    messageContainer.textContent = message;
    messageContainer.className = `message ${type}`;

    // Style message
    if (type === 'success') {
      messageContainer.style.backgroundColor = '#d4edda';
      messageContainer.style.color = '#155724';
    } else {
      messageContainer.style.backgroundColor = '#f8d7da';
      messageContainer.style.color = '#721c24';
    }

    messageContainer.style.padding = '0.75rem';
    messageContainer.style.marginBottom = '1rem';
    messageContainer.style.borderRadius = '4px';
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '20px';
    messageContainer.style.right = '20px';
    messageContainer.style.zIndex = '2000';
    messageContainer.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

    // Clear message after delay
    setTimeout(() => {
      messageContainer.remove();
    }, 3000);
  }

  // Load fungi sample data into form for editing
  async loadFungiSampleForEdit(fungiSampleId) {
    try {
      // Get fungi sample data
      const fungiSample = await this.fungiService.getById(fungiSampleId);

      // Set form to edit mode
      this.isEditing = true;
      this.currentId = fungiSampleId;
      this.formTitle.textContent = 'Modifica campione';

      // Set form values for all fields
      for (const field in this.formFields) {
        if (this.formFields[field] && fungiSample[field] !== undefined) {
          this.formFields[field].value = fungiSample[field] || '';
          this.showClearButtonIfNeeded(field);

          // Reset auto-completion state for authority field
          if (field === 'authority') {
            this.formFields[field].dataset.autoCompleted = 'false';
          }
        }
      }

      this.fungiIdInput.value = fungiSampleId;

      // Open modal
      this.openModal();

      // Override form fields pre-sets with loaded data
      this.restoreDocFieldValues(fungiSample);

      // Always hide GPS option when editing
      this.gpsCheckbox.style.display = 'none';
      this.toggleGPSMode(false);
      this.useGPS.checked = false;

      // Verify currentName
      const foundAuthority = await this.fungiService.getAuthority(fungiSample.taxonGenus, fungiSample.taxonSpecies);
      if (foundAuthority && Object.keys(foundAuthority).length > 0 && foundAuthority.constructor === Object) {
        if (foundAuthority.currentName) {
          const currentNameField = document.getElementById('currentName');
          currentNameField.innerHTML = DOMPurify.sanitize(foundAuthority.currentName);
          const currentNameRow = document.getElementById('currentNameRow');
          currentNameRow.classList.remove('hidden');
        }
      }

      // Save original form data
      this.saveOriginalFormData();

    } catch (err) {
      console.error('Error loading fungi sample for edit', err);
      this.showMessage('error', 'Errore durante il caricamento dei dati.');
    }
  }

  // Reset form
  resetForm() {
    // Clear form
    this.form.reset();

    // Reset GPS mode
    this.isGPSMode = false;
    this.useGPS.checked = false;
    this.gpsCoordinatesRow.style.display = 'none';
    this.manualLocalityRow.style.display = 'block';
    this.manualLocalityDetailsRow.style.display = 'flex';
    this.gpsCoordinatesInput.value = '';
    this.gpsStatusSpan.textContent = '';

    // Reset edit mode
    this.isEditing = false;
    this.currentId = null;
    this.formTitle.textContent = 'Aggiungi un nuovo campione';
    this.fungiIdInput.value = '';

    // Reset exsiccata code visibility
    this.sampleInfo.classList.add('hidden');

    // Clear any error styling
    for (const field in this.formFields) {
      if (this.formFields[field]) {
        this.formFields[field].style.borderColor = '';
        this.showClearButtonIfNeeded(field);
      }
    }

    // Reset form dirty state
    this.isFormDirty = false;
    this.originalFormData = {};

    if (this.modal) {
      const modalContent = this.modal.querySelector('.large-form-modal-content');
      if (modalContent) {
        modalContent.scrollTop = 0;
      }
    }
  }
};

export { FungiSampleForm };