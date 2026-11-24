import PouchDB from 'pouchdb-browser';
import find from 'pouchdb-find';

PouchDB.plugin(find);

// uses /js/models/fungiSample.js';
// uses /js/services/auth/auth.events.js';
// uses /js/services/auth/auth.service.js';
// uses /js/services/connection.js';

/* do not create local indexes
const dbDefaultIndexes = [
    // INDEX FOR QUERIES
    // query for type 'census' and 'locations'
    ['type'],
    // query for type 'fungiSample'
    ['type', 'sampleType'],
    // looking for 'authority'
    ['type', 'sampleType', 'taxonGenus', 'taxonSpecies'],
    // looking for 'localityCoordinates'
    ['type', 'location'],
    // INDEX FOR QUERIES & SORTING
    // 'census'
    ['type', 'taxonGenus', 'taxonSpecies'],
    // looking for 'authority'
    ['type', 'sampleType', 'taxonGenus', 'taxonSpecies'],
    // 'locations'
    ['type', 'location'],
    // queries for sorting type 'fungiSample'
    ['type', 'sampleType', 'taxonGenus'],
    ['type', 'sampleType', 'taxonSpecies'],
    ['type', 'sampleType', 'collectionDate'],
    ['type', 'sampleType', 'collector'],
    ['type', 'sampleType', 'locality'],
    ['type', 'sampleType', 'habitat']
];

const dbTextIndexes = [
    // apparently this slow down the db inittialization 
    // and not having it does not create any issues on searching
    // ['taxonGenus', 'taxonSpecies', 'authority', 'collector', 'locality', 'localityElevation', 'localityCoordinates', 'habitat', 'notes', 'determiner', 'exsiccataCode']
];

// Helper function to normalize field format
function normalizeField(field) {
    if (typeof field === 'string') {
        return { [field]: 'asc' }; // Default direction is ascending
    }
    return field; // Already an object like {type: 'asc'}
}

// Helper function to compare two field objects
function fieldsEqual(field1, field2) {
    const normalized1 = normalizeField(field1);
    const normalized2 = normalizeField(field2);

    const keys1 = Object.keys(normalized1);
    const keys2 = Object.keys(normalized2);

    if (keys1.length !== keys2.length) return false;

    return keys1.every(key =>
        keys2.includes(key) && normalized1[key] === normalized2[key]
    );
}

function generateIndexName(fields) {
    return fields.map(f => f.toLowerCase()).join('_');
}
*/

class DatabaseService extends EventTarget {
    constructor(config) {
        super();
        this.fungiSampleModel = config.fungiSampleModel;
        this.connectionService = config.connectionService;
        this.authService = config.authService;
        this.authEvents = config.authEvents;
        this.localDB = null;
        this.remoteDB = null;
        this.syncHandler = null;
        this.serverUrl = '/db';
        this.localDbName = 'inventory_local';
        this.remoteDbName = null;
        this.isOnline = this.connectionService.online();
        this.syncState = 'inactive'; // inactive, active, change, paused, error, complete
        this.syncDebounceTimeout = null;
        this.syncDebounceDelay = 300; // ms - prevents rapid state changes
        this.manuallyStoppedSync = false; // Flag to track if sync was manually stopped
        this.isRemoteDbInitialized = false;

        // Set up auth state listeners
        this.setupAuthListeners();

        // Set up connection state listeners
        this.setupConnectionListeners();
    }

    async setupAuthListeners() {
        // Initialize on startup if user is already authenticated
        if (this.authService.isSyncOnline() && this.connectionService.online()) {
            await this.initializeRemoteDB();
            if (this.isOnline && this.isRemoteDbInitialized) {
                await this.startSync();
            }
        }
        // Initialize or reinitialize DB when auth state changes
        this.authEvents.on(this.authEvents.eventTypes.SYNC_ONLINE, async () => {
            // Initialize remote DB with the fetched name
            await this.initializeRemoteDB();

            // Only start sync if online and remote DB is properly initialized
            if (this.isOnline && this.isRemoteDbInitialized) {
                await this.startSync();
            }
        });

        this.authEvents.on(this.authEvents.eventTypes.SYNC_OFFLINE, async () => {
            this.stopSync();
            this.isRemoteDbInitialized = false;
        });

        this.authEvents.on(this.authEvents.eventTypes.UNAUTHENTICATED, async () => {
            this.stopSync();
            this.remoteDbName = null;
            this.isRemoteDbInitialized = false;
        });

        this.authEvents.on(this.authEvents.eventTypes.REFRESH_SUCCESS, async () => {
            if (this.authService.isSyncOnline()) {
                // When token is refreshed, we need to reinitialize the remote connection
                await this.initializeRemoteDB();
                // Restart sync with new credentials if it was active and we're online
                if (this.isOnline) {
                    if (this.syncHandler) {
                        this.stopSync();
                        await this.startSync();
                    } else {
                        await this.startSync();

                    }
                }
            }
        });
    }

    async setupConnectionListeners() {
        if (this.connectionService.online()) {
            this.isOnline = true;

            // If authenticated, start sync when we go online
            if (this.authService.isAuthenticated() && this.authService.isSyncOnline()) {
                // Initialize remote DB if needed
                if (!this.isRemoteDbInitialized) {
                    await this.initializeRemoteDB();
                }

                // Only start sync if remote DB is properly initialized
                if (this.isRemoteDbInitialized) {
                    await this.startSync();
                }
            }
        }

        // Handle online state
        this.connectionService.on('online', async () => {
            console.log('Connection is now online');
            this.isOnline = true;

            // If authenticated, start sync when we go online
            if (this.authService.isAuthenticated() && this.authService.isSyncOnline()) {
                // Initialize remote DB if needed
                if (!this.isRemoteDbInitialized) {
                    await this.initializeRemoteDB();
                }

                // Only start sync if remote DB is properly initialized
                if (this.isRemoteDbInitialized) {
                    await this.startSync();
                }
            }
        });

        // Handle offline state
        this.connectionService.on('offline', () => {
            console.log('Connection is now offline');
            this.isOnline = false;

            // Mark that we're stopping sync due to connection loss, not user action
            this.manuallyStoppedSync = false;

            // Stop sync when we go offline - we'll continue using local DB
            this.stopSync();

            // Set state to a special "offline" state rather than "inactive"
            this.setSyncState('offline', { reason: 'connection_lost' });
        });
    }

    /*
    async ensureIndexes(indexType = 'default') {
        try {
            // Get all existing indexes
            const existingIndexes = await this.localDB.getIndexes();

            console.log('Existing indexes:', existingIndexes.indexes.length);

            let dbIndexes = [];
            if (indexType === 'text') {
                dbIndexes = dbTextIndexes;
            } else {
                dbIndexes = dbDefaultIndexes;
            }

            for (const indexFields of dbIndexes) {
                try {
                    // Check if this exact index already exists
                    const indexExists = existingIndexes.indexes.some(existingIndex => {
                        if (!existingIndex.def || !existingIndex.def.fields) return false;

                        // Compare field arrays for exact match
                        const existingFields = existingIndex.def.fields;
                        const fieldsMatch = existingFields.length === indexFields.length &&
                            existingFields.every((existingField, i) =>
                                fieldsEqual(existingField, indexFields[i])
                            );

                        return fieldsMatch;
                    });

                    if (indexExists) {
                        console.log(`Index [${indexFields.join(', ')}] already exists, skipping`);
                        continue;
                    }

                    // Create the index
                    console.log(`Creating index [${indexFields.join(', ')}]...`);
                    let result;
                    if (indexType === 'text') {
                        result = await this.localDB.createIndex({
                            index: {
                                fields: indexFields,
                                name: generateIndexName(indexFields),
                                type: 'text'
                            }
                        });
                        console.log(`✓ Created text index [${indexFields.join(', ')}]:`, result.id);
                    } else {
                        result = await this.localDB.createIndex({
                            index: {
                                fields: indexFields,
                                name: generateIndexName(indexFields)
                            }
                        });
                        console.log(`✓ Created index [${indexFields.join(', ')}]:`, result.id);
                    }


                } catch (indexError) {
                    // Handle individual index creation errors
                    if (indexError.status === 409) {
                        console.log(`Index [${indexFields.join(', ')}] already exists (409 conflict)`);
                    } else {
                        console.error(`Failed to create index [${indexFields.join(', ')}]:`, {
                            status: indexError.status,
                            name: indexError.name,
                            message: indexError.message,
                            reason: indexError.reason
                        });
                    }
                }
            }

            console.log('Index creation process completed');

        } catch (error) {
            console.error('Failed to get existing indexes:', {
                status: error.status,
                name: error.name,
                message: error.message
            });
            throw error;
        }
    }
    */

    async initializeLocalDB() {
        if (!this.localDB) {
            this.localDB = new PouchDB(this.localDbName);
            console.log(`Local PouchDB initialized with name: ${this.localDbName}`);
            // 
            // do not create local indexes
            // Old index, probably useless now, but kept for reference
            // this.localDB.createIndex({
            //     index: { fields: this.fungiSampleModel.indexFields }
            // });
            // await this.ensureIndexes();
            // await this.ensureIndexes('text');

            console.log('Database indexes created');
        }
        return this.localDB;
    }

    async fetchRemoteDbName() {
        try {
            // Only attempt to fetch if we're online
            if (this.authService.isAuthenticated()) {
                // Get remote DB name from auth service
                this.remoteDbName = (await this.authService.getSessionInfo()).remoteDbName;
                console.log(`Fetched remote DB name: ${this.remoteDbName}`);
                return this.remoteDbName;
            }
            return null;
        } catch (error) {
            console.error('Error fetching remote DB name:', error);
        }
    }

    async initializeRemoteDB() {
        // Get current auth token
        const token = await this.authService.getToken();

        if (!token) {
            console.error('Cannot initialize remote DB: No authentication token');
            this.isRemoteDbInitialized = false;
            return null;
        }

        // Make sure we have a remote DB name
        if (!this.remoteDbName) {
            await this.fetchRemoteDbName();
            if (!this.remoteDbName) {
                console.error('Cannot initialize remote DB: No remote database name available');
                this.isRemoteDbInitialized = false;
                return null;
            }
        }

        // Store the remote DB name for offline use
        // localStorage.setItem('remoteDbName', this.remoteDbName);

        // Create or reinitialize remote DB connection with auth headers
        this.remoteDB = new PouchDB(`${window.location.origin}${this.serverUrl}/${this.remoteDbName}`, {
            skip_setup: true,
            fetch: (url, opts) => {
                // Add authorization header to each request
                if (opts.headers instanceof Headers) {
                    opts.headers.set('Authorization', `Bearer ${token}`);
                } else {
                    opts.headers = opts.headers || {};
                    opts.headers['Authorization'] = `Bearer ${token}`;
                }
                return fetch(url, opts);
            }
        });

        console.log(`Remote PouchDB connection initialized with auth token and DB name: ${this.remoteDbName}`);
        this.isRemoteDbInitialized = true;
        return this.remoteDB;
    }

    // Set sync state with debouncing to prevent rapid UI changes
    setSyncState(newState, detail = {}) {
        clearTimeout(this.syncDebounceTimeout);

        // If it's an important state (like error, offline), update immediately
        // added 'change' state to show sync progress
        if (newState === 'error' || newState === 'offline' || newState === 'change') {
            this._updateSyncState(newState, detail);
            return;
        }

        // Otherwise debounce to prevent flickering
        this.syncDebounceTimeout = setTimeout(() => {
            this._updateSyncState(newState, detail);
        }, this.syncDebounceDelay);
    }

    _updateSyncState(newState, detail = {}) {
        // Only dispatch event if state actually changed
        if (this.syncState !== newState) {
            const oldState = this.syncState;
            this.syncState = newState;

            // Dispatch event with relevant details
            const eventDetail = {
                oldState,
                newState,
                timestamp: Date.now(),
                ...detail
            };

            console.log(`Sync state changed: ${oldState} -> ${newState}`, eventDetail);
            this.dispatchEvent(new CustomEvent('sync:state-changed', {
                detail: eventDetail
            }));

            // Also dispatch specific events for convenience
            this.dispatchEvent(new CustomEvent(`sync:${newState}`, {
                detail: eventDetail
            }));
        }
    }

    async startSync() {
        // Don't start sync if offline
        if (!this.isOnline) {
            console.log('Cannot start sync: device is offline');
            return;
        }

        // Don't start a new sync if one is already running
        if (this.syncHandler) {
            console.log('Sync already in progress');
            return;
        }

        // Ensure we have both databases initialized
        await this.initializeLocalDB();

        // Check if remote DB is initialized, if not try to initialize it
        if (!this.isRemoteDbInitialized) {
            await this.initializeRemoteDB();
        }

        // If we still don't have a properly initialized remote DB, we can't sync
        if (!this.isRemoteDbInitialized) {
            console.error('Cannot start sync: remote database not initialized');
            return;
        }

        // Reset manual stop flag when starting new sync
        this.manuallyStoppedSync = false;

        // Set initial state as we begin sync
        this.setSyncState('active', { message: 'Starting synchronization' });

        // Start bidirectional sync
        this.syncHandler = this.localDB.sync(this.remoteDB, {
            live: true,
            retry: true,
            back_off_function: delay => {
                if (delay === 0) return 1000;
                return delay * 1.5;
            }
        }).on('change', info => {
            console.log('PouchDB sync change:', info);
            this.setSyncState('change', {
                change: info,
                direction: info.direction,
                docs_read: info.docs_read,
                docs_written: info.docs_written
            });

            // Dispatch detailed change event
            this.dispatchEvent(new CustomEvent('sync:change', {
                detail: { info, timestamp: Date.now() }
            }));
        }).on('paused', info => {
            console.log('PouchDB sync paused');
            this.setSyncState('paused', { info });
        }).on('active', () => {
            console.log('PouchDB sync active');
            this.setSyncState('active');
        }).on('denied', info => {
            console.error('PouchDB sync denied:', info);
            this.setSyncState('error', {
                errorType: 'denied',
                info
            });
        }).on('error', async err => {
            console.error('PouchDB sync error:', err);

            // Set error state immediately (not debounced)
            this.setSyncState('error', {
                errorType: 'sync',
                error: err
            });

            // Check if error is related to authentication
            if (err.status === 401 || err.status === 403) {
                // Try to refresh token
                await this.authService.refreshTokenSilently();
            } else if (err.status === 0 || err.name === 'network_error') {
                // Handle network errors specifically
                console.log('Network error detected during sync');
            }
        }).on('complete', info => {
            console.log('PouchDB one-time sync complete', info);

            // Only process complete event if sync wasn't manually stopped
            // or if we're not already in an offline state
            if (!this.manuallyStoppedSync && this.syncState !== 'offline') {
                // For one-time sync or when replication completes naturally
                this.setSyncState('complete', { info });

                this.dispatchEvent(new CustomEvent('sync:complete', {
                    detail: { info, timestamp: Date.now() }
                }));
            }
        });

        console.log('PouchDB sync started');
    }

    stopSync() {
        if (this.syncHandler) {
            // Set flag to indicate this was a manual/intentional stop
            this.manuallyStoppedSync = true;

            // Cancel the sync
            this.syncHandler.cancel();
            this.syncHandler = null;
            console.log('PouchDB sync stopped');

            // Only update state if we're not already in offline or error state
            if (this.syncState !== 'offline' && this.syncState !== 'error') {
                // Update state and notify listeners
                this.setSyncState('inactive', { reason: 'sync_stopped' });
            }
        }
    }

    /**
     * Get the local database instance
     * This method will always return the local DB, even if offline or not authenticated
     */
    getLocalDatabase() {
        return this.localDB;
    }

    /**
     * Get the database to use for operations
     * This will try to start sync if conditions allow, but will always return the local DB
     */
    async getDatabase() {
        // Always initialize local DB
        await this.initializeLocalDB();

        // Try to start sync if authenticated and online but not already syncing
        if (this.authService.isAuthenticated() && this.isOnline && !this.syncHandler) {
            if (!this.isRemoteDbInitialized) {
                await this.initializeRemoteDB();
            }

            if (this.isRemoteDbInitialized) {
                await this.startSync();
            }
        }

        // Always return local DB regardless of sync status
        return this.localDB;
    }

    /**
     * Force a manual sync attempt if conditions allow
     * Useful for user-triggered sync operations
     */
    async forceSyncNow() {
        if (!this.isOnline) {
            console.log('Cannot force sync: device is offline');
            return { success: false, reason: 'offline' };
        }

        if (!this.authService.isAuthenticated()) {
            console.log('Cannot force sync: not authenticated');
            return { success: false, reason: 'unauthenticated' };
        }

        // Initialize remote DB if needed
        if (!this.isRemoteDbInitialized) {
            await this.initializeRemoteDB();
            if (!this.isRemoteDbInitialized) {
                console.log('Cannot force sync: unable to initialize remote DB');
                return { success: false, reason: 'remote_db_init_failed' };
            }
        }

        // Stop any existing sync and restart
        this.stopSync();
        await this.startSync();
        return { success: true };
    }

    // Check IndexedDB storage size
    async getStorageEstimate() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                return {
                    quota: estimate.quota,
                    usage: estimate.usage,
                    usageInMB: (estimate.usage / 1024 / 1024).toFixed(2),
                    quotaInMB: (estimate.quota / 1024 / 1024).toFixed(2),
                    usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(2)
                };
            } catch (error) {
                console.error('Error getting storage estimate:', error);
                return null;
            }
        }
        console.warn('Storage estimate API not supported in this browser');
        return null;
    }

    // Get detailed database info
    async getDatabaseInfo() {
        try {
            const info = await this.localDB.info();
            return {
                docCount: info.doc_count,
                updateSeq: info.update_seq,
                diskSize: info.disk_size,
                diskSizeInMB: (info.disk_size / 1024 / 1024).toFixed(2),
                compactRunning: info.compact_running,
                instanceStartTime: info.instance_start_time
            };
        } catch (error) {
            console.error('Error getting database info:', error);
            return null;
        }
    }

    // Compact database to reclaim space
    async compactDatabase() {
        try {
            console.log('🗜️ Starting database compaction...');
            const result = await this.localDB.compact();
            console.log('✅ Database compaction completed');
            return result;
        } catch (error) {
            console.error('Error compacting database:', error);
            throw error;
        }
    }

    // Get performance recommendations
    async getPerformanceRecommendations() {
        const storage = await this.getStorageEstimate();
        console.log('Storage estimate:', storage);
        const dbInfo = await this.getDatabaseInfo();
        console.log('Database info:', dbInfo);
        const recommendations = [];

        if (storage) {
            if (parseFloat(storage.usagePercentage) > 80) {
                recommendations.push({
                    type: 'storage',
                    level: 'warning',
                    message: `Storage usage is ${storage.usagePercentage}% - consider cleanup`
                });
            }

            if (parseFloat(storage.usageInMB) > 100) {
                recommendations.push({
                    type: 'storage',
                    level: 'error',
                    message: `Storage usage is ${storage.usageInMB}MB - implement pagination`
                });
            }
        }

        if (dbInfo) {
            if (dbInfo.docCount > 1000) {
                recommendations.push({
                    type: 'documents',
                    level: 'warning',
                    message: `${dbInfo.docCount} documents - consider pagination or filtering`
                });
            }

            if (dbInfo.docCount > 5000) {
                recommendations.push({
                    type: 'documents',
                    level: 'error',
                    message: `${dbInfo.docCount} documents - implement virtual scrolling or server-side pagination`
                });
            }
        }

        return recommendations;
    }
}

export { DatabaseService };

/**
 * Example of how to use the sync events in your UI:
 * 
 * // Add these listeners in your UI components
 * dbService.addEventListener('sync:state-changed', (event) => {
 *     const { newState, oldState } = event.detail;
 *     console.log(`Sync changed from ${oldState} to ${newState}`);
 *     
 *     // Update UI based on sync state
 *     const syncStatusEl = document.getElementById('sync-status');
 *     
 *     switch(newState) {
 *         case 'active':
 *             syncStatusEl.textContent = 'Syncing...';
 *             syncStatusEl.className = 'sync-active';
 *             break;
 *         case 'paused':
 *             syncStatusEl.textContent = 'Sync paused';
 *             syncStatusEl.className = 'sync-paused';
 *             break;
 *         case 'error':
 *             syncStatusEl.textContent = 'Sync error';
 *             syncStatusEl.className = 'sync-error';
 *             break;
 *         case 'inactive':
 *             syncStatusEl.textContent = 'Not syncing';
 *             syncStatusEl.className = 'sync-inactive';
 *             break;
 *     }
 * });
 * 
 * // For more detailed change monitoring (if needed)
 * dbService.addEventListener('sync:change', (event) => {
 *     const { info } = event.detail;
 *     // Update progress indicators, etc.
 *     document.getElementById('docs-synced').textContent = 
 *         `${info.docs_written} documents synchronized`;
 * });
 */