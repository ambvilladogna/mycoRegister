// export_docs.js
require('dotenv').config();
const nano = require('nano');

// --- Configuration ---
const couchDbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const dbName = process.env.COUCHDB_DATABASE;

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

async function getIndexes() {
    try {
        const result = await couch.relax({
            db: dbName,
            path: '_index',
            method: 'GET'
        });
        return result.indexes;
    } catch (err) {
        console.error('Error getting indexes:', err);
    }
}

// Initialize CouchDB connection
const couch = nano(couchDbUrl);
const db = couch.use(dbName);

console.log(`Attempting to connect to CouchDB at ${couchDbUrl.replace(/:\/\/[^@]+@/, '://***:***@')} using database: ${dbName}`);

async function ensureIndexes(indexType = 'default') {
    try {
        // Get all existing indexes
        const existingIndexes = await getIndexes();

        console.log('Existing indexes:', existingIndexes.length);

        let dbIndexes = [];
        if (indexType === 'text') {
            dbIndexes = dbTextIndexes;
        } else {
            dbIndexes = dbDefaultIndexes;
        }

        for (const indexFields of dbIndexes) {
            try {
                // Check if this exact index already exists
                const indexExists = existingIndexes.some(existingIndex => {
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
                    result = await db.createIndex({
                        index: {
                            fields: indexFields,
                        },
                        name: generateIndexName(indexFields),
                        type: 'text'
                    });
                    console.log(`✓ Created text index [${indexFields.join(', ')}]:`, result.id);
                } else {
                    result = await db.createIndex({
                        index: {
                            fields: indexFields,
                        },
                        name: generateIndexName(indexFields),
                        type: "json"
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

// Execute the function
ensureIndexes();
ensureIndexes('text');