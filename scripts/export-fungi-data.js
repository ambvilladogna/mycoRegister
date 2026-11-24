const args = process.argv.slice(2);
var OUTPUT_FILE = 'fungi_data_feed.sql';

require('dotenv').config();
const nano = require('nano');
const fs = require('fs');
const path = require('path');
const { exit } = require('process');

if (args[0]) {
    OUTPUT_FILE = args[0];
    console.log(`Writing data to ${OUTPUT_FILE}...`);
} else {
    console.log(`Usage: node export-fungi-data.js <output_file>`);
    exit(1);
}

// Configuration from environment variables
const COUCHDB_URL = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const DATABASE_NAME = process.env.COUCHDB_DATABASE;
// const OUTPUT_FILE = process.env.OUTPUT_FILE || 'fungi_data_feed.sql';

// Initialize CouchDB connection
const couchdb = nano(COUCHDB_URL);
const db = couchdb.db.use(DATABASE_NAME);




// SQL template
/*
const SQL_TEMPLATE = `-- Fungi Samples Data Feed
-- Generated on: {timestamp}
-- Source: CouchDB database '{database}'

DROP TABLE IF EXISTS public.fungi_samples;

CREATE TABLE public.fungi_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couch_id VARCHAR(255) UNIQUE,
    couch_rev VARCHAR(255),
    created_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    taxon_genus VARCHAR(255),
    taxon_species VARCHAR(255),
    authority VARCHAR(255),
    collection_date DATE,
    collector VARCHAR(255),
    locality VARCHAR(255),
    locality_place VARCHAR(255),
    locality_elevation VARCHAR(255),
    locality_coordinates VARCHAR(255),
    habitat TEXT,
    substrate VARCHAR(255),
    associated_taxa TEXT,
    notes TEXT,
    determiner VARCHAR(255),
    determination_date DATE,
    sample_type VARCHAR(100),
    exsiccata_code VARCHAR(255),
    picture VARCHAR(255)
);

-- Create indexes for better performance
CREATE INDEX idx_fungi_samples_couch_id ON public.fungi_samples(couch_id);
CREATE INDEX idx_fungi_samples_collection_date ON public.fungi_samples(collection_date);
CREATE INDEX idx_fungi_samples_taxon ON public.fungi_samples(taxon_genus, taxon_species);
CREATE INDEX idx_fungi_samples_locality ON public.fungi_samples(locality);

-- Import data
COPY public.fungi_samples (
    couch_id, couch_rev, created_at, created_by, updated_at, updated_by,
    taxon_genus, taxon_species, authority, collection_date, collector,
    locality, locality_place, locality_elevation, locality_coordinates,
    habitat, substrate, associated_taxa, notes, determiner,
    determination_date, sample_type, exsiccata_code, picture
) FROM stdin;
{data}
\\.

-- Summary
SELECT 
    COUNT(*) as total_samples,
    COUNT(DISTINCT taxon_genus) as genera_count,
    COUNT(DISTINCT collector) as collectors_count,
    MIN(collection_date) as earliest_sample,
    MAX(collection_date) as latest_sample
FROM public.fungi_samples;
`;
*/
const SQL_TEMPLATE = `-- Fungi Samples Data Feed
-- Generated on: {timestamp}
-- Source: CouchDB database '{database}'

DROP TABLE IF EXISTS public.fungi_samples;

CREATE TABLE public.fungi_samples (
    genere VARCHAR(255),
    specie VARCHAR(255),
    nome_completo VARCHAR(255),
    autore VARCHAR(255),
    data_raccolta DATE,
    raccoglitore VARCHAR(255),
    luogo VARCHAR(255),
    luogo_dettagli VARCHAR(255),
    luogo_altitudine VARCHAR(255),
    luogo_coordinate VARCHAR(255),
    habitat TEXT,
    substrato VARCHAR(255),
    taxa_associati TEXT,
    note TEXT,
    determinatore VARCHAR(255),
    data_determinazione DATE,
    tipo_campione VARCHAR(100),
    exsiccata_code VARCHAR(255)
);

-- Create indexes for better performance
CREATE INDEX idx_fungi_samples_collection_date ON public.fungi_samples(data_raccolta);
CREATE INDEX idx_fungi_samples_taxon ON public.fungi_samples(genere, specie);
CREATE INDEX idx_fungi_samples_locality ON public.fungi_samples(luogo);

-- Import data
COPY public.fungi_samples (
    genere, specie, nome_completo, autore, data_raccolta, raccoglitore,
    luogo, luogo_dettagli, luogo_altitudine, luogo_coordinate,
    habitat, substrato, taxa_associati, note, determinatore,
    data_determinazione, tipo_campione, exsiccata_code
) FROM stdin;
{data}
\\.

-- Summary
SELECT 
    COUNT(*) as totale_campioni,
    COUNT(DISTINCT genere) as totale_generi,
    COUNT(DISTINCT raccoglitore) as totale_raccoglitori,
    MIN(data_raccolta) as primo_campione,
    MAX(data_raccolta) as ultimo_campione
FROM public.fungi_samples;
`;

// Escape and format value for PostgreSQL COPY
function formatValue(value) {
    if (value === null || value === undefined || value === '') {
        return '\\N'; // PostgreSQL NULL
    }

    // Convert value to string and escape special characters
    let str = String(value);

    // Escape backslashes, tabs, newlines, carriage returns
    str = str.replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');

    return str;
}

// Format date for PostgreSQL
function formatDate(dateStr) {
    if (!dateStr) return '\\N';

    // Handle ISO dates or simple date strings
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '\\N';

    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Format timestamp for PostgreSQL
function formatTimestamp(dateStr) {
    if (!dateStr) return '\\N';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '\\N';

    return date.toISOString(); // Full ISO timestamp
}

// Convert CouchDB document to PostgreSQL COPY format
function documentToCopyRow(doc) {
    const fields = [
        formatValue(doc.taxonGenus),
        formatValue(doc.taxonSpecies),
        `${formatValue(doc.taxonGenus)} ${formatValue(doc.taxonSpecies)}`.trim(),
        formatValue(doc.authority),
        formatDate(doc.collectionDate),
        formatValue(doc.collector),
        formatValue(doc.locality),
        formatValue(doc.localityPlace),
        formatValue(doc.localityElevation),
        formatValue(doc.localityCoordinates),
        formatValue(doc.habitat),
        formatValue(doc.substrate),
        formatValue(doc.associatedTaxa),
        formatValue(doc.notes),
        formatValue(doc.determiner),
        formatDate(doc.determinationDate),
        formatValue(doc.sampleType),
        formatValue(doc.exsiccataCode)
    ];

    return fields.join('\t');
}

async function exportData() {
    try {
        console.log(`Connecting to CouchDB database: ${DATABASE_NAME}`);

        // Test connection
        const info = await db.info();
        console.log(`Database info: ${info.doc_count} documents, ${info.doc_del_count} deleted`);

        // Fetch all fungi sample documents
        console.log('Fetching fungi samples...');
        const result = await db.find({
            selector: {
                type: 'fungiSample'
            },
            limit: 10000 // Adjust if you have more samples
        });

        console.log(`Found ${result.docs.length} fungi samples`);

        if (result.docs.length === 0) {
            console.log('No fungi samples found. Check your database and document type.');
            return;
        }

        // Convert documents to COPY format
        console.log('Converting documents to PostgreSQL format...');
        const copyRows = result.docs.map(doc => documentToCopyRow(doc));

        // Generate SQL script
        const sqlScript = SQL_TEMPLATE
            .replace('{timestamp}', new Date().toISOString())
            .replace('{database}', DATABASE_NAME)
            .replace('{data}', copyRows.join('\n'));

        // Write to file
        const outputPath = path.resolve(OUTPUT_FILE);
        fs.writeFileSync(outputPath, sqlScript, 'utf8');

        console.log(`\n✅ Export completed successfully!`);
        console.log(`📁 Output file: ${outputPath}`);
        console.log(`📊 Exported ${result.docs.length} fungi samples`);
        console.log(`\nTo import into PostgreSQL:`);
        console.log(`psql -U <user> -d <database> -f ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('❌ Export failed:', error.message);

        if (error.error === 'unauthorized') {
            console.error('Check your CouchDB credentials in .env file');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('CouchDB appears to be offline or unreachable');
        }

        process.exit(1);
    }
}

exportData();

// Run the export
// if (require.main === module) {
//     exportData();
// }
// 
// module.exports = { exportData };