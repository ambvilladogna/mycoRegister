// import_docs.js
require('dotenv').config();
const nano = require('nano');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
// IMPORTANT: Ensure your .env COUCHDB_DATABASE points to the NEW database instance
const couchDbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const dbName = process.env.COUCHDB_DATABASE; // This should be your NEW database name
const importFileName = 'census_docs.json'; // Name of the file to import from

// Initialize CouchDB connection
const couch = nano(couchDbUrl);
const db = couch.use(dbName);

console.log(`Attempting to connect to CouchDB at ${couchDbUrl.replace(/:\/\/[^@]+@/, '://***:***@')} using database: ${dbName}`);

async function importDocuments() {
    try {
        // Check if the database exists, create it if not
        await couch.db.get(dbName);
        console.log(`Database '${dbName}' already exists.`);
    } catch (error) {
        if (error.statusCode === 404) {
            console.log(`Database '${dbName}' does not exist. Creating it...`);
            await couch.db.create(dbName);
            console.log(`Database '${dbName}' created successfully.`);
        } else {
            console.error('Error checking/creating database:', error.message);
            if (error.statusCode) {
                console.error('CouchDB Status Code:', error.statusCode);
                console.error('CouchDB Error Reason:', error.reason);
            }
            return; // Exit if there's an unhandled error with the database
        }
    }

    try {
        // Read the documents from the JSON file
        const filePath = path.join(__dirname, importFileName);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const docsToImport = JSON.parse(fileContent);

        if (docsToImport.length === 0) {
            console.log('No documents found in the import file.');
            return;
        }

        // Use db.bulk() for efficient insertion of multiple documents
        // Since _id and _rev were removed during export, CouchDB will generate new ones.
        const response = await db.bulk({ docs: docsToImport });

        // Check for any errors during bulk insertion
        const errors = response.filter(item => item.error);
        if (errors.length > 0) {
            console.error('Errors occurred during import:');
            errors.forEach(err => console.error(`  Doc ID: ${err.id}, Error: ${err.error}, Reason: ${err.reason}`));
        } else {
            console.log(`Successfully imported ${docsToImport.length} documents into '${dbName}'.`);
        }

    } catch (error) {
        console.error('Error importing documents:', error.message);
        if (error.code === 'ENOENT') {
            console.error(`Error: The import file '${importFileName}' was not found. Please ensure you have run the export script first.`);
        } else if (error instanceof SyntaxError) {
            console.error('Error parsing JSON file. Please ensure the export file is valid JSON.');
        } else if (error.statusCode) {
            console.error('CouchDB Status Code:', error.statusCode);
            console.error('CouchDB Error Reason:', error.reason);
        }
    }
}

// Execute the import function
importDocuments();
