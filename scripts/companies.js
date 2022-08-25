const utils = require('../utils');

module.exports = async () => {
    const companies = await utils.readCsvFile('db_migration/aziende.csv');

    companies.map(c => {
        console.log(c);
    });
    
}