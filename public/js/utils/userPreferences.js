/**
 * Generic User Preferences Helper
 * Manages user preferences with localStorage persistence
 */
class UserPreferences {
    constructor(storageKey = 'userPreferences') {
        this.storageKey = storageKey;
        this.preferences = this.loadPreferences();
    }

    /**
     * Load preferences from localStorage
     * @returns {Object} preferences object
     */
    loadPreferences() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to load preferences:', error);
            return {};
        }
    }

    /**
     * Save preferences to localStorage
     */
    savePreferences() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
        } catch (error) {
            console.warn('Failed to save preferences:', error);
        }
    }

    /**
     * Set a preference value
     * @param {string} key - preference key
     * @param {any} value - preference value
     */
    set(key, value) {
        this.preferences[key] = value;
        this.savePreferences();
    }

    /**
     * Get a preference value
     * @param {string} key - preference key
     * @param {any} defaultValue - default value if key doesn't exist
     * @returns {any} preference value or default
     */
    get(key, defaultValue = null) {
        return this.preferences.hasOwnProperty(key) ? this.preferences[key] : defaultValue;
    }

    /**
     * Set multiple preferences at once
     * @param {Object} prefs - object with key-value pairs
     */
    setMultiple(prefs) {
        Object.assign(this.preferences, prefs);
        this.savePreferences();
    }

    /**
     * Get multiple preferences
     * @param {Array} keys - array of keys to retrieve
     * @returns {Object} object with requested preferences
     */
    getMultiple(keys) {
        const result = {};
        keys.forEach(key => {
            result[key] = this.get(key);
        });
        return result;
    }

    /**
     * Remove a preference
     * @param {string} key - preference key to remove
     */
    remove(key) {
        delete this.preferences[key];
        this.savePreferences();
    }

    /**
     * Clear all preferences
     */
    clear() {
        this.preferences = {};
        this.savePreferences();
    }

    /**
     * Get all preferences
     * @returns {Object} all preferences
     */
    getAll() {
        return { ...this.preferences };
    }
}

export { UserPreferences };