const utils = require('../utils');
const axios = require('axios');
const crypto = require('crypto');
const _ = require('lodash');

const API_PARALLEL_CALLS = 20;
const cryptoSecret = 'SECRET'

const customFieldsMap = {
    contactID: 17,
    accountID: 19,
    businessRole: 25,
    c4cMigration: 70,
    hash: 68
}

const companyCustomFileds = {
    c4cId: 56
}

let isoCountries;
let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapContact = (c4cContact, c4cAccountIds) => {
    let contact = {};
    let address = {};
    
    const isoCountry = isoCountries.find(i => i['alpha-2'] === c4cContact.CountryRegion);
    if (isoCountry){
        address['country_code'] = isoCountry['alpha-3'];
    }
    address['field'] = 'BILLING';
    const line1 = `${c4cContact.Street ?? ''} ${c4cContact.House_Number ? ', ' + c4cContact.House_Number : ''}`;
    if (line1){
        address['line1'] = line1;
    }
    const line2 = `${c4cContact.State_Text ?? ''} ${c4cContact.State ? ' (' + c4cContact.State + ')' : ''}`;
    if (line2){
        address['line2'] = line2;
    }
    const locality = c4cContact.City;
    if (locality){
        address['locality'] = locality;
    }
    const zip_code = c4cContact.Postal_Code && c4cContact.Postal_Code.length === 5 ? c4cContact.Postal_Code : null;
    if (zip_code){
        address['zip_code'] = zip_code;
    }
    const zip_four = c4cContact.Postal_Code && c4cContact.Postal_Code.length === 4 ? c4cContact.Postal_Code : null;
    if (zip_four){
        address['zip_four'] = zip_four;
    }
    if (isoCountry || line1 || line2 || locality || zip_code || zip_four) {
        contact['addresses'] = [address];
    }

    const companyId = c4cAccountIds[c4cContact.Account_ID]; 
    if (companyId){
        contact['company'] = {id: companyId};
    }

    if (c4cContact.EMail) {
        contact['email_addresses'] = [{"email": c4cContact.EMail, "field": "EMAIL1"}];
        contact['duplicate_option'] = 'Email';
    }

    if(c4cContact.Last_Name){        
        contact['family_name'] = c4cContact.Last_Name;
    }
    if(c4cContact.Middle_Name){        
        contact['middle_name'] = c4cContact.Middle_Name;
    }
    if(c4cContact.First_Name){        
        contact['given_name'] = c4cContact.First_Name;
    }
    if(c4cContact.Job_Title){        
        contact['job_title'] = c4cContact.Job_Title;
    }

    const phone_numbers = []
    const workPhone = c4cContact.Phone ? {"field": "PHONE1", "number": c4cContact.Phone, "type": "Work"} : null;
    const mobilePhone = c4cContact.Mobile ? {"field": "PHONE2", "number": c4cContact.Mobile, "type": "Mobile"} : null;
    if (workPhone) {
        phone_numbers.push(workPhone);
    }
    if (mobilePhone) {
        phone_numbers.push(mobilePhone);
    }
    if (phone_numbers.length > 0) {
        contact['phone_numbers'] = phone_numbers;
    }

    if (c4cContact.Language) {
        if(c4cContact.Language === 'EN'){
            contact['preferred_locale'] = 'en_US';
        }
        if(c4cContact.Language === 'IT'){
            contact['preferred_locale'] = 'it_IT';
        }
    }

    let custom_fields = [
        {content: c4cContact.Contact_ID, id: customFieldsMap.contactID},
        {content: c4cContact.Contact_ID, id: customFieldsMap.contactID},
        {content: c4cContact.Function_Text, id: customFieldsMap.businessRole},
        {content: 'upserted', id: customFieldsMap.c4cMigration}
    ];
    contact['custom_fields'] = custom_fields;
    contact['opt_in_reason'] = 'email marketing approval imported from C4C SAP'
        
    const hash = crypto.createHash('sha256', cryptoSecret).update(JSON.stringify(contact)).digest('hex');
    contact.custom_fields.push({ content: hash, id: customFieldsMap.hash});
    return contact
}

const checkValid = (contact) => {
    const validStatus = contact.Status && parseInt(contact.Status) === 2;
    if (!validStatus) {
        rejectedData.push({...contact, _error: `${contact.Status ? 'invalid status: ' + contact.Status + ' - ' + contact.Status_Text : 'missing Status'}`});
    }

    const validCompanyMapping = contact.Account_ID ? true : false;
    if (!validCompanyMapping) {
        rejectedData.push({...contact, _error: `missing company mapping (Account_ID)`});
    } 

    const validEmail = utils.validateEmail(contact.EMail);
    if (!validEmail) {
        rejectedData.push({...contact, _error: `invalid email: ${contact.name} ${contact.surname} - ${contact.email}`})
    }

    return validStatus && validCompanyMapping && validEmail;
}

module.exports = async () => {
    isoCountries = await utils.loadJson('country-iso');

    const c4cContacts = await utils.readCsvFile('db_migration/contatti.csv');

    const keapCompaniesRes = await utils.retrieveKeapCompanies();
    const keapCompanies = keapCompaniesRes.companies;
    apiErrors = [...apiErrors, ...keapCompaniesRes.apiErrors];

    const c4cAccountIds = {};
    keapCompanies.map(k => {
            const c4cId = k.custom_fields.find(f => f.id === companyCustomFileds.c4cId);
            if (c4cId.content) {
                c4cAccountIds[c4cId.content] = k.id;
            }
    })

    const keapContactsRes = await utils.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];

    const keepContactsHash = {};
    keapContacts.map(k => {
            const hash = k.custom_fields.find(f => f.id === customFieldsMap.hash).content;
            if (hash) {
                const email = k.email_addresses.find(e => e.field === 'EMAIL1').email;
                keepContactsHash[email] = hash;
            }
    })

    if(apiErrors.length === 0){
        const validC4cContacts = c4cContacts.filter(c => checkValid(c));
            
        let contactToUpsert = validC4cContacts.map(c => buildKeapContact(c, c4cAccountIds));
        // dev only --START--
        contactToUpsert = contactToUpsert.slice(0,2);
        // dev only --END--

        const upsertRequests = contactToUpsert.map(c => {
            const fn = async () => {
                try{
                    //TODO handle contact hash
                    const currentEmail = c.email_addresses.find(e => e.field === 'EMAIL1').email;
                    const updatingHash = keepContactsHash[currentEmail];
                    const currentHash = c.custom_fields.find(f => f.id === customFieldsMap.hash).content;
                    if (currentHash !== updatingHash) {
                        const data = JSON.stringify(c);
                        const config = {
                            method: 'put',
                            url: `${process.env.KEAP_API_URL}/contacts?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            data : data
                        }
                        const res = await axios(config);
                        console.log(res);
                        scriptResults.push({
                            action: 'upsert',
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
                        console.log(`contact: ${c.given_name ?? ''} ${c.middle_name ?? ''} ${c.family_name ?? ''} - ${currentEmail} is already up to date`)
                    }
                }
                catch(err){
                    console.error(err);
                    errore = {
                        message: err.message,
                        stack: err.stack,
                        type: 'upsert contact error',
                        data: c
                    };
                    apiErrors.push(errore);
                }
            }
            return fn;
        });
        
        const upsertChunks = _.chunk(upsertRequests, API_PARALLEL_CALLS)
        for(const r of upsertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `contactsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_contacts_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `contactScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}