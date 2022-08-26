const importCompanies = require('./scripts/companies');

(async () => {
    const result = await importCompanies(); 

    if (result){
        console.log('finito')
    }
})();


