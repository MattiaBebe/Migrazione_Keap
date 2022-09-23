const utils = require('../utils');
const apiManager = require('../api-manager');
const konst = require('./constants');
const crypto = require('crypto');
const _ = require('lodash');

let apiErrors = [];
let rejectedData = [];
let scriptResults = [];

const buildKeapAppointement = (c4cAppointment, keepContactsInfo, users, notes, parties) => {

    let appointment = {};
    appointment["title"] = c4cAppointment.Subject;
    appointment["start_date"] = c4cAppointment.Start_Date;
    appointment["end_date"] = c4cAppointment.End_Date;

    if (appointment.Location) {
        appointment["location"] = c4cAppointment.Location;
    }
    appointment["contact_id"] = keepContactsInfo[c4cAppointment.Main_Contact_ID].keapId

    const user = users.find(u => u.c4c_id === c4cAppointment.Owner_ID).keap_id
    appointment["user"] = user
    if (notes.Text) {
        appointment["description"] = "string";
    }
    appointment["remind_time"] = 1440;
    
    const hash = crypto.createHash('sha256', konst.CRYPTO_SECRET).update(JSON.stringify(task)).digest('hex');
    const mapDescription = ` - [id:${c4cTask.ObjectID}, hash:${hash}]`
    appointment['description'] = appointment['description'] + mapDescription;
    return appointment;
}

const checkValid = (appointment, keepContactsInfo, users) => {
    const validContact = !!keepContactsInfo[appointment.Main_Contact_ID];
    if (!validContact) {
        rejectedData.push({...appointment, _error: `invalid contact: ${appointment.Main_Contact_ID} - ${appointment.Primary_Contact} did not returned a c4c mapped contact on keap`});
    }

    const validAssignee = users.map(u => u.c4c_id).filter(u => u).includes(parseInt(appointment.Owner_ID));
    if (!validAssignee) {
        rejectedData.push({...appointment, _error: `invalid assignee: ${appointment.Owner_ID} - ${appointment.Owner_Party_Name}`});
    }

    return validContact && validAssignee;
}

module.exports = async () => {
    const c4cAppointments = await utils.readCsvFile('db_migration/appointments.csv');
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
        
        let appointmentsToInsert = validC4cTasks.filter(t => !keapAppointmentsInfo[t.ObjectID]);
        let appointmentsToUpdate = validC4cTasks.filter(t => keapAppointmentsInfo[t.ObjectID]);

        let appointmentsNotes = {};
        const appointmentsNotesRaw = await utils.readCsvFile('db_migration/appointmentnotes.csv');
        appointmentsNotesRaw.map(n => {
            appointmentsNotes[n.Appointment_ID] = n;
        })

        let appointmentsParties = {};
        const appointmentsPartiesRaw = await utils.readCsvFile('db_migration/appointmentinvolvedparties.csv');
        appointmentsPartiesRaw.map(p => {
            appointmentsParties[p.Appointment_ID] = p;
        })

        tasksToInsert = tasksToInsert.map(a => buildKeapAppointement(a, keepContactsInfo, users, appointmentsNotes[a.ID], appointmentsParties[a.ID]));
        tasksToUpdate = tasksToUpdate.map(a => buildKeapAppointement(a, keepContactsInfo, users, appointmentsNotes[a.ID], appointmentsParties[a.ID]));

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