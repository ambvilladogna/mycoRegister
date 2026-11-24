// export_docs.js
require('dotenv').config();
const nano = require('nano');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const couchDbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const dbName = process.env.COUCHDB_DATABASE;
const exportFileName = 'census_docs.json'; // Name of the file to export to

// Initialize CouchDB connection
const couch = nano(couchDbUrl);
const db = couch.use(dbName);

console.log(`Attempting to connect to CouchDB at ${couchDbUrl.replace(/:\/\/[^@]+@/, '://***:***@')} using database: ${dbName}`);

async function exportDocuments() {
    try {
        // Query all documents of type "census"
        // The 'selector' specifies the criteria for documents to retrieve.
        // 'fields' can be used to limit the fields returned, but we want all for now
        // and will filter _id and _rev later.
        const queryResult = await db.find({
            selector: {
                type: 'census'
            },
            limit: 100000 // Adjust limit as needed, or remove for no limit
        });

        if (queryResult.docs.length === 0) {
            console.log('No documents of type "census" found in the database.');
            return;
        }

        // Process documents: remove _id and _rev
        const docsToExport = queryResult.docs.map(doc => {
            const newDoc = { ...doc }; // Create a shallow copy
            delete newDoc._id; // Remove the original _id
            delete newDoc._rev; // Remove the original _rev
            return newDoc;
        });

        // Write the processed documents to a JSON file
        const filePath = path.join(__dirname, exportFileName);
        fs.writeFileSync(filePath, JSON.stringify(docsToExport, null, 2), 'utf8');

        console.log(`Successfully exported ${docsToExport.length} documents to ${filePath}`);

    } catch (error) {
        console.error('Error exporting documents:', error.message);
        if (error.statusCode) {
            console.error('CouchDB Status Code:', error.statusCode);
            console.error('CouchDB Error Reason:', error.reason);
        }
    }
}

// Execute the export function
exportDocuments();
