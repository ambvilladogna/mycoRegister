/**
 * Streamlined Index Fungorum Checker for Census Database Updates
 * Focuses only on extracting the data needed for census document updates
 */

import { JSDOM } from 'jsdom';

class NomenclatureFilter {
    constructor() {
        this.invalidStatusTerms = [
            'nom. inval.', 'nom. inv.', 'nomen invalidum', 'invalid',
            'nom. illegit.', 'nom. illeg.', 'nomen illegitimum', 'illegitimate',
            'nom. nud.', 'nomen nudum', 'nom. rej.', 'nomen rejiciendum',
            'nom. ambig.', 'nomen ambiguum', 'nom. dub.', 'nomen dubium',
            'nom. confus.', 'nomen confusum', 'not accepted', 'not current'
        ];
    }

    isValidRecord(record) {
        // Check nomenclatural comment
        const nomenclatureComment = record['NOMENCLATURAL_x0020_COMMENT'];
        if (nomenclatureComment) {
            const lowerComment = nomenclatureComment.toLowerCase();
            for (const term of this.invalidStatusTerms) {
                if (lowerComment.includes(term.toLowerCase())) {
                    return false;
                }
            }
        }

        // Check STS flag for known invalid types
        const stsFlag = record['STS_x0020_FLAG'];
        if (stsFlag) {
            const flag = stsFlag.toLowerCase();
            const invalidFlags = ['i', 'o', 's', 'n', 'h', 'm']; // isonym, orthographic, spelling, nomenclatural, homonym, misapplied
            if (invalidFlags.includes(flag)) {
                return false;
            }
        }

        return true;
    }
}

class StreamlinedIndexFungorumChecker {
    constructor() {
        this.baseUrl = 'http://www.indexfungorum.org/ixfwebservice/fungus.asmx';
        this.delay = 1000; // 1 second delay between requests
        this.filter = new NomenclatureFilter();
    }

    /**
     * Get nomenclature data for census document update
     * @param {string} genus - Genus name
     * @param {string} species - Species name
     * @returns {Promise<Object>} Data for census update
     */
    async getNomenclatureData(genus, species) {
        const speciesName = `${genus} ${species}`;
        
        try {
            console.log(`Querying Index Fungorum for: ${speciesName}`);

            // Search for the species
            const searchResults = await this.searchSpecies(speciesName);
            
            if (!searchResults || searchResults.length === 0) {
                return {
                    success: false,
                    error: 'No results found',
                    data: null
                };
            }

            // Process results to find valid records and current names
            const processedData = this.processResults(searchResults, genus, species);
            
            if (!processedData.success) {
                return processedData;
            }

            // Get current accepted name details
            const currentNameData = await this.getCurrentNameDetails(processedData.currentRecordNumbers);

            return {
                success: true,
                data: {
                    // Original name data
                    authority: processedData.originalAuthority || '',
                    year: processedData.originalYear || '',
                    
                    // Current accepted name data
                    acceptedGenus: currentNameData.acceptedGenus || genus,
                    acceptedSpecies: currentNameData.acceptedSpecies || species,
                    acceptedAuthority: currentNameData.acceptedAuthority || '',
                    acceptedYear: currentNameData.acceptedYear || '',
                    
                    // Species Fungorum record ID
                    speciesFungorumRecordId: currentNameData.recordId || ''
                }
            };

        } catch (error) {
            console.error(`Error processing ${speciesName}:`, error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * Search for species in Index Fungorum
     */
    async searchSpecies(speciesName) {
        const encodedName = encodeURIComponent(speciesName);
        const url = `${this.baseUrl}/NameSearch?SearchText=${encodedName}&AnywhereInText=false&MaxNumber=50`;

        const response = await fetch(url);
        const xmlText = await response.text();
        return this.parseXML(xmlText);
    }

    /**
     * Process search results to extract relevant data
     */
    processResults(results, originalGenus, originalSpecies) {
        const validRecords = [];
        const currentRecordNumbers = new Set();
        let originalAuthority = '';
        let originalYear = '';

        for (const record of results) {
            // Skip invalid records
            if (!this.filter.isValidRecord(record)) {
                continue;
            }

            // Skip misapplications
            if (record['MISAPPLICATION_x0020_AUTHORS']) {
                continue;
            }

            const recordName = record['NAME_x0020_OF_x0020_FUNGUS'];
            
            // Check if this is the original name we're looking for
            if (recordName === `${originalGenus} ${originalSpecies}`) {
                if (!originalAuthority && record['AUTHORS']) {
                    originalAuthority = record['AUTHORS'];
                }
                if (!originalYear && record['YEAR_x0020_OF_x0020_PUBLICATION']) {
                    originalYear = record['YEAR_x0020_OF_x0020_PUBLICATION'];
                }
            }

            validRecords.push(record);

            // Collect current name record numbers
            if (record['CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER']) {
                currentRecordNumbers.add(record['CURRENT_x0020_NAME_x0020_RECORD_x0020_NUMBER']);
            }
        }

        if (validRecords.length === 0) {
            return {
                success: false,
                error: 'No valid records found'
            };
        }

        if (currentRecordNumbers.size === 0) {
            return {
                success: false,
                error: 'No current name records found'
            };
        }

        return {
            success: true,
            originalAuthority,
            originalYear,
            currentRecordNumbers: Array.from(currentRecordNumbers)
        };
    }

    /**
     * Get details for current accepted name
     */
    async getCurrentNameDetails(recordNumbers) {
        // For simplicity, we'll take the first current record number
        // In practice, you might want to handle multiple current names differently
        const recordNumber = recordNumbers[0];
        
        const url = `${this.baseUrl}/NameByKey?NameKey=${recordNumber}`;
        
        await this.sleep(this.delay);
        
        const response = await fetch(url);
        const xmlText = await response.text();
        const results = this.parseXML(xmlText);
        
        if (!results || results.length === 0) {
            return {};
        }

        const record = results[0];
        const fullName = record['NAME_x0020_OF_x0020_FUNGUS'] || '';
        const [acceptedGenus, acceptedSpecies] = fullName.split(' ');

        return {
            recordId: recordNumber,
            acceptedGenus: acceptedGenus || '',
            acceptedSpecies: acceptedSpecies || '',
            acceptedAuthority: record['AUTHORS'] || '',
            acceptedYear: record['YEAR_x0020_OF_x0020_PUBLICATION'] || ''
        };
    }

    /**
     * Simple XML parser
     */
    parseXML(xmlText) {
        const dom = new JSDOM(xmlText, { contentType: 'text/xml' });
        const xmlDoc = dom.window.document;

        const records = [];
        const indexFungorumNodes = xmlDoc.getElementsByTagName('IndexFungorum');

        for (let i = 0; i < indexFungorumNodes.length; i++) {
            const node = indexFungorumNodes[i];
            const record = {};

            for (let j = 0; j < node.children.length; j++) {
                const child = node.children[j];
                record[child.tagName] = child.textContent;
            }

            records.push(record);
        }

        return records;
    }

    /**
     * Sleep function for API rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export { StreamlinedIndexFungorumChecker };