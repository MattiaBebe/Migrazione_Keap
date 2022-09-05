const utils = require('../utils');
const apiManager = require('../api-manager');
const buildContactTags = require('./tags');
const konst = require('./constants');
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

    // if(c4cContact.Last_Name){        
    //     contact['family_name'] = c4cContact.Last_Name;
    // }
    // if(c4cContact.Middle_Name){        
    //     contact['middle_name'] = c4cContact.Middle_Name;
    // }
    if(c4cContact.First_Name){        
        contact['given_name'] = c4cContact.Name;
    }
    if(c4cContact.Job_Title){        
        contact['job_title'] = 'COMPANY CONTACT';
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

    let custom_fields = [
        {content: 'upserted', id: konst.contactCustomFieldsMap.c4cMigration}
    ];
    contact['custom_fields'] = custom_fields;
    contact['opt_in_reason'] = 'email marketing approval imported from C4C SAP'
        
    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(contact)).digest('hex');
    contact.custom_fields.push({ content: hash, id: konst.contactCustomFieldsMap.hash});
    return contact
}

const checkValid = (task, keapCompanies, keapContacts, keapEmails) => {
    const contactId = task.Main_Contact_ID;
    const accountId = task.Main_Account_ID;

    const taskAdresseeMail = contactId?.email ? contactId.email : accountId?.primary_mail ?? null;
    const validContact = taskAdresseeMail && utils.validateEmail(taskAdresseeMail) && keapEmails[taskAdresseeMail];
    if (!validContact) {
        rejectedData.push({...contact, _error: `invalid contactId (${contactId}) not fixable through AccountId (${accountId}) ... tentaitve but unaccepted adressee: ${taskAdresseeMail}`});
    }

    return validContact ;
}

module.exports = async () => {
    const c4cTasks = await utils.readCsvFile('db_migration/attività.csv');

    const keapCompaniesRes = await utils.retrieveKeapCompanies();
    const keapCompanies = keapCompaniesRes.companies;
    apiErrors = [...apiErrors, ...keapCompaniesRes.apiErrors];
    const c4cAccountIds = utils.buildAccountsInfo(keapCompanies, konst.companyCustomFiledsMap);
    console.log('\r\n');


    const keapContactsRes = await utils.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keepContactsInfo = utils.buildContactsInfo(keapContacts);
    const keepEmails = utils.buildContactsEmails(keapContacts);
    console.log('\r\n');

    if(apiErrors.length === 0){            
        const validC4cTasks = c4cTasks.filter(c => checkValid(c, keapCompanies, keepContactsInfo, keepEmails));
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
        contactToUpsert = contactToUpsert.slice(0,1);
        // dev only --END--

        const upsertRequests = contactToUpsert.map(c => apiManager.buildUpsertContactRequest(c, keepContactsHash, false, tagsToApply, scriptResults, apiErrors));
        
        const upsertChunks = _.chunk(upsertRequests, konst.API_PARALLEL_CALLS);
        for(const r of upsertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `companyContactsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_companyContacts_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `companyContactsScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}