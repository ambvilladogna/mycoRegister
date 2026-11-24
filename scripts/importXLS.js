const XLSX = require('xlsx');
const nano = require('nano');
require('dotenv').config();

const args = process.argv.slice(2);

if (args[0]) {
    console.log(`importing: ${args[0]}`);
} else {
    console.log('Usage: nodejs importXLS.js <filename.xls>');
    exit(1);
}

const XLS_FILE_PATH = args[0]; // Update with your XLS file path

// Configuration
const COUCHDB_DATABASE = process.env.COUCHDB_DATABASE;
const COUCHDB_USERNAME = process.env.COUCHDB_ADMIN;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD;

if (!COUCHDB_DATABASE || !COUCHDB_USERNAME || !COUCHDB_PASSWORD) {
    console.error('Please set the COUCHDB_DATABASE, COUCHDB_USERNAME, and COUCHDB_PASSWORD environment variables.');
    process.exit(1);
}

const COUCHDB_URL = `http://${COUCHDB_USERNAME}:${COUCHDB_PASSWORD}@localhost:5984`;
const DATABASE_NAME = COUCHDB_DATABASE;

// Initialize CouchDB connection
const couch = nano(COUCHDB_URL);
const db = couch.db.use(DATABASE_NAME);

async function createDatabaseIfNotExists() {
    try {
        await couch.db.create(DATABASE_NAME);
        console.log(`Database "${DATABASE_NAME}" created successfully`);
    } catch (error) {
        if (error.statusCode === 412) {
            console.log(`Database "${DATABASE_NAME}" already exists`);
        } else {
            throw error;
        }
    }
    try {
        await db.createIndex({
            index: {
                fields: ['taxonGenus', 'taxonSpecies']
            },
            name: 'fungi-genus-species-index'
        });
    } catch (error) {
        throw error;
    }
}

function readXLSFile(filePath) {
    try {
        // Read the XLS file
        const workbook = XLSX.readFile(filePath);

        // Get the first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        return jsonData;
    } catch (error) {
        console.error('Error reading XLS file:', error);
        throw error;
    }
}

function transformToFungiRecords(xlsData) {
    const records = [];

    // Skip header row (if exists) and process data
    const startRow = xlsData[0] && typeof xlsData[0][0] === 'string' ? 1 : 0;

    for (let i = startRow; i < xlsData.length; i++) {
        const row = xlsData[i];

        // Skip empty rows
        if (!row || (!row[0] && !row[1])) continue;

        const genus = row[0] ? row[0].toString().trim() : '';
        const species = row[1] ? row[1].toString().trim() : '';

        // Skip rows with empty genus or species
        if (!genus || !species) {
            console.warn(`Skipping row ${i + 1}: missing genus or species`);
            continue;
        }

        const record = {
            type: "census",
            updatedAt: new Date().toISOString(),
            taxonGenus: genus,
            taxonSpecies: species,
            authority: "",
            year: "",
            acceptedGenus: "",
            acceptedSpecies: "",
            acceptedAuthority: "",
            acceptedYear: ""
        };

        records.push(record);
    }

    return records;
}

async function insertRecordsInBatches(records, batchSize = 100) {
    const totalRecords = records.length;
    let insertedCount = 0;
    let errorCount = 0;

    console.log(`Starting to insert ${totalRecords} records in batches of ${batchSize}...`);

    for (let i = 0; i < totalRecords; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        try {
            const result = await db.bulk({ docs: batch });

            // Check for errors in the batch
            const errors = result.filter(doc => doc.error);
            if (errors.length > 0) {
                console.error(`Batch ${Math.floor(i / batchSize) + 1} had ${errors.length} errors:`, errors);
                errorCount += errors.length;
            }

            insertedCount += (batch.length - errors.length);
            console.log(`Batch ${Math.floor(i / batchSize) + 1} processed: ${insertedCount}/${totalRecords} records inserted`);

        } catch (error) {
            console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
            errorCount += batch.length;
        }
    }

    return { insertedCount, errorCount };
}

async function main() {
    try {
        console.log('Starting fungi data import...');

        // Create database if it doesn't exist
        await createDatabaseIfNotExists();

        // Read XLS file
        console.log('Reading XLS file...');
        const xlsData = readXLSFile(XLS_FILE_PATH);
        console.log(`Found ${xlsData.length} rows in XLS file`);

        // Transform data
        console.log('Transforming data...');
        const fungiRecords = transformToFungiRecords(xlsData);
        console.log(`Created ${fungiRecords.length} fungi records`);

        if (fungiRecords.length === 0) {
            console.log('No valid records to insert');
            return;
        }

        // Insert records
        const { insertedCount, errorCount } = await insertRecordsInBatches(fungiRecords);

        console.log('\n=== Import Summary ===');
        console.log(`Total records processed: ${fungiRecords.length}`);
        console.log(`Successfully inserted: ${insertedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log('Import completed!');

    } catch (error) {
        console.error('Import failed:', error);
        process.exit(1);
    }
}

// Export functions for use in other modules
module.exports = {
    readXLSFile,
    transformToFungiRecords,
    insertRecordsInBatches,
    main
};

// Run the import if this script is executed directly
if (require.main === module) {
    main();
}