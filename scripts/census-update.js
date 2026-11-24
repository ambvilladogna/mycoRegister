#!/usr/bin/env node

require('dotenv').config();
const nano = require('nano');
const { StreamlinedIndexFungorumChecker } = require('./streamlined-index-fungorum-checker.js');
const { DatabaseExceptionHandler } = require('./database-exception-handler.js');

// --- Configuration ---
const couchDbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@localhost:5984`;
const dbName = process.env.COUCHDB_DATABASE;

// Initialize CouchDB connection
const couch = nano(couchDbUrl);
const db = couch.use(dbName);

class FungiNomenclatureCache {
    constructor(options = {}) {
        this.batchSize = options.batchSize || 10;
        this.dryRun = options.dryRun || false;
        this.verbose = options.verbose || false;
        this.ifChecker = new StreamlinedIndexFungorumChecker();
        
        // Initialize exception handler
        this.exceptionHandler = new DatabaseExceptionHandler({
            scriptName: 'fungi-nomenclature-cache',
            logDirectory: options.logDirectory || './logs'
        });
    }

    /**
     * Process a single document with Index Fungorum data
     */
    async processDocument(doc) {
        const genus = doc.taxonGenus;
        const species = doc.taxonSpecies;

        console.log(`Processing: ${genus} ${species}`);

        try {
            // Get nomenclature data from Index Fungorum
            const result = await this.ifChecker.getNomenclatureData(genus, species);

            if (!result.success) {
                // Log the API failure
                this.exceptionHandler.logException({
                    type: 'API_ERROR',
                    message: `Index Fungorum lookup failed: ${result.error}`,
                    context: {
                        documentId: doc._id,
                        genus,
                        species,
                        operation: 'nomenclature_lookup'
                    },
                    severity: 'MEDIUM'
                });

                console.log(`  ❌ Failed: ${result.error}`);
                
                // Mark document with anomaly using the exception handler
                const markedDoc = this.exceptionHandler.markDocumentAnomaly(
                    doc,
                    'API_LOOKUP_FAILED',
                    `Index Fungorum API error: ${result.error}`,
                    { genus, species, apiError: result.error }
                );

                return {
                    success: false,
                    doc: markedDoc,
                    error: result.error
                };
            }

            // Update the document with the nomenclature data
            const updatedDoc = {
                ...doc,
                authority: result.data.authority,
                year: result.data.year,
                acceptedGenus: result.data.acceptedGenus,
                acceptedSpecies: result.data.acceptedSpecies,
                acceptedAuthority: result.data.acceptedAuthority,
                acceptedYear: result.data.acceptedYear,
                speciesFungorumRecordId: result.data.speciesFungorumRecordId,
                updatedAt: new Date().toISOString()
            };

            console.log(`  ✅ Success: ${result.data.acceptedGenus} ${result.data.acceptedSpecies} ${result.data.acceptedAuthority} ${result.data.acceptedYear}`);

            if (result.data.speciesFungorumRecordId) {
                console.log(`  📋 Record ID: ${result.data.speciesFungorumRecordId}`);
            }

            return {
                success: true,
                doc: updatedDoc,
                originalDoc: doc
            };

        } catch (error) {
            console.error(`  ❌ Error processing ${genus} ${species}:`, error);
            
            // Use exception handler to create standardized error result
            return this.exceptionHandler.createErrorResult(doc, error, 'document_processing');
        }
    }

    /**
     * Process a batch of documents
     */
    async processBatch(docs, startIndex = 0) {
        const batch = docs.slice(startIndex, startIndex + this.batchSize);
        console.log(`\nProcessing batch of ${batch.length} documents (starting from index ${startIndex})`);

        const results = [];
        const documentsToUpdate = [];

        for (const doc of batch) {
            try {
                const result = await this.processDocument(doc);
                results.push(result);
                documentsToUpdate.push(result.doc);

                if (result.success && this.verbose) {
                    console.log('Updated document preview:');
                    console.log(`  Original: ${result.originalDoc.taxonGenus} ${result.originalDoc.taxonSpecies} [${result.originalDoc.authority}] ${result.originalDoc.year}`);
                    console.log(`  Current:  ${result.doc.acceptedGenus} ${result.doc.acceptedSpecies} [${result.doc.acceptedAuthority}] ${result.doc.acceptedYear}`);
                    console.log(`  Record ID: ${result.doc.speciesFungorumRecordId}`);
                }
                
                const delayMs = this.getRandomNumber(3000, 10000);
                console.log(`  Pausing for ${delayMs / 1000} seconds before next document...`);
                await this.#sleep(delayMs);
                
            } catch (error) {
                // Log batch processing errors
                this.exceptionHandler.logException({
                    type: 'BATCH_PROCESSING_ERROR',
                    message: `Failed to process document in batch: ${error.message}`,
                    context: {
                        documentId: doc._id,
                        batchIndex: startIndex,
                        operation: 'batch_processing'
                    },
                    error,
                    severity: 'HIGH'
                });

                // Still add the document to update list with anomaly
                const errorResult = this.exceptionHandler.createErrorResult(doc, error, 'batch_processing');
                results.push(errorResult);
                documentsToUpdate.push(errorResult.doc);
            }
        }

        // Save to database if not in dry run mode
        if (!this.dryRun && documentsToUpdate.length > 0) {
            console.log(`\nSaving ${documentsToUpdate.length} updated documents to database...`);
            try {
                const bulkResponse = await db.bulk({ docs: documentsToUpdate });

                // Check for errors in bulk response
                const errors = bulkResponse.filter(resp => resp.error);
                if (errors.length > 0) {
                    console.error(`Bulk update errors: ${errors.length}`);
                    errors.forEach(err => {
                        console.error(`  - ${err.id}: ${err.error} - ${err.reason}`);
                        
                        // Log database errors
                        this.exceptionHandler.logException({
                            type: 'DATABASE_ERROR',
                            message: `Bulk update failed: ${err.error} - ${err.reason}`,
                            context: {
                                documentId: err.id,
                                operation: 'bulk_update'
                            },
                            severity: 'HIGH'
                        });
                    });
                }

                console.log(`✅ Successfully saved ${bulkResponse.length - errors.length} documents`);
            } catch (error) {
                console.error('Error saving documents to database:', error);
                
                this.exceptionHandler.logException({
                    type: 'DATABASE_ERROR',
                    message: `Failed to save batch to database: ${error.message}`,
                    context: {
                        batchSize: documentsToUpdate.length,
                        operation: 'bulk_save'
                    },
                    error,
                    severity: 'CRITICAL'
                });
            }
        }

        return {
            processed: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results
        };
    }

    /**
     * Main execution function
     */
    async run() {
        try {
            console.log('=== Fungi Nomenclature Cache Builder ===');
            console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'ACTUAL RUN'}`);
            console.log(`Batch size: ${this.batchSize}`);
            console.log(`Session ID: ${this.exceptionHandler.sessionId}`);
            console.log('---');

            // Step 1: Get all census documents
            const allDocs = await this.getCensusDocuments();

            // Step 2: Filter documents needing updates
            const docsNeedingUpdate = this.filterDocumentsNeedingUpdate(allDocs);

            if (docsNeedingUpdate.length === 0) {
                console.log('No documents need nomenclature updates!');
                return;
            }

            // Step 3: Process documents in batches
            let processedCount = 0;
            let successCount = 0;
            let failureCount = 0;

            // Process only the first batch
            const batchResult = await this.processBatch(docsNeedingUpdate, 0);

            processedCount += batchResult.processed;
            successCount += batchResult.successful;
            failureCount += batchResult.failed;

            console.log('\n=== SUMMARY ===');
            console.log(`Total processed: ${processedCount}`);
            console.log(`Successful: ${successCount}`);
            console.log(`Failed: ${failureCount}`);

            if (this.dryRun) {
                console.log('\nDRY RUN completed. No changes made to database.');
            } else {
                console.log('\nActual processing completed. Database updated.');
            }

            // Generate final exception report
            const summary = await this.exceptionHandler.finalize();
            
            return summary;

        } catch (error) {
            console.error('Error in main execution:', error);
            
            this.exceptionHandler.logException({
                type: 'SCRIPT_FAILURE',
                message: `Script execution failed: ${error.message}`,
                context: {
                    operation: 'main_execution'
                },
                error,
                severity: 'CRITICAL'
            });

            // Still try to write logs before exiting
            await this.exceptionHandler.finalize();
            process.exit(1);
        }
    }

    // ... rest of your existing methods remain the same ...
    getRandomNumber(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async #sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getCensusDocuments() {
        try {
            console.log('Fetching census documents from CouchDB...');

            const result = await db.find({
                selector: {
                    type: 'census',
                    anomaly: { '$exists': false }
                },
                limit: 10000
            });

            console.log(`Found ${result.docs.length} census documents`);
            return result.docs;
        } catch (error) {
            console.error('Error fetching census documents:', error);
            throw error;
        }
    }

    filterDocumentsNeedingUpdate(docs) {
        const needsUpdate = docs.filter(doc => {
            const hasEmptyAuthority = !doc.authority || doc.authority.trim() === '';
            const hasEmptyYear = !doc.year || doc.year.trim() === '';

            return hasEmptyAuthority && hasEmptyYear;
        });

        console.log(`Found ${needsUpdate.length} documents needing nomenclature updates`);

        if (this.verbose) {
            console.log('Sample documents needing updates:');
            needsUpdate.slice(0, 3).forEach(doc => {
                console.log(`  - ${doc.taxonGenus} ${doc.taxonSpecies} (ID: ${doc._id})`);
            });
        }

        return needsUpdate;
    }
}

// Command line argument parsing - updated to include log directory
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        batchSize: 10,
        dryRun: false,
        verbose: false,
        logDirectory: './logs'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--batch-size':
            case '-b':
                if (i + 1 < args.length) {
                    options.batchSize = parseInt(args[i + 1], 10);
                    i++;
                }
                break;

            case '--dry-run':
            case '-d':
                options.dryRun = true;
                break;

            case '--verbose':
            case '-v':
                options.verbose = true;
                break;

            case '--log-dir':
            case '-l':
                if (i + 1 < args.length) {
                    options.logDirectory = args[i + 1];
                    i++;
                }
                break;

            case '--help':
            case '-h':
                console.log('Usage: node census-update.js [options]');
                console.log('Options:');
                console.log('  --batch-size, -b <number>  Number of documents to process in each batch (default: 10)');
                console.log('  --dry-run, -d              Run in dry-run mode without updating database');
                console.log('  --verbose, -v              Enable verbose output');
                console.log('  --log-dir, -l <path>       Directory for log files (default: ./logs)');
                console.log('  --help, -h                 Show this help message');
                process.exit(0);
                break;

            default:
                console.warn(`Unknown argument: ${arg}`);
                break;
        }
    }

    return options;
}

// Main execution
if (require.main === module) {
    const options = parseArgs();
    const cache = new FungiNomenclatureCache(options);
    cache.run();
}

module.exports = { FungiNomenclatureCache };