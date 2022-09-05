const utils = require('../utils');
const apiManager = require('../api-manager');
const buildContactTags = require('./tags');
const konst = require('./constants');
const axios = require('axios');
const crypto = require('crypto');
const _ = require('lodash');

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

    const companyId = c4cAccountIds[c4cContact.Account_ID]?.id; 
    if (companyId){
        contact['company'] = {id: companyId};
    }
    else {
        console.log(`contact ${c4cContact.First_Name} ${c4cContact.Last_Name} features invalid company accountId ${c4cContact.Account_ID} (Obsolete??)`);
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
        {content: c4cContact.Contact_ID, id: konst.contactCustomFieldsMap.contactID},
        {content: c4cContact.Contact_ID, id: konst.contactCustomFieldsMap.contactID},
        {content: c4cContact.Function_Text, id: konst.contactCustomFieldsMap.businessRole},
        {content: 'upserted', id: konst.contactCustomFieldsMap.c4cMigration}
    ];
    contact['custom_fields'] = custom_fields;
    contact['opt_in_reason'] = 'email marketing approval imported from C4C SAP'
        
    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(contact)).digest('hex');
    contact.custom_fields.push({ content: hash, id: konst.contactCustomFieldsMap.hash});
    return contact
}

const checkValid = (contact, c4cAccountIds) => {
    const validStatus = contact.Status && parseInt(contact.Status) === 2;
    if (!validStatus) {
        rejectedData.push({...contact, _error: `${contact.Status ? 'invalid status: ' + contact.Status + ' - ' + contact.Status_Text : 'missing Status'}`});
    }

    let companyIsNotObsolete = false;
    const validCompanyMapping = contact.Account_ID ? true : false;
    if (!validCompanyMapping) {
        rejectedData.push({...contact, _error: `missing company mapping (Account_ID)`});
    } else {        
        companyIsNotObsolete = c4cAccountIds[contact.Account_ID] ? true : false;
        if (!companyIsNotObsolete) {
            rejectedData.push({...contact, _error: `company mapping (Account_ID) points to an invalid company (Obsolete or ShipToParty)`});
        }
    }

    const validEmail = utils.validateEmail(contact.EMail);
    if (!validEmail) {
        rejectedData.push({...contact, _error: `invalid email: ${contact.name} ${contact.surname} - ${contact.email}`})
    }

    return validStatus && validCompanyMapping && companyIsNotObsolete && validEmail ;
}

module.exports = async () => {
    isoCountries = await utils.loadJson('country-iso');

    const c4cContacts = await utils.readCsvFile('db_migration/contatti.csv');

    const keapCompaniesRes = await utils.retrieveKeapCompanies();
    const keapCompanies = keapCompaniesRes.companies;
    apiErrors = [...apiErrors, ...keapCompaniesRes.apiErrors];
    const c4cAccountIds = utils.buildAccountsInfo(keapCompanies, konst.companyCustomFiledsMap);
    console.log('\r\n');


    const keapContactsRes = await utils.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keepContactsHash = utils.buildContatsHash(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    if(apiErrors.length === 0){
        const validC4cContacts = c4cContacts.filter(c => checkValid(c, c4cAccountIds));
            
        let contactToUpsert = validC4cContacts.map(c => buildKeapContact(c, c4cAccountIds));
        
        let tagsToApply = {};
        validC4cContacts.map(c => {
            const tags = buildContactTags(c, c4cAccountIds);
            if (tags && tags.length > 0) {
                tagsToApply[c.Account_ID] = tags;
            }
        });
        console.log('\r\n');

        // dev only --START--
        contactToUpsert = contactToUpsert.slice(0,2);
        // dev only --END--

        const upsertRequests = contactToUpsert.map(c => apiManager.buildUpsertContactRequest(c, keepContactsHash, false, scriptResults, apiErrors));
        
        const upsertChunks = _.chunk(upsertRequests, konst.API_PARALLEL_CALLS);
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