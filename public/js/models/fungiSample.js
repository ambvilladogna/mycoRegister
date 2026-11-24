const fungiSampleModel = {
    type: 'fungiSample',
    allFields: [
        '_id', // let PouchDB handle this
        'createdAt',
        'createdBy',
        'updatedAt',
        'updatedBy',
        'type',
        'taxonGenus',
        'taxonSpecies',
        'authority',
        'collectionDate',
        'collector',
        'locality',
        'localityElevation',
        'localityCoordinates',
        'habitat',
        'notes',
        'determiner',
        'sampleType',
        'exsiccataCode'
    ],
    requiredFields: [
        'taxonGenus',
        'taxonSpecies',
        'collectionDate',
        'collector',
        'locality',
        'habitat'
    ],
    // indexFields: [
    //     'taxonGenus',
    //     'taxonSpecies',
    //     'authority',
    //     'collectionDate',
    //     'collector',
    //     'locality',
    //     'localityElevation',
    //     'localityCoordinates',
    //     'habitat',
    //     'notes',
    //     'determiner',
    //     'sampleType',
    //     'exsiccataCode'
    // ],
    sampleTypes: [
        { value: 'exsiccata', label: 'Exsiccata' },
        { value: 'collected', label: 'Raccolti' },
        { value: 'census', label: 'Censiti' },
    ],
    tableHeaders: [
        { field: 'createdAt', label: 'Creato il', sortable: true },
        { field: 'createdBy', label: 'Creato da', sortable: true },
        { field: 'updatedAt', label: 'Aggiornato il', sortable: true },
        { field: 'updatedBy', label: 'Aggiornato da', sortable: true },
        { field: 'type', label: 'Tipo', sortable: true },
        { field: 'taxonGenus', label: 'Genere', sortable: true },
        { field: 'taxonSpecies', label: 'Specie', sortable: true },
        { field: 'authority', label: 'Autore', sortable: false },
        { field: 'collectionDate', label: 'Rilevazione', sortable: true },
        { field: 'collector', label: 'Raccoglitore', sortable: true },
        { field: 'locality', label: 'Località', sortable: true },
        { field: 'localityElevation', label: 'Altitudine', sortable: true },
        { field: 'localityCoordinates', label: 'Coordinate', sortable: true },
        { field: 'habitat', label: 'Habitat', sortable: true },
        { field: 'notes', label: 'Note', sortable: true },
        { field: 'determiner', label: 'Determinatore', sortable: true },
        { field: 'sampleType', label: 'Tipologia di cammpione', sortable: true },
        { field: 'exsiccataCode', label: "Riferimento all'archivio Exsiccata", sortable: true }
    ],
    censusHeaders: [
        { field: 'fullName', label: 'Nome', sortable: true },
        { field: 'currName', label: 'Nome corrente', sortable: false }
    ]
};

export { fungiSampleModel };