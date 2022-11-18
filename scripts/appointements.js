const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapAppointement = (c4cAppointment, keepContactInfo, users, note, parties) => {

    let appointment = {};
    appointment["title"] = c4cAppointment.Subject;

    const startDate = new Date(c4cAppointment.Start_Date);
    const endDate = new Date(c4cAppointment.End_Date);
    appointment["start_date"] = startDate.toISOString();
    appointment["end_date"] = endDate.valueOf() > startDate.valueOf() ? endDate.toISOString() : (new Date(startDate.valueOf() + 1)).toISOString();

    if (appointment.Location) {
        appointment["location"] = c4cAppointment.Location;
    }
    appointment["contact_id"] = keepContactInfo.keapId

    const user = users.find(u => u.c4c_id === parseInt(c4cAppointment.Owner_ID))?.keap_id ?? 53951;
    appointment["user"] = user
    if (note?.Text) {
        appointment["description"] = note.Text + '\r\n';
    }
    else {
        appointment["description"] = '\r\n';
    }
    appointment["remind_time"] = 1440;

    
    const organizer = parties.find(p => p.Role_Category_Code_Text === 'Organizer Party')
    if(!!organizer) {
        const organizerDescription = ` \r\n organizer: [${organizer.Name} - ${organizer.EMail}]`
        appointment["description"] = appointment['description'] + organizerDescription
    }
    const attendee = parties.find(p => p.Role_Category_Code_Text === 'Attendee Party')
    if(!!attendee) {
        const attendeeDescription = ` \r\n attendee: [${attendee.Name} - ${attendee.EMail}]`
        appointment["description"] = appointment['description'] + attendeeDescription
    }
    const activityParty = parties.find(p => p.Role_Category_Code_Text === 'Activity Party')
    if(!!activityParty) {
        const activityPartyDescription = ` \r\n lead_attendee: [${activityParty.Name} - ${activityParty.EMail}]`
        appointment["description"] = appointment['description'] + activityPartyDescription
    }
    const contact = parties.find(p => p.Role_Category_Code_Text === 'Contact Party')
    if(!!contact) {
        const contactDescription = ` \r\n contact: [${contact.Name} - ${contact.EMail}]`
        appointment["description"] = appointment['description'] + contactDescription
    }
    const employee = parties.find(p => p.Role_Category_Code_Text === 'Employee Responsible Party')
    if(!!employee) {
        const employeeDescription = ` \r\n employee: [${employee.Name} - ${employee.EMail}]`
        appointment["description"] = appointment['description'] + employeeDescription
    }

    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(appointment)).digest('hex');
    const mapDescription = `\r\n\r\n - [id:${c4cAppointment.ObjectID}, hash:${hash}]`
    appointment['description'] = appointment['description'] + mapDescription;
    return appointment;
}

const buildKeapAppointementFromPhoneCall = (c4cPhoneCall, keepContactInfo, users, note, parties) => {

    let appointment = {};
    appointment["title"] = c4cPhoneCall.Subject;

    const startDate = new Date(c4cPhoneCall.Start_DateTime);
    const endDate = new Date(c4cPhoneCall.End_Date_Time);
    appointment["start_date"] = startDate.toISOString();
    appointment["end_date"] = endDate.valueOf() > startDate.valueOf() ? endDate.toISOString() : (new Date(startDate.valueOf() + 1)).toISOString();

    appointment["location"] = 'Telephone Call';
    appointment["contact_id"] = keepContactInfo.keapId

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
    const c4cAppointments = await utils.readCsvFile('db_migration/appointments.csv');
    const users = await utils.loadJson('users');

    const keapContactsRes = await apiManager.retrieveKeapContacts();
    const keapContacts = keapContactsRes.contacts;
    apiErrors = [...apiErrors, ...keapContactsRes.apiErrors];
    const keepContactsInfo = utils.buildContactsInfo(keapContacts, konst.contactCustomFieldsMap);
    console.log('\r\n');

    const keapAppointmentsRes = await apiManager.retrieveKeapAppointments(konst.TASK_DESCRIPTION_REGEX);
    const keapAppointments = keapAppointmentsRes.appointments;
    apiErrors = [...apiErrors, ...keapAppointmentsRes.apiErrors];
    keapAppointments.sort((a, b) => a.lastUpdate.valueOf() - b.lastUpdate.valueOf());
    const keapAppointmentsInfo = utils.buildAppointmentsInfo(keapAppointments);
    console.log('\r\n');

    const notesSplitRegex = /[\n|\r|\r\n](?=(?:[\d|\D]{32},){3})/

    if(apiErrors.length === 0){
        let appointmentsNotes = {};
        const appointmentsNotesRaw = await utils.readCsvFile('db_migration/appointmentnotes.csv', notesSplitRegex);
        appointmentsNotesRaw.map(n => {
            appointmentsNotes[n.Appointment_ID] = n;
        })

        const appointmentsPartiesRaw = await utils.readCsvFile('db_migration/appointmentinvolvedparties.csv');
        const appointmentsParties = _.groupBy(appointmentsPartiesRaw, 'Appointment_ID')

        const validC4cAppointments = c4cAppointments.filter(a => checkValid(a, keepContactsInfo, users));

        let appointmentsToInsert = validC4cAppointments.filter(a => !keapAppointmentsInfo[a.ObjectID]);
        appointmentsToInsert = appointmentsToInsert.map(a => buildKeapAppointement(a, keepContactsInfo[a.Main_Contact_ID], users,  appointmentsNotes[a.ID], appointmentsParties[a.ID]));

        let appointmentsToUpdate = validC4cAppointments.filter(a => keapAppointmentsInfo[a.ObjectID]);
        appointmentsToUpdate = appointmentsToUpdate.map(a => buildKeapAppointement(a, keepContactsInfo[a.Main_Contact_ID], users,  appointmentsNotes[a.ID], appointmentsParties[a.ID]));

        // dev only --START--
        // appointmentsToInsert = appointmentsToInsert.slice(0,10);
        // appointmentsToUpdate = appointmentsToUpdate.slice(0,10);
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

    let status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `appointmentsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_appointments_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `appointmentsScriptResults_${(new Date()).valueOf()}`, 'results');

    apiErrors = [];
    rejectedData = [];
    scriptResults = [];

    const c4cPhoneCalls = await utils.readCsvFile('db_migration/phonecalls.csv');
    if(apiErrors.length === 0){            
        const validC4CPhonecalls = c4cPhoneCalls.filter(c => checkValid(c, keepContactsInfo, users));
        
        let phoneCallsToInsert = validC4CPhonecalls.filter(c => !keapAppointmentsInfo[c.ObjectID]);
        let phoneCallsToUpdate = validC4CPhonecalls.filter(c => keapAppointmentsInfo[c.ObjectID]);

        let phoneCallNotes = {};
        const phoneCallNotesRaw = await utils.readCsvFile('db_migration/phonecallnotes.csv', notesSplitRegex);
        phoneCallNotesRaw.map(n => {
            phoneCallNotes[n.Phone_Call_ID] = n;
        })

        const phoneCallPartiesRaw = await utils.readCsvFile('db_migration/phonecallparticipants.csv');
        const phoneCallParties = _.groupBy(phoneCallPartiesRaw, 'Phone_Call_ID')

        phoneCallsToInsert = phoneCallsToInsert.map(c => buildKeapAppointementFromPhoneCall(c, keepContactsInfo[c.Main_Contact_ID], users, phoneCallNotes[c.ID], phoneCallParties[c.ID]));
        phoneCallsToUpdate = phoneCallsToUpdate.map(c => buildKeapAppointementFromPhoneCall(c, keepContactsInfo[c.Main_Contact_ID], users, phoneCallNotes[c.ID], phoneCallParties[c.ID]));

        // dev only --START--
        // phoneCallsToInsert = phoneCallsToInsert.slice(0,10);
        // phoneCallsToUpdate = phoneCallsToUpdate.slice(0,10);
        // dev only --END--

        const insertRequests = phoneCallsToInsert.map(a => apiManager.buildInsertAppointmentRequest(a, scriptResults, apiErrors));
        const insertChunks = _.chunk(insertRequests, konst.API_PARALLEL_CALLS);
        for(const r of insertChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
        
        const updateRequests = phoneCallsToUpdate.map(a => apiManager.buildUpdateAppointmentRequest(a, keapAppointmentsInfo, scriptResults, apiErrors));
        const updateChunks = _.chunk(updateRequests, konst.API_PARALLEL_CALLS);
        for(const r of updateChunks){
            const promises = r.map(fn => fn());
            await Promise.all(promises);
        }
    }
    console.log('\r\n');

    status = status && apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `phoneCallsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    if(rejectedData.length > 0){
        utils.saveCsv(rejectedData, `rejected_phoneCalls_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `phoneCallsScriptResults_${(new Date()).valueOf()}`, 'results');
   

    return status;
}