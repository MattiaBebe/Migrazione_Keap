const utils = require('../utils');
const axios = require('axios');

const VALID_COMPANIES_ROLES = [
    'CRM000',
    'BUP002',
    'Z00010',
    'Z00100'
]

let isoCountries;
let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapContact = (c4cCompany, action) => {
    const isoCountry = isoCountries.find(i => i['alpha-2'] === c4cCompany.CountryRegion);
    return {
        address: {
            country_code: isoCountry ? isoCountry['alpha-3'] : null,
            line1: c4cCompany.Street + `${c4cCompany.House_Number ? ', ' + c4cCompany.House_Number : ''}`,
            // line2: c4cCompany.City,
            locality: c4cCompany.City,
            zip_code: c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 5 ? c4cCompany.Postal_Code : null,
            zip_four: c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 4 ? c4cCompany.Postal_Code : null,
        },
        company_name: c4cCompany.Name,
        custom_fields: [
            {
                content: c4cCompany.Industry_Text,
                id: 48
            },
            {
                content: c4cCompany.ABC_Classification === 'A' ? 70 : c4cCompany.ABC_Classification === 'B' ? 72 : c4cCompany.ABC_Classification === 'C' ? 74 : 76,
                id: 50
            },
            {
                content: 0,
                id: 64
            },
            {
                content: c4cCompany.External_ID
                ,
                id: 54
            },
            {
                content: c4cCompany.Account_ID
                ,
                id: 56
            },
            {
                content: action,
                id: 62
            },

        ],
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

const checkValid = (contact) => {
    const validEmail = utils.validateEmail(contact.email);
    if (!validEmail) {
        rejectedData.push({contact, _error: `invalid contact email: ${contact.name} ${contact.surname} - ${contact.email}`})
    }
    return validEmail;
}

module.exports = async () => {
    isoCountries = await utils.loadJson('country-iso');

    const c4cCompanies = await utils.readCsvFile('db_migration/aziende.csv');

    let keapCompanies = [];
    const companiesChunkSize = 1000;
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/companies?access_token=${process.env.KEAP_ACCESS_TOKEN}&optional_properties=custom_fields&limit=${companiesChunkSize}&offset=${companiesChunkSize*iterations}`;
            const res = await axios.get(url);
            keapCompanies = [...keapCompanies, ...res.data.companies];
            console.log(`getCompanies iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedCompanies: ${res.data.companies.length}`);
            iterations++;
            all = res.data.companies.length < companiesChunkSize;
        }
    }
    catch(err){
        errore = {
            ...err, 
            type: 'get companies error'
        };
        apiErrors.push(errore);
    }

    if(apiErrors.length === 0){
        const validC4cCompanies = c4cCompanies.filter(c => checkValid(c));
    
        let companiesToInsert = validC4cCompanies.filter(c => !keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.Name.toUpperCase()));
        companiesToInsert = companiesToInsert.map(c => buildKeapCompany(c, 'created'));

        let companiesToUpdate = validC4cCompanies.filter(c => keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.Name.toUpperCase()));
        companiesToUpdate = companiesToUpdate.map(c => buildKeapCompany(c, 'updated'));
        
        // dev only --START--
        // utils.saveJson(keapCompanies, `keapCompanies_${(new Date()).valueOf()}`, 'results');
        // companiesToInsert = companiesToInsert.slice(0,1);
        // companiesToUpdate = companiesToUpdate.slice(0,1);
        // dev only --END--
    
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
                scriptResults.push({
                    action: 'insert',
                    data: c,
                    response: {
                        data: res.data,
                        request_protocol: res.request.protocol,
                        request_host: res.request.host,
                        request_path: res.request.path,
                        request_method: res.request.method,
                        response_status: res.status,
                        response_statusText: res.statusText
                    }
                });
            }
            catch (err) {
                errore = {
                    ...err,
                    type: 'insert company error',
                    data: c
                };
                apiErrors.push(errore);
            }
        }
    
        for(c of companiesToUpdate){
            try{
                const companyId = keapCompanies.find(k => k.company_name === c.company_name).id;
                const data = JSON.stringify(c);
                const config = {
                    method: 'patch',
                    url: `${process.env.KEAP_API_URL}/companies/${companyId}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    data : data
                }
                const res = await axios(config);
                console.log(res);
                scriptResults.push({
                    action: 'update',
                    data: c,
                    response: {
                        data: res.data,
                        request_protocol: res.request.protocol,
                        request_host: res.request.host,
                        request_path: res.request.path,
                        request_method: res.request.method,
                        response_status: res.status,
                        response_statusText: res.statusText
                    }
                });
            }
            catch(err){
                errore = {
                    ...err,
                    type: 'update company error',
                    data: c
                };
                apiErrors.push(errore);
            }
        } 
    }
    
    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `companiesScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_companies_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `companiesScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}