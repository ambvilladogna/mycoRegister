require('dotenv').config();
const nano = require('nano');

// --- Configuration ---
const couchDbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const dbName = process.env.COUCHDB_DATABASE;
const originalType = 'fungiCensus'; // The type you want to change
const newType = 'census'; // The new type

// --- Main Script ---
async function updateDocuments() {
    try {
        const couch = nano(couchDbUrl);
        const db = couch.use(dbName);

        console.log(`Connecting to CouchDB at ${couchDbUrl}, database: ${dbName}`);

        // 1. Find all documents with type: originalType
        console.log(`Searching for documents with type: ${originalType}...`);
        const queryResult = await db.find({
            selector: {
                type: originalType
            },
            limit: 100000 
        });

        const docsToUpdate = queryResult.docs;
        console.log(`Found ${docsToUpdate.length} documents with type: ${originalType}.`);

        if (docsToUpdate.length === 0) {
            console.log('No documents to update. Exiting.');
            return;
        }

        // 2. Prepare documents for bulk update
        const bulkUpdateDocs = docsToUpdate.map(doc => {
            doc.type = newType;
            return doc;
        });

        // 3. Perform bulk update
        console.log(`Updating ${bulkUpdateDocs.length} documents to type: ${newType}...`);
        const response = await db.bulk({ docs: bulkUpdateDocs });

        // 4. Check results
        const errors = response.filter(item => item.error);
        if (errors.length > 0) {
            console.error('Some documents failed to update:');
            errors.forEach(error => console.error(`  Doc ID: ${error.id}, Error: ${error.error}, Reason: ${error.reason}`));
        } else {
            console.log('All specified documents updated successfully!');
        }

    } catch (error) {
        console.error('An error occurred:', error.message);
        if (error.statusCode) {
            console.error('Status Code:', error.statusCode);
            console.error('Reason:', error.reason);
        }
    }
}

// Execute the function
updateDocuments();