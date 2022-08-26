const utils = require('../utils');
const axios = require('axios');

module.exports = async () => {
    const companies = await utils.readCsvFile('db_migration/aziende.csv');
    
    // const config = {
        // method: 'get',
        url = `https://api.infusionsoft.com/crm/rest/v1/account/profile?access_token=QAT2kIAGbapjIzUnfakAHBxzDnYV`;
        headers = { 
            'Cookie': '__cf_bm=zsTKMaN_.RXBUyunsVknDrj1y2ZtvQE74VJG6Nnzea8-1661498500-0-ASt8sv/NlrORHdRnKLLafnTclhfh6oxv+Dah40Z3oPYrwzNzlzkpPeN2DPRYVF+i7QnFDPdwhYAFIJpyiWciqSM=; GCLB=CLmigoTe44DJIg; JSESSIONID=DC7D4C0E8DC908581452AB636FD97393'
        }
        console.log(url);
    // }
    try{
        const res = await axios.get(url, headers);
        console.log(res);
    }
    catch(err){
        console.error(err.message)
    }


    console.log(companies.join(','))
    return true;
}