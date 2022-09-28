const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildLeadOwnerUpdate = (lead, keapEmails, users) => {
    const ownerId = users.find(u => u.c4c_id === lead.Owner_Party_ID)?.keap_id ?? 53951;
    const contactOwnerUpdate = {
        contactId: keapEmails[lead.Contact_Information_EMail].keapId,
        owner_id: ownerId
    }

    return contactOwnerUpdate;
}

const checkValid = (lead, keapEmails, users) => {
    const validMail = !!lead.Contact_Information_EMail && utils.validateEmail(lead.Contact_Information_EMail);
    if (!validMail) {
        rejectedData.push({...lead, _error: `invalid email: ${lead.Contact_Information_EMail ?? 'N.A.'}`});
    }
    
    let validContact = false;
    if (validMail) {
        validContact = !!keapEmails[lead.Contact_Information_EMail];
        if (!validContact) {
            rejectedData.push({...lead, _error: `invalid contact: ${lead.Contact_Information_EMail} did not returned a valid contact on keap`});
        }
        
    }

    // const validAssignee = users.map(u => u.c4c_id).filter(u => u).includes(parseInt(lead.Owner_Party_ID));
    // if (!validAssignee) {
    //     rejectedData.push({...lead, _error: `invalid assignee (${lead.Owner_Party_ID}) - ${lead.Owner_Party_Name}`});
    // }

    return validMail && validContact /*&& validAssignee*/;
}

const isNewOwner = (c4cLead, keapContactish, users) => {    
    const ownerId = users.find(u => u.c4c_id === c4cLead.Owner_Party_ID)?.keap_id ?? 53951;
    const isNew = keapContactish.owner !== ownerId

    return isNew;
}

module.exports = async () => {
    const c4cLeads = await utils.readCsvFile('db_migration/leads.csv');
    const users = await utils.loadJson('users');

    const keapContactsRes = await apiManager.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keapEmails = utils.buildContactsEmails(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    if(apiErrors.length === 0){            
        const validC4cLeads = c4cLeads.filter(l => checkValid(l, keapEmails, users));
        
        let leadsNotFound = validC4cLeads.filter(l => !keapEmails[l.Contact_Information_EMail]);
        leadsNotFound = leadsNotFound.map(l => {return {...l, _error: 'lead not found in KEAP'}});
        rejectedData = [...rejectedData, ...leadsNotFound];

        let leadsToUpdate = validC4cLeads.filter(l => !!keapEmails[l.Contact_Information_EMail] && isNewOwner(l, keapEmails[l.Contact_Information_EMail], users));

        leadsToUpdate = leadsToUpdate.map(l => buildLeadOwnerUpdate(l, keapEmails, users));

        // dev only --START--
        // leadsToUpdate = leadsToUpdate.slice(0,1);
        // dev only --END--

        const updateRequests = leadsToUpdate.map(l => apiManager.buildUpdateLeadOwnerRequest(l, scriptResults, apiErrors));
        const updateChunks = _.chunk(updateRequests, konst.API_PARALLEL_CALLS);
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `leadOwnersScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_leadsOwners_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `leadOwnersScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}