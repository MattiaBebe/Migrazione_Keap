const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapOpportunity = (c4cOpportunity, c4cAccountIds, keepContactsInfo, keapEmails, users) => {
    const taskAdresseeMail = keepContactsInfo[c4cOpportunity.Primary_Contact]?.email ?? c4cAccountIds[c4cOpportunity.Account]?.primary_mail;
    const contactIds = keapEmails[taskAdresseeMail];
    const contact = {
        company_name: c4cAccountIds[c4cOpportunity.Account]?.name,
        email: taskAdresseeMail,
        first_name: keepContactsInfo[contactIds.c4cId].firstName,
        last_name: keepContactsInfo[contactIds.c4cId].lastName,
        id: contactIds.keapId,
        phone_number: keepContactsInfo[contactIds.c4cId].phone,
        job_title: keepContactsInfo[contactIds.c4cId].jobTitle,
    }

    const user = users.find(u => u.c4c_id === parseInt(c4cOpportunity.Owner));

    const mappedStage = konst.opportunityStageMap[c4cOpportunity.Status];
    const stage = {
        details: {
          probability: parseInt(c4cOpportunity.Probability),
          stage_order: mappedStage.stage_order
        },
        id: mappedStage.stage_id,
        name: mappedStage.name,
    }

    let opportunity = {
        contact: contact,        
        date_created: c4cOpportunity.Creation_Date_Time,
        estimated_close_date: c4cOpportunity.Close_Date,
        opportunity_title: c4cOpportunity.Name,
        user: {
            first_name: user?.given_name ?? 'Cy.Pag.',
            id: user?.keap_id ?? 53951,
            last_name: user?.family_name ?? 'S.p.A.'
          },
        stage : stage,
        custom_fields: [
            {
              content: c4cOpportunity.ObjectID              ,
              id: konst.opportunitiesCustomFieldsMap.objectId
            }
          ]
    };

    if (c4cOpportunity.Weighted_Value) {
        opportunity['projected_revenue_high'] = parseFloat(c4cOpportunity.Weighted_Value);
    }

    if (c4cOpportunity.Changed_On) {
        opportunity['last_updated'] = c4cOpportunity.Changed_On;
    }

    if (c4cOpportunity.Relevant_for_Forecast === 'FALSE' || c4cOpportunity.Relevant_for_Forecast === 'TRUE') {
        opportunity['include_in_forecast'] = c4cOpportunity.Relevant_for_Forecast === 'FALSE' ? 0 : 1;
    }
    
    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(opportunity)).digest('hex');
    opportunity.custom_fields.push({
        content: hash,            
        id: konst.opportunitiesCustomFieldsMap.hash
    });

    return opportunity;
}

const checkValid = (opportunity, c4cAccountIds, keepContactsInfo, keapEmails, users) => {
    const contactId = opportunity.Primary_Contact;
    const accountId = opportunity.Account;

    const mailAddress = keepContactsInfo[contactId]?.email ?? c4cAccountIds[accountId]?.primary_mail;
    const validMail = !!mailAddress && utils.validateEmail(mailAddress) && !!keapEmails[mailAddress];
    if (!validMail) {
        rejectedData.push({...opportunity, _error: `invalid contactId (${contactId}) not fixable through AccountId (${accountId}) ... tentaitve but unaccepted email adressee: ${mailAddress}`});
    }

    const validContact = !!keapEmails[mailAddress]?.c4cId;
    if (!validContact) {
        rejectedData.push({...opportunity, _error: `invalid contact: ${mailAddress} did not returned a c4c mapped contact on keap`});
    }

    // const validAssignee = users.map(u => u.c4c_id).filter(u => u).includes(parseInt(opportunity.Owner));
    // if (!validAssignee) {
    //     rejectedData.push({...opportunity, _error: `invalid assignee ${opportunity.Owner_Name} (${opportunity.Owner})`});
    // }

    return validMail && validContact /*&& validAssignee*/;
}

module.exports = async () => {
    const c4cOpportunities = await utils.readCsvFile('db_migration/Opportunity.csv');
    const users = await utils.loadJson('users');

    const keapCompaniesRes = await apiManager.retrieveKeapCompanies();
    const keapCompanies = keapCompaniesRes.companies;
    apiErrors = [...apiErrors, ...keapCompaniesRes.apiErrors];
    const c4cAccountIds = utils.buildAccountsInfo(keapCompanies, konst.companyCustomFiledsMap);
    console.log('\r\n');

    const keapContactsRes = await apiManager.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keepContactsInfo = utils.buildContactsInfo(keapContacts, konst.contactCustomFieldsMap);
    const keapEmails = utils.buildContactsEmails(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    const keapOpportunitiesRes = await apiManager.retrieveKeapOpportunities(users);
    const keapOpportunities = keapOpportunitiesRes.opportunities;
    apiErrors = [...apiErrors, ...keapOpportunitiesRes.apiErrors];
    const keapOpportunitiesInfo = utils.buildOpportunityInfo(keapOpportunities, konst.opportunitiesCustomFieldsMap);
    console.log('\r\n');

    if(apiErrors.length === 0){            
        const validC4cOpportunities = c4cOpportunities.filter(o => checkValid(o, c4cAccountIds, keepContactsInfo, keapEmails, users));
        
        let opportunitiesToInsert = validC4cOpportunities.filter(o => !keapOpportunitiesInfo[o.ObjectID]);
        let opportunitiesToUpdate = validC4cOpportunities.filter(o => keapOpportunitiesInfo[o.ObjectID]);

        opportunitiesToInsert = opportunitiesToInsert.map(o => buildKeapOpportunity(o, c4cAccountIds, keepContactsInfo, keapEmails, users));
        opportunitiesToUpdate = opportunitiesToUpdate.map(o => buildKeapOpportunity(o, c4cAccountIds, keepContactsInfo, keapEmails, users));

        // dev only --START--
        // opportunitiesToInsert = opportunitiesToInsert.slice(0,1);
        // opportunitiesToUpdate = opportunitiesToUpdate.slice(0,1);
        // dev only --END--

        const insertRequests = opportunitiesToInsert.map(c => apiManager.buildInsertOpportunityRequest(c, scriptResults, apiErrors));
        const insertChunks = _.chunk(insertRequests, konst.API_PARALLEL_CALLS);
        for(const r of insertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
        
        const updateRequests = opportunitiesToUpdate.map(c => apiManager.buildUpdateOpportunityRequest(c, keapOpportunitiesInfo, scriptResults, apiErrors));
        const updateChunks = _.chunk(updateRequests, konst.API_PARALLEL_CALLS);
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `opportunitiesScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_opportunities_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `opportunitiesScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}