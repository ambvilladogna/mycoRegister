// Service for CRUD operations on fungi samples
// using dbService and this.dbCrud

// uses /js/services/auth/auth.service.js';
// uses /js/services/dbCrud.js';
// uses /js/models/fungiSample.js';

class FungiService {
  constructor(config) {
    this.authService = config.authService;
    this.dbCrud = config.dbCrud;
    this.fungiSampleModel = config.fungiSampleModel;
    this.limit = 500; // Default limit for queries
  }
  // Create a new fungi sample
  async create(fungiSample) {
    try {
      const session = await this.authService.getSessionInfo();
      // Create the document
      const doc = {
        type: 'fungiSample',
        createdAt: new Date().toISOString(),
        createdBy: session.email || null,
        updatedAt: null,
        updatedBy: null,
        taxonGenus: fungiSample.taxonGenus,
        taxonSpecies: fungiSample.taxonSpecies,
        authority: fungiSample.authority,
        collectionDate: fungiSample.collectionDate,
        collector: fungiSample.collector,
        locality: fungiSample.locality,
        localityElevation: fungiSample.localityElevation,
        localityCoordinates: fungiSample.localityCoordinates,
        habitat: fungiSample.habitat,
        notes: fungiSample.notes,
        determiner: fungiSample.determiner,
        sampleType: fungiSample.sampleType,
        exsiccataCode: fungiSample.exsiccataCode
      };

      // Use the post method from this.dbCrud
      const result = await this.dbCrud.post(doc);
      return result;
    } catch (err) {
      console.error('Error creating fungi sample', err);
      throw err;
    }
  }

  // Update an existing fungi sample
  async update(fungiSample) {
    try {
      const session = await this.authService.getSessionInfo();
      const doc = await this.dbCrud.get(fungiSample._id);

      // Update fields
      doc.updatedAt = new Date().toISOString();
      doc.updatedBy = session.email || null;
      doc.taxonGenus = fungiSample.taxonGenus;
      doc.taxonSpecies = fungiSample.taxonSpecies;
      doc.authority = fungiSample.authority;
      doc.collectionDate = fungiSample.collectionDate;
      doc.collector = fungiSample.collector;
      doc.locality = fungiSample.locality;
      doc.localityElevation = fungiSample.localityElevation;
      doc.localityCoordinates = fungiSample.localityCoordinates;
      doc.habitat = fungiSample.habitat;
      doc.notes = fungiSample.notes;
      doc.determiner = fungiSample.determiner;
      doc.sampleType = fungiSample.sampleType;
      doc.exsiccataCode = fungiSample.exsiccataCode;

      // Use the put method from this.dbCrud
      const result = await this.dbCrud.put(doc);
      return result;
    } catch (err) {
      console.error('Error updating fungi sample', err);
      throw err;
    }
  }

  // Delete a fungi sample
  async delete(fungiSampleId) {
    try {
      const result = await this.dbCrud.remove(fungiSampleId);
      return result;
    } catch (err) {
      console.error('Error deleting fungi sample', err);
      throw err;
    }
  }

  // Get all fungi samples
  async getAll() {
    try {
      const result = await this.dbCrud.getAllByType('fungiSample');
      return result.docs;
    } catch (err) {
      console.error('Error getting all fungi samples', err);
      throw err;
    }
  }

  // Get fungi sample by ID
  async getById(fungiSampleId) {
    try {
      const doc = await this.dbCrud.get(fungiSampleId);
      return doc;
    } catch (err) {
      console.error('Error getting fungi sample by ID', err);
      throw err;
    }
  }

  // Search fungi samples by keyword with advanced token parsing
  async search(sampleType, searchTerm, sortBy = 'collectionDate', sortOrder = 'desc') {
    try {
      // Build the search query (only date/type conditions)
      const searchConditions = [];
      const sort = [];

      // Add base type condition
      if (sampleType === 'census') {
        searchConditions.push({ type: sampleType });
        searchConditions.push({ taxonGenus: { "$exists": true } });
        searchConditions.push({ taxonSpecies: { "$exists": true } });
        sort.push({ type: `${sortOrder}` });
        sort.push({ taxonGenus: `${sortOrder}` });
        sort.push({ taxonSpecies: `${sortOrder}` });
      } else {
        searchConditions.push({ type: 'fungiSample' });
        searchConditions.push({ sampleType: sampleType });
        searchConditions.push({ [sortBy]: { "$exists": true } });
        sort.push({ type: `${sortOrder}` });
        sort.push({ sampleType: `${sortOrder}` });
        sort.push({ [sortBy]: `${sortOrder}` });
      }

      let textTokens = [];

      if (searchTerm && searchTerm.trim() !== '') {
        // Split search term into tokens
        const tokens = searchTerm.toLowerCase().trim().split(/\s+/);

        // Italian months mapping
        const monthsMap = {
          'gennaio': 1, 'gen': 1,
          'febbraio': 2, 'feb': 2,
          'marzo': 3, 'mar': 3,
          'aprile': 4, 'apr': 4,
          'maggio': 5, 'mag': 5,
          'giugno': 6, 'giu': 6,
          'luglio': 7, 'lug': 7,
          'agosto': 8, 'ago': 8,
          'settembre': 9, 'set': 9,
          'ottobre': 10, 'ott': 10,
          'novembre': 11, 'nov': 11,
          'dicembre': 12, 'dic': 12
        };

        // Parse tokens into categories
        const parsedTokens = {
          years: [],
          months: [],
          textTokens: []
        };

        tokens.forEach(token => {
          // Check for year (4-digit number between reasonable range)
          if (/^\d{4}$/.test(token)) {
            const year = parseInt(token);
            if (year >= 1900 && year <= 2100) {
              parsedTokens.years.push(year);
              return;
            }
          }

          // Check for month
          if (monthsMap[token]) {
            parsedTokens.months.push(monthsMap[token]);
            return;
          }

          // Everything else is a text token
          parsedTokens.textTokens.push(token);
        });

        // Handle year filtering
        if (parsedTokens.years.length > 0) {
          const yearConditions = parsedTokens.years.map(year => ({
            collectionDate: {
              $gte: `${year}-01-01`,
              $lt: `${year + 1}-01-01`
            }
          }));

          if (yearConditions.length === 1) {
            searchConditions.push(yearConditions[0]);
          } else {
            searchConditions.push({ $or: yearConditions });
          }
        }

        // Handle month filtering
        if (parsedTokens.months.length > 0) {
          const monthConditions = parsedTokens.months.map(month => {
            // Create regex for matching month in ISO date format (YYYY-MM-DD)
            const monthStr = month.toString().padStart(2, '0');
            return {
              collectionDate: { $regex: RegExp(`-${monthStr}-`, 'i') }
            };
          });

          if (monthConditions.length === 1) {
            searchConditions.push(monthConditions[0]);
          } else {
            searchConditions.push({ $or: monthConditions });
          }
        }

        // Store text tokens for in-memory filtering
        textTokens = parsedTokens.textTokens;
      }

      const selector = { $and: searchConditions };

      // Query database with date/type conditions only
      const result = await this.dbCrud.find({
        selector,
        sort: sort,
        limit: 999999 // Get all matching documents for filtering
      });

      if (result.warning) console.warn('Search warnings:', result.warning);

      // Filter results in memory for text tokens
      let filteredDocs = result.docs;

      if (textTokens.length > 0) {
        filteredDocs = result.docs.filter(doc => {
          // Each token must match at least one field
          return textTokens.every(token => {
            const regex = new RegExp(token, 'i');
            return (
              (doc.taxonGenus && regex.test(doc.taxonGenus)) ||
              (doc.taxonSpecies && regex.test(doc.taxonSpecies)) ||
              (doc.authority && regex.test(doc.authority)) ||
              (doc.collector && regex.test(doc.collector)) ||
              (doc.locality && regex.test(doc.locality)) ||
              (doc.localityElevation && regex.test(doc.localityElevation)) ||
              (doc.localityCoordinates && regex.test(doc.localityCoordinates)) ||
              (doc.habitat && regex.test(doc.habitat)) ||
              (doc.notes && regex.test(doc.notes)) ||
              (doc.determiner && regex.test(doc.determiner)) ||
              (doc.exsiccataCode && regex.test(doc.exsiccataCode))
            );
          });
        });
      }

      // Apply pagination
      const hasMore = filteredDocs.length > this.limit;
      const docs = hasMore ? filteredDocs.slice(0, this.limit) : filteredDocs;
      const totalCount = filteredDocs.length;

      return {
        docs: docs,
        count: docs.length,
        hasMore: hasMore,
        totalCount: totalCount
      };

    } catch (err) {
      console.error('Error searching fungi samples', err);
      throw err;
    }
  }

  // Example usage:
  // search(fungiSample, "agaricus 2024 maggio raccolto") 
  // This will search for documents that:
  // - contain "agaricus" in any text field AND
  // - have collectionDate in year 2024 AND  
  // - have collectionDate in May AND
  // - have sampleType containing "collected"  

  // Filter fungi samples by any field in allFields
  async filterBy(key, value) {
    try {
      // Check if key is valid
      if (!this.fungiSampleModel.allFields.includes(key)) {
        throw new Error(`Invalid key: ${key}. Must be one of the fields listed in this.fungiSampleModel.allFields`);
      }

      // Create selector object
      const selector = {
        type: 'fungiSample'
      };
      selector[key] = value;

      const result = await this.dbCrud.find({
        selector: selector
      });
      if (result.warning) console.warn('Search warnings:', result.warning);

      return result.docs;
    } catch (err) {
      console.error(`Error filtering fungi samples by ${key}`, err);
      throw err;
    }
  }

  // Get all unique values for a specific field
  async getAllUniqueValues(key) {
    try {
      // Check if key is valid
      if (!this.fungiSampleModel.allFields.includes(key)) {
        throw new Error(`Invalid key: ${key}. Must be one of the fields listed in this.fungiSampleModel.allFields`);
      }

      const fungiSamples = await this.getAll();
      const values = [...new Set(fungiSamples.map(sample => sample[key]).filter(Boolean))];
      return values;
    } catch (err) {
      console.error(`Error getting all unique values for ${key}`, err);
      throw err;
    }
  }

  /*
  // Get all unique genus-species-authority combinations
  async getGenusSpeciesAuthorities() {
    try {
      // Get all fungi samples that have all three fields populated
      const result = await this.dbCrud.find({
        selector: {
          type: 'fungiSample',
          taxonGenus: { $exists: true, $ne: '' },
          taxonSpecies: { $exists: true, $ne: '' },
          authority: { $exists: true, $ne: '' }
        }
      });

      // Create unique combinations
      const combinations = [];
      const seen = new Set();

      result.docs.forEach(sample => {
        const genus = sample.taxonGenus?.trim();
        const species = sample.taxonSpecies?.trim();
        const authority = sample.authority?.trim();

        if (genus && species && authority) {
          const key = `${genus.toLowerCase()}-${species.toLowerCase()}-${authority}`;
          if (!seen.has(key)) {
            seen.add(key);
            combinations.push({
              taxonGenus: genus,
              taxonSpecies: species,
              authority: authority
            });
          }
        }
      });

      return combinations;
    } catch (error) {
      console.error('Error fetching genus-species-authorities:', error);
      throw error;
    }
  }
  */

  // Get all unique genus
  async getGenus(val) {
    try {
      val = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
      let result = await this.dbCrud.find({
        selector: {
          type: 'census',
          taxonGenus: {
            $exists: true,
            $ne: '',
            $gte: val,
            $lt: val + '\ufff0'
          }
        },
        sort: [{ type: 'asc' }, { taxonGenus: 'asc' }],
        fields: ['taxonGenus']
      });
      if (result.warning) console.warn('Search warnings:', result.warning);
      // if no results found in census, check fungiSamples
      if (result.docs.length === 0) {
        result = await this.dbCrud.find({
          selector: {
            type: 'fungiSample',
            taxonGenus: {
              $exists: true,
              $ne: '',
              $gte: val,
              $lt: val + '\ufff0'
            }
          },
          sort: [{ type: 'asc' }, { taxonGenus: 'asc' }],
          fields: ['taxonGenus']
        });
        if (result.warning) console.warn('Search warnings:', result.warning);
      }
      return [...new Set(result.docs.map(sample => sample.taxonGenus).filter(Boolean))];
    } catch (error) {
      console.error('Error fetching genus:', error);
      throw error;
    }
  }

  // Get all unique species
  async getSpecies(genus, val) {
    try {
      let result = await this.dbCrud.find({
        selector: {
          type: 'census',
          taxonGenus: genus,
          taxonSpecies: {
            $exists: true,
            $ne: '',
            $gte: val,
            $lt: val + '\ufff0'
          }
        },
        sort: [{ type: 'asc' }, { taxonGenus: 'asc' }, { taxonSpecies: 'asc' }],
        fields: ['taxonSpecies']
      });
      if (result.warning) console.warn('Search warnings:', result.warning);
      // if no results found in census, check fungiSamples
      if (result.docs.length === 0) {
        result = await this.dbCrud.find({
          selector: {
            type: 'fungiSample',
            taxonGenus: genus,
            taxonSpecies: {
              $exists: true,
              $ne: '',
              $gte: val,
              $lt: val + '\ufff0'
            }
          },
          sort: [{ type: 'asc' }, { taxonGenus: 'asc' }, { taxonSpecies: 'asc' }],
          fields: ['taxonSpecies']
        });
        if (result.warning) console.warn('Search warnings:', result.warning);
      }

      return [...new Set(result.docs.map(sample => sample.taxonSpecies).filter(Boolean))];
    } catch (error) {
      console.error('Error fetching species:', error);
      throw error;
    }
  }


  checkFirstWordsMatch(str1, str2) {
    return str1.trim().split(' ')[0] === str2.trim();
  }

  // Get the authority and year for a specific genus and species
  async getAuthority(genus, species) {
    try {
      const result = await this.dbCrud.find({
        selector: {
          type: 'census',
          taxonGenus: genus,
          taxonSpecies: species
        }
      });
      if (result.warning) console.warn('Search warnings:', result.warning);
      let doc;
      if (result.docs.length === 0) {
        return {};
      } else {
        doc = result.docs[0];
        if (doc.taxonGenus === doc.acceptedGenus && this.checkFirstWordsMatch(doc.taxonSpecies, doc.acceptedSpecies))
          return {
            taxonGenus: genus,
            taxonSpecies: species,
            authority: `${doc.authority} ${doc.year}`
          };
        else
          return {
            taxonGenus: genus,
            taxonSpecies: species,
            authority: `${doc.authority} ${doc.year}`,
            currentName: `<i>${doc.acceptedGenus} ${doc.acceptedSpecies}</i> ${doc.acceptedAuthority} ${doc.acceptedYear}`
          };
      }
    } catch (error) {
      console.error('Error fetching authorities:', error);
      throw error;
    }
  }

  /**
  * Test function for PouchDB find and sort operations
  * @param {PouchDB} db - PouchDB database instance
  * @param {string} queryType - Type of query to execute ('single', 'multiple', 'filtered', 'custom')
  * @param {Object} customQuery - Optional custom query object (used when queryType is 'custom')
  async testPouchDBFindAndSort() {
    try {
      // Step 1: Create necessary indexes before querying
      console.log('Creating database indexes...');

      // Index for single field sorting (by name)
      await this.dbCrud.createIndex({
        index: {
          fields: [{ 'collectionDate': 'desc' },
          { 'taxonGenus': 'asc' },
          { 'taxonSpecies': 'asc' },
            'type',
            'sampleType'],
          name: 'byDate'
        }
      });

      console.log('Indexes created successfully');

      // Step 2: Build query based on type or use custom query
      const query = {
        selector: {
          collectionDate: { "$gte": null }, // or a specific date range
          taxonGenus: { "$gte": null },
          taxonSpecies: { "$gte": null },
          type: 'fungiSample',
          sampleType: 'collected'
        },
        sort: [{ collectionDate: 'desc' }, { taxonGenus: 'asc' }, { taxonSpecies: 'asc' }],
        limit: 10,
        skip: 0,
        // use_index: 'byDate',
        execution_stats: true
      }
      console.log('Executing query:', JSON.stringify(query, null, 2));

      // Step 3: Execute the find operation
      const result = await this.dbCrud.find(query);

      console.log(`Found ${result.docs.length} documents:`);
      for (const doc of result.docs) {
        console.log(`- ${doc.taxonGenus} ${doc.taxonSpecies} (${doc.collectionDate})`);
      }

    } catch (error) {
      console.error('Error in testPouchDBFindAndSort:', error);
      throw error;
    }
  }
  */

};

export { FungiService };