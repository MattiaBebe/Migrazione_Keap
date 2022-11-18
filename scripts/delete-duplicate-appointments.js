const apiManager = require('../api-manager');
const utils = require('../utils');
const _ = require('lodash');
const konst = require('./constants');
const { concat } = require('lodash');


module.exports = async () => {
    let scriptResults = [];
    let apiErrors = [];
    const keapAppointmentsRes = await apiManager.retrieveKeapAppointments(konst.TASK_DESCRIPTION_REGEX);
    const keapAppointments = keapAppointmentsRes.appointments;
    apiErrors = [...apiErrors, ...keapAppointmentsRes.apiErrors];

    const groupedAppointments = _.groupBy(keapAppointments, 'sapId');
    
    let appointmentsToDelete = Object.keys(groupedAppointments).map(k => {
        if(k && k !== 'undefined') {
            let duplicates = groupedAppointments[k];
            duplicates.sort((a, b) => b.lastUpdate.valueOf() - a.lastUpdate.valueOf());
            duplicates.shift();
            return duplicates;
        }
        else {
            return [];
        }
    });

    appointmentsToDelete = [].concat(...appointmentsToDelete);

    // dev only --START--
    // appointmentsToDelete = deleteRequests.slice(0,10);
    // dev only --END--

    const deleteRequests = appointmentsToDelete.map(a => apiManager.buildDeleteAppointmentRequest(a, scriptResults, apiErrors));

    const deleteChunks = _.chunk(deleteRequests, konst.API_PARALLEL_CALLS);
    for(const r of deleteChunks){
        const promises = r.map(fn => fn());
        await Promise.all(promises);
    }

    const status = apiErrors.length === 0;
    
    if(!status){
        utils.saveJson(apiErrors, `deleteAppointmentsScriptErrors_${(new Date()).valueOf()}`, 'results');
    }

    utils.saveJson(scriptResults, `deleteAppointmentsScriptResults_${(new Date()).valueOf()}`, 'results');

    return status
}