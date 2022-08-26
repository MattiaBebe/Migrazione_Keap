//load enviroment variables
const dotenv = require('dotenv')
const importCompanies = require('./scripts/companies');

dotenv.config();

(async () => {
    const result = await importCompanies(); 

    if (result){
        console.log('finito')
    }
})();


