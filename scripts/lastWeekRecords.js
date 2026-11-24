
/**
 * @file This script connects to a CouchDB database and fetches documents
 * that have a 'collectionDate' field within the last 7 days.
 * @requires nano - CouchDB driver for Node.js
 */

const args = process.argv.slice(2);
var debug = false;

if (args[0] && args[0] === 'debug') {
    debug = true;
    console.log(`Running in debug mode...`);
}

require('dotenv').config();
const nano = require('nano');

// --- Configuration ---
const COUCHDB_DATABASE = process.env.COUCHDB_DATABASE;
const COUCHDB_USERNAME = process.env.COUCHDB_ADMIN;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD;

if (!COUCHDB_DATABASE || !COUCHDB_USERNAME || !COUCHDB_PASSWORD) {
    console.error('Please set the COUCHDB_DATABASE, COUCHDB_USERNAME, and COUCHDB_PASSWORD environment variables.');
    process.exit(1);
}

const COUCHDB_URL = `http://${COUCHDB_USERNAME}:${COUCHDB_PASSWORD}@localhost:5984`;
const DB_NAME = COUCHDB_DATABASE;

function sortArrayByCollectionDate(arr) {
    // Create a shallow copy of the array to avoid modifying the original array
    const sortedArr = [...arr];

    sortedArr.sort((a, b) => {
        const dateA = new Date(a.collectionDate);
        const dateB = new Date(b.collectionDate);

        // Compare the dates
        if (dateA < dateB) {
            return -1; // a comes before b
        }
        if (dateA > dateB) {
            return 1; // b comes before a
        }
        return 0; // dates are equal
    });

    return sortedArr;
}

// --- Main Function to Fetch Records ---
async function fetchRecordsCollectedLastWeek() {
    try {
        // Initialize CouchDB connection
        const db = nano(COUCHDB_URL).use(DB_NAME);
        if (debug) {
            console.log(`Successfully connected to CouchDB: ${DB_NAME}`);
        }

        // Calculate the date 7 days ago from today
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        // Format the date to 'YYYY-MM-DD' for comparison, as per your example record
        const minDateString = sevenDaysAgo.toISOString().split('T')[0];

        // Get today's date in 'YYYY-MM-DD' format to define the upper bound (inclusive)
        const today = new Date();
        const maxDateString = today.toISOString().split('T')[0];

        if (debug) {
            console.log(`Fetching records with 'collectionDate' between ${minDateString} and ${maxDateString} (inclusive)...`);
        }

        // CouchDB query to find documents where 'collectionDate' is within the last 7 days
        // This uses a "selector" query, which is part of the Mango Query API.
        // It requires a primary index on 'collectionDate' for optimal performance,
        // or a global secondary index if you are querying on this field frequently.
        const query = {
            selector: {

                type: 'fungiSample',
                collectionDate: {
                    '$gte': minDateString
                },
                sampleType: 'collected'
            },
            limit: 100, // Adjust as needed
            fields: ['taxonGenus', 'taxonSpecies', 'authority', 'collectionDate', 'locality', 'localityPlace', 'localityElevation', 'localityCoordinates', 'habitat', 'substrate', 'notes']
        };

        // Execute the query
        const response = await db.find(query);

        if (response.docs.length > 0) {
            if (debug) {
                console.log(`Found ${response.docs.length} records collected in the last week:`);
            }
            let records = sortArrayByCollectionDate(response.docs);
            console.log(records);
        } else {
            if (debug) {
                console.log('No records found that were collected in the last week matching the criteria.');
            }
        }

    } catch (error) {
        if (debug) {
            console.error('Error fetching records:', error.message);
            if (error.statusCode) {
                console.error('CouchDB Status Code:', error.statusCode);
                console.error('CouchDB Error Reason:', error.reason);
            }
        }
    }
}

// Run the function
fetchRecordsCollectedLastWeek();