const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapAppointementFromPhoneCall = (c4cPhoneCall, keepContactsInfo, users, note, parties) => {

    let appointment = {};
    appointment["title"] = c4cPhoneCall.Subject;

    const startDate = new Date(c4cPhoneCall.Start_DateTime);
    const endDate = new Date(c4cPhoneCall.End_Date_Time);
    appointment["start_date"] = startDate.toISOString();
    appointment["end_date"] = endDate.valueOf() > startDate.valueOf() ? endDate.toISOString() : (new Date(startDate.valueOf() + 1)).toISOString();

    appointment["location"] = 'Telephone Call';
    appointment["contact_id"] = keepContactsInfo[c4cPhoneCall.Main_Contact_ID].keapId

    const user = users.find(u => u.c4c_id === parseInt(c4cPhoneCall.Owner_ID))?.keap_id ?? 53951;
    appointment["user"] = user
    if (note?.Text) {
        appointment["description"] = note.Text + '\r\n';
    }
    else {
        appointment["description"] = '\r\n';
    }
    appointment["remind_time"] = 1440;

    if( parties && parties.length > 0) {        
        appointment["description"] = appointment["description"] + '\r\n';
    }
    parties?.map(p => {        
        appointment["description"] = appointment['description'] + `[ ${p.Party_Name} - ${p.EMail} - ${p.Phone}` + '\r\n';
    })

    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(appointment)).digest('hex');
    const mapDescription = `\r\n\r\n - [id:${c4cPhoneCall.ObjectID}, hash:${hash}]`
    appointment['description'] = appointment['description'] + mapDescription;
    return appointment;
}

const checkValid = (appointment, keepContactsInfo, users) => {
    const validContact = !!keepContactsInfo[appointment.Main_Contact_ID];
    if (!validContact) {
        rejectedData.push({...appointment, _error: `invalid contact: ${appointment.Main_Contact_ID} - ${appointment.Primary_Contact} did not returned a c4c mapped contact on keap`});
    }

    // const validAssignee = users.map(u => u.c4c_id).filter(u => u).includes(parseInt(appointment.Owner_ID));
    // if (!validAssignee) {
    //     rejectedData.push({...appointment, _error: `invalid assignee: ${appointment.Owner_ID} - ${appointment.Owner_Party_Name}`});
    // }

    return validContact /*&& validAssignee*/;
}

module.exports = async () => {
    const c4cAppointments = await utils.readCsvFile('db_migration/phonecalls.csv');
    const users = await utils.loadJson('users');

    const keapContactsRes = await apiManager.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keepContactsInfo = utils.buildContactsInfo(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    const keapAppointmentsRes = await apiManager.retrieveKeapAppointments();
    const keapAppointment = keapAppointmentsRes.appointments;
    apiErrors = [...apiErrors, ...keapAppointmentsRes.apiErrors];
    const keapAppointmentsInfo = utils.buildAppointmentsInfo(keapAppointment);
    console.log('\r\n');

    if(apiErrors.length === 0){            
        const validC4cAppointmentss = c4cAppointments.filter(a => checkValid(a, keepContactsInfo, users));
        
        let appointmentsToInsert = validC4cAppointmentss.filter(a => !keapAppointmentsInfo[a.ObjectID]);
        let appointmentsToUpdate = validC4cAppointmentss.filter(a => keapAppointmentsInfo[a.ObjectID]);

        let appointmentsNotes = {};
        const appointmentsNotesRaw = await utils.readCsvFile('db_migration/phonecallnotes.csv');
        appointmentsNotesRaw.map(n => {
            appointmentsNotes[n.Phone_Call_ID] = n;
        })

        const appointmentsPartiesRaw = await utils.readCsvFile('db_migration/phonecallparticipants.csv');
        const appointmentsParties = _.groupBy(appointmentsPartiesRaw, 'Phone_Call_ID')

        appointmentsToInsert = appointmentsToInsert.map(a => buildKeapAppointementFromPhoneCall(a, keepContactsInfo, users, appointmentsNotes[a.ID], appointmentsParties[a.ID]));
        appointmentsToUpdate = appointmentsToUpdate.map(a => buildKeapAppointementFromPhoneCall(a, keepContactsInfo, users, appointmentsNotes[a.ID], appointmentsParties[a.ID]));

        // dev only --START--
        // appointmentsToInsert = appointmentsToInsert.slice(0,1);
        // appointmentsToUpdate = appointmentsToUpdate.slice(0,1);
        // dev only --END--

        const insertRequests = appointmentsToInsert.map(a => apiManager.buildInsertAppointmentRequest(a, scriptResults, apiErrors));
        const insertChunks = _.chunk(insertRequests, konst.API_PARALLEL_CALLS);
        for(const r of insertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
        
        const updateRequests = appointmentsToUpdate.map(a => apiManager.buildUpdateAppointmentRequest(a, keapAppointmentsInfo, scriptResults, apiErrors));
        const updateChunks = _.chunk(updateRequests, konst.API_PARALLEL_CALLS);
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `phoneCallsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_phoneCalls_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `phoneCallsScriptResults_${(new Date()).valueOf()}`, 'results');
    return status;
}