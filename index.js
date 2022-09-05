//load enviroment variables
const dotenv = require('dotenv')
const importCompanies = require('./scripts/companies');
const importContacts = require('./scripts/contacts');

dotenv.config();

(async () => {
    const companies_result = await importCompanies(); 
    const contacts_result = await importContacts(); 

    const result = companies_result && contacts_result
    if (result){
        console.log('completed succesfully');
    } else {
        console.log('completed with errors');
    }
})();


