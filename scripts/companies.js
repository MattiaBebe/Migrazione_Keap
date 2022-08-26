const utils = require('../utils');
const axios = require('axios');

const VALID_COMPANIES_ROLES = [
    'CRM000'
]

let isoCountries;

const buildKeapCompany = (c4cCompany) => {
    const isoCountry = isoCountries.find(i => i['alpha-2'] === c4cCompany.CountryRegion);
    return {
        address: {
            country_code: isoCountry ? isoCountry['alpha-3'] : null,
            line1: c4cCompany.Street + `${c4cCompany.House_Number ? ', ' + c4cCompany.House_Number : ''}`,
            line2: c4cCompany.City,
            locality: c4cCompany.CountryRegion_Text,
            zip_code: c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 5 ? c4cCompany.Postal_Code : null,
            zip_four: c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 4 ? c4cCompany.Postal_Code : null,
        },
        company_name: c4cCompany.Name,
        // custom_fields: [
        //     {
        //         content: { },
        //         id: 0
        //     }
        // ],
        email_address: c4cCompany.EMail,
        fax_number: {
            number: c4cCompany.Fax,
            type: "Work"
        },
        // notes: "string",
        // opt_in_reason: "string",
        phone_number: {
            number: c4cCompany.Phone,
            type: "Work"
        },
        website: c4cCompany.Web_Site?.substring(0, 3) === 'www' ? `https://${c4cCompany.Web_Site}` : c4cCompany.Web_Site
    }
}

module.exports = async () => {
    isoCountries = await utils.loadJson('country-iso');

    const c4cCompanies = await utils.readCsvFile('db_migration/aziende.csv');

    let keapCompanies = []
    const companiesChunkSize = 1000
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/companies?access_token=${process.env.KEAP_ACCESS_TOKEN}&limit=${companiesChunkSize}&offset=${companiesChunkSize*iterations}`;
            const res = await axios.get(url);
            keapCompanies = [...keapCompanies, ...res.data.companies];
            console.log(`getCompanies iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedCompanies: ${res.data.companies.length}`);
            iterations++;
            all = res.data.companies.length < companiesChunkSize;
        }
    }
    catch(err){
        console.error(err.message)
    }

    const validC4cCompanies = c4cCompanies.filter(c => VALID_COMPANIES_ROLES.includes(c.Role));
    const migrationCompanies = validC4cCompanies.map(c => buildKeapCompany(c));

    const companiesToInsert = migrationCompanies.filter(c => !keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.company_name.toUpperCase())).slice(0,1);
    const companiesToUpdate = migrationCompanies.filter(c => keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.company_name.toUpperCase())).slice(0,1);

    utils.saveJson(keapCompanies, `keapCompanies_${(new Date()).valueOf()}`, 'results');

    for(c of companiesToInsert) {
        try {
            const data = JSON.stringify(c);
            const config = {
                method: 'post',
                url: `${process.env.KEAP_API_URL}/companies?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                  'Content-Type': 'application/json'
                },
                data : data
            }
            const res = await axios(config);
            console.log(res);
        }
        catch (err) {
            console.error(err)
        }
    }

    return true;
}