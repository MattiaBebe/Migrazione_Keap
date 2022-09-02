const utils = require('../utils');
const axios = require('axios');
const crypto = require('crypto');
const _ = require('lodash');

const API_PARALLEL_CALLS = 20;
const cryptoSecret = 'SECRET'

const VALID_COMPANIES_ROLES = [
    'CRM000',
    'BUP002',
    'Z00010',
    'Z00100'
]

const customFieldsMap = {
    industry: 48,
    abcClass: 50,
    userOwner: 64,
    sapId: 54,
    c4cId: 56,
    c4cMigrationEvent: 62,
    hash: 66
}

let isoCountries;
let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapCompany = (c4cCompany, action) => {
    let company = {};

    const isoCountry = isoCountries.find(i => i['alpha-2'] === c4cCompany.CountryRegion);
    let country_code = isoCountry ? isoCountry['alpha-3'] : null;
    let line1 = `${c4cCompany.Street ? c4cCompany.Street : ''} ${c4cCompany.House_Number ? ', ' + c4cCompany.House_Number : ''}`;
    let locality = c4cCompany.City;
    let zip_code = c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 5 ? c4cCompany.Postal_Code : null;
    let zip_four = c4cCompany.Postal_Code && c4cCompany.Postal_Code.length === 4 ? c4cCompany.Postal_Code : null;
    if (country_code || line1 || locality || zip_code || zip_four) {
        company['address'] = {};
        if (country_code) {
            company.address['country_code'] = country_code
        }
        if (line1) {
            company.address['line1'] = line1
        }
        if (locality) {
            company.address['locality'] = locality
        }
        if (zip_code) {
            company.address['zip_code'] = zip_code
        }
        if (zip_four) {
            company.address['zip_four'] = zip_four
        }
    }

    if(c4cCompany.Name) {
        company['company_name'] = c4cCompany.Name
    }

    let custom_fields = []
    if(customFieldsMap.industry){
        custom_fields.push({
                content: c4cCompany.Industry_Text,
                id: customFieldsMap.industry
        })
    };
    custom_fields.push({
        content: c4cCompany.ABC_Classification === 'A' ? 70 : c4cCompany.ABC_Classification === 'B' ? 72 : c4cCompany.ABC_Classification === 'C' ? 74 : 76,
        id: customFieldsMap.abcClass
    });
    custom_fields.push({
        content: 0,
        id: customFieldsMap.userOwner
    });
    if(c4cCompany.External_ID){
        custom_fields.push({
            content: c4cCompany.External_ID,
            id: customFieldsMap.sapId
        })
    } /*else {
        custom_fields.push({
            content: null,
            id: customFieldsMap.sapId
        })
    }*/
    if(c4cCompany.Account_ID){
        custom_fields.push({
            content: c4cCompany.Account_ID,
            id: customFieldsMap.c4cId
        })
    }
    custom_fields.push({
        content: action,
        id: customFieldsMap.c4cMigrationEvent
    });
    company['custom_fields'] = custom_fields;

    if(c4cCompany.EMail && utils.validateEmail(c4cCompany.EMail)) {
        company['email_address'] = c4cCompany.EMail
    }

    if(c4cCompany.Fax) {
        company['fax_number'] = {
            number: c4cCompany.Fax,
            type: "Work"
    }}

    if(c4cCompany.Phone) {
        company['phone_number'] = {
            number: c4cCompany.Phone,
            type: "Work"
    }}

    let website = c4cCompany.Web_Site?.substring(0, 3) === 'www' ? `https://${c4cCompany.Web_Site}` : c4cCompany.Web_Site
    if (utils.validateUrl(website)) {
        company['website'] = website;
    } else {
        website = `https://www.${c4cCompany.Web_Site}`
        if (utils.validateUrl(website)){
            company['website'] = website;
        }
    }

    const hash = crypto.createHash('sha256', cryptoSecret).update(JSON.stringify(company)).digest('hex');
    company.custom_fields.push({ content: hash, id: customFieldsMap.hash});

    return company
}

const checkValid = (company) => {
    const validRole = (company) => {
        const valid = VALID_COMPANIES_ROLES.includes(company.Role);
        if (!valid) {
            rejectedData.push({...company, _error: `invalid company role: ${company.Role} - ${company.Role_Text}`});
        }
        return valid
    };
    const validStatus = (company) => {
        const valid = parseInt(company.Status) !== 4;
        if (!valid) {
            rejectedData.push({...company, _error: `invalid company status: ${company.Status} - ${company.Status_Text}`})
        }
        return valid
    };

    return validRole(company) && validStatus(company);
}

module.exports = async () => {
    isoCountries = await utils.loadJson('country-iso');

    const c4cCompanies = await utils.readCsvFile('db_migration/aziende.csv');

    const keapCompaniesRes = await utils.retrieveKeapCompanies();
    const keapCompanies = keapCompaniesRes.companies;
    apiErrors = [...apiErrors, ...keapCompaniesRes.apiErrors];

    if(apiErrors.length === 0){
        const c4cAccountIds = {};
        keapCompanies.map(k => {
                const c4cId = k.custom_fields.find(f => f.id === customFieldsMap.c4cId);
                const hash = k.custom_fields.find(f => f.id === customFieldsMap.hash);
                if (c4cId.content) {
                    c4cAccountIds[c4cId.content] = {id: k.id, hash: hash.content};
                }
        })

        let companiesToInsert = [];
        let companiesToUpdate = [];
        const validC4cCompanies = c4cCompanies.filter(c => checkValid(c));

        //TEMPORARY ONLY --> MATCH THROUGH MAPPING AFTER FIRST ROUND OF INSERT
        // companiesToInsert = validC4cCompanies.filter(c => !keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.Name.toUpperCase()));
        // companiesToUpdate = validC4cCompanies.filter(c => keapCompanies.map(k => k.company_name.toUpperCase()).includes(c.Name.toUpperCase()));
        //TEMPORARY ONLY --> MATCH THROUGH MAPPING AFTER FIRST ROUND OF INSERT


        validC4cCompanies.map(c => {
            const alreadyOnKeap = c4cAccountIds[c.Account_ID] ? true : false;
            if (alreadyOnKeap) {
                companiesToUpdate.push(c);
            } else {
                companiesToInsert.push(c);
            }
        })

        // const fixAccountId = companiesToInsert.map(c => c.Account_ID);

        companiesToInsert = companiesToInsert.map(c => buildKeapCompany(c, 'created'));
        companiesToUpdate = companiesToUpdate.map(c => buildKeapCompany(c, 'updated'));

        // dev only --START--
        // utils.saveJson(keapCompanies, `keapCompanies_${(new Date()).valueOf()}`, 'results');
        // companiesToInsert = companiesToInsert.slice(0,1);
        // companiesToUpdate = companiesToUpdate.slice(0,1);
        // dev only --END--

        const insertRequests = companiesToInsert.map(c => {
            const fn = async () =>{
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
                    console.error(err);
                    errore = {
                        message: err.message,
                        stack: err.stack,
                        type: 'insert company error',
                        data: c
                    };
                    apiErrors.push(errore);
                }

            }
            return fn;
        });

        const insertsChunks = _.chunk(insertRequests, API_PARALLEL_CALLS)
        for(const r of insertsChunks) {
            const promises = r.map(fn => fn())
            await Promise.all(promises);
        }

        const updateRequests = companiesToUpdate.map(c => {
            const fn = async () => {
                try{
                    // const updatingCompany = keapCompanies.find(k => k.company_name.toUpperCase() === c.company_name.toUpperCase());
                    const accountId = c.custom_fields.find(f => f.id === customFieldsMap.c4cId).content;
                    const updatingCompany = c4cAccountIds[accountId];
                    const updatingCompanyHash = updatingCompany.hash;
                    const currentHash = c.custom_fields.find(f => f.id === customFieldsMap.hash).content;
                    if (updatingCompanyHash !== currentHash) {
                        const companyId = updatingCompany.id;
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
                    else {
                        console.log(`company: ${c.company_name} is already up to date`)
                    }
                }
                catch(err){
                    console.error(err);
                    errore = {
                        message: err.message,
                        stack: err.stack,
                        type: 'update company error',
                        data: c
                    };
                    apiErrors.push(errore);
                }
            }
            return fn;
        })

        const updateChunks = _.chunk(updateRequests, API_PARALLEL_CALLS)
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
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