const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildLeadOwnerUpdate = (c4cTask, c4cAccountIds, keepContactsInfo, keapEmails, users) => {
    const taskAdresseeMail = keepContactsInfo[c4cTask.Main_Contact_ID]?.email ?? c4cAccountIds[c4cTask.Main_Account_ID]?.primary_mail;
    const contactIds = keapEmails[taskAdresseeMail];
    const contact = {
        email: taskAdresseeMail,
        first_name: keepContactsInfo[contactIds.c4cId].firstName,
        last_name: keepContactsInfo[contactIds.c4cId].lastName,
        id: contactIds.keapId
    }

    const completed = !!c4cTask.Status && (parseInt(c4cTask.Status) === 4 || parseInt(c4cTask.Status) === 3);
    const user = users.find(u => u.c4c_id === parseInt(c4cTask.Main_Employee_Responsible_ID));
    let task = {
        completed: completed,
        creation_date: c4cTask.Start_DateTime,
        due_date: c4cTask.Due_Date_Time,
        contact: contact,
        title: c4cTask.Subject,
        priority: parseInt(c4cTask.Priority),
        user_id: user.keap_id,
        type: 'Other' //valid only: "Call, Email, Appointment, Fax, Letter, Other"
    };
    if(completed && c4cTask.Completion_Date_Time){
        task['completion_date'] = c4cTask.Completion_Date_Time;
    }
    
    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(task)).digest('hex');
    const description = ` - [id:${c4cTask.ObjectID}, hash:${hash}]`
    task['description'] = description;
    return task;
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

    const validAssignee = users.map(u => u.c4c_id).filter(u => u).includes(parseInt(lead.Owner_Party_ID));
    if (!validAssignee) {
        rejectedData.push({...lead, _error: `invalid assignee (${lead.Owner_Party_ID}) - ${lead.Owner_Party_Name}`});
    }

    return validMail && validContact && validAssignee;
}

module.exports = async () => {
    const c4cTasks = await utils.readCsvFile('db_migration/leads.csv');
    const users = await utils.loadJson('users');

    const keapContactsRes = await apiManager.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keapEmails = utils.buildContactsEmails(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    if(apiErrors.length === 0){            
        const validC4cTasks = c4cTasks.filter(t => checkValid(t, c4cAccountIds, keepContactsInfo, keapEmails, users));
        
        let tasksToInsert = validC4cTasks.filter(t => !keapTasksInfo[t.ObjectID]);
        let tasksToUpdate = validC4cTasks.filter(t => keapTasksInfo[t.ObjectID]);

        tasksToInsert = tasksToInsert.map(t => buildKeapTask(t, c4cAccountIds, keepContactsInfo, keapEmails, users));
        tasksToUpdate = tasksToUpdate.map(t => buildKeapTask(t, c4cAccountIds, keepContactsInfo, keapEmails, users));

        // dev only --START--
        // tasksToInsert = tasksToInsert.slice(0,1);
        // tasksToUpdate = tasksToUpdate.slice(0,1);
        // dev only --END--

        const insertRequests = tasksToInsert.map(c => apiManager.buildInsertTaskRequest(c, scriptResults, apiErrors));
        const insertChunks = _.chunk(insertRequests, konst.API_PARALLEL_CALLS);
        for(const r of insertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
        
        const updateRequests = tasksToUpdate.map(c => apiManager.buildUpdateTaskRequest(c, keapTasksInfo, scriptResults, apiErrors));
        const updateChunks = _.chunk(updateRequests, konst.API_PARALLEL_CALLS);
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `tasksScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_tasks_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `tasksScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}