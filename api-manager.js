const axios = require('axios');
const utils = require('./utils');
const konst = require('./scripts/constants');
const { XMLParser } = require('fast-xml-parser/src/fxp');
const { matches } = require('lodash');


const retrieveKeapCompanies = async () => {
    let apiErrors = [];
    let keapCompanies = [];
    const companiesChunkSize = 1000;
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/companies?access_token=${process.env.KEAP_ACCESS_TOKEN}&optional_properties=custom_fields&limit=${companiesChunkSize}&offset=${companiesChunkSize*iterations}`;
            const res = await axios.get(url);
            keapCompanies = [...keapCompanies, ...res.data.companies];
            console.log(`getCompanies iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedCompanies: ${res.data.companies.length}`);
            iterations++;
            all = res.data.companies.length < companiesChunkSize;
        }
    }
    catch(err){
        console.error(err);
        errore = {
            message: err.message,
            stack: err.stack,
            type: 'get companies error'
        };
        apiErrors.push(errore);
    }

    return {
        companies: keapCompanies,
        apiErrors: apiErrors
    }
}

const retrieveKeapContacts = async () => {
    let apiErrors = [];
    let keapContacts = [];
    const contactsChunkSize = 1000;
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/contacts?access_token=${process.env.KEAP_ACCESS_TOKEN}&optional_properties=custom_fields&limit=${contactsChunkSize}&offset=${contactsChunkSize*iterations}`;
            const res = await axios.get(url);
            keapContacts = [...keapContacts, ...res.data.contacts];
            console.log(`getContacts iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedContacts: ${res.data.contacts.length}`);
            iterations++;
            all = res.data.contacts.length < contactsChunkSize;
        }
    }
    catch(err){
        console.error(err);
        errore = {
            message: err.message,
            stack: err.stack,
            type: 'get contacts error'
        };
        apiErrors.push(errore);
    }

    return {
        contacts: keapContacts,
        apiErrors: apiErrors
    }
}

const retrieveKeapTasks = async (users) => {
    let apiErrors = [];
    let keapTasks = [];

    for (u of users) {
        const tasksChunkSize = 1000;
        try{
            let iterations = 0;
            let all = false;
            while (!all) {
                const url = `${process.env.KEAP_API_URL}/tasks?user_id=${u.keap_id}&access_token=${process.env.KEAP_ACCESS_TOKEN}&limit=${tasksChunkSize}&offset=${tasksChunkSize*iterations}`;
                const res = await axios.get(url);
                keapTasks = [...keapTasks, ...res.data.tasks];
                console.log(`getTasks for user ${u.given_name} ${u.family_name} iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedTasks: ${res.data.tasks.length}`);
                iterations++;
                all = res.data.tasks.length < tasksChunkSize;
            }
        }
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: `get tasks error for user ${u.given_name} ${u.family_name}`
            };
            apiErrors.push(errore);
        }
    }

    return {
        tasks: keapTasks,
        apiErrors: apiErrors
    }
}

const retrieveKeapOpportunities = async () => {
    let apiErrors = [];
    let keapOpportunities = [];
    const opportunitiesChunkSize = 1000;
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/opportunities?access_token=${process.env.KEAP_ACCESS_TOKEN}&optional_properties=custom_fields&limit=${opportunitiesChunkSize}&offset=${opportunitiesChunkSize*iterations}`;
            const res = await axios.get(url);
            keapOpportunities = [...keapOpportunities, ...res.data.opportunities];
            console.log(`getOpportunities iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedContacts: ${res.data.opportunities.length}`);
            iterations++;
            all = res.data.opportunities.length < opportunitiesChunkSize;
        }
    }
    catch(err){
        console.error(err);
        errore = {
            message: err.message,
            stack: err.stack,
            type: 'get opportunities error'
        };
        apiErrors.push(errore);
    }

    return {
        opportunities: keapOpportunities,
        apiErrors: apiErrors
    }
}

/**
 * @param {RegExp} descriptionRegex
 */
const retrieveKeapAppointments = async (descriptionRegex) => {
    let apiErrors = [];
    let keapAppointments = [];
    const appointmentsChunkSize = 1000;
    const xmlParser = new XMLParser();
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const getAppointmentsRequestFormat = utils.readFile('xml_requests', 'get_appointments.xml');
            const getAppointmentsRequest = getAppointmentsRequestFormat.replace('$$$___API_KEY___$$$', `${process.env.KEAP_API_KEY}`).replace('$$$___PAGE_SIZE___$$$', `${appointmentsChunkSize}`).replace('$$$___PAGE___$$$', `${iterations}`);
            const getAppointmentsConfig = {
                method: 'post',
                url: `${process.env.KEAP_API_URL_XMLRPC}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                  'Content-Type': 'application/xml'
                },
                data : getAppointmentsRequest
            }
            const res = await axios(getAppointmentsConfig);
            const xmlAppointments = xmlParser.parse(res.data).methodResponse.params.param.value.array.data.value;
            const appointmentsFromXml = xmlAppointments.map(a => {
                const propreties = a.struct.member;
                const temp = {};
                propreties.map(p => {
                    temp[p.name] = p.value
                })
                if(descriptionRegex.test(temp.CreationNotes)) {
                    const mathces = descriptionRegex.exec(temp.CreationNotes);
                    temp.sapId = mathces[2];
                    temp.hash = mathces[3];
                }
                const lastUpdateString = `${temp.LastUpdated?.['dateTime.iso8601'].substring(0,4)}-${temp.LastUpdated?.['dateTime.iso8601'].substring(4,6)}-${temp.LastUpdated?.['dateTime.iso8601'].substring(6,8)}${temp.LastUpdated?.['dateTime.iso8601'].substring(8,17)}${'.000Z'}`;
                const appointment = {
                    id: temp.Id.i4,
                    ownerId: temp.UserID.i4,
                    contactId: temp.ContactId.i4,
                    title: temp.ActionDescription,
                    description: temp.CreationNotes,
                    sapId: temp.sapId,
                    hash: temp.hash,
                    lastUpdate: new Date(lastUpdateString || 0)
                }
                return appointment;
            })
            keapAppointments = [...keapAppointments, ...appointmentsFromXml];

            console.log(`getAppointments iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedAppointments: ${xmlAppointments.length}`);
            iterations++;
            all = xmlAppointments.length < appointmentsChunkSize;
        }
    }
    catch(err){
        console.error(err);
        errore = {
            message: err.message,
            stack: err.stack,
            type: 'get appointments error'
        };
        apiErrors.push(errore);
    }

    return {
        appointments: keapAppointments,
        apiErrors: apiErrors
    }
}

const buildUpsertContactRequest = (c, keepContactsHash, withTags=false, tagsToApply, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const currentEmail = c.email_addresses.find(e => e.field === 'EMAIL1').email;
            const updatingHash = keepContactsHash[currentEmail];
            const currentHash = c.custom_fields.find(f => f.id === konst.contactCustomFieldsMap.hash).content;
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
                    action: 'upsert contact',
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

                const contactId = res.data.id;
                const accountId = c.custom_fields.find(f => f.id === konst.contactCustomFieldsMap.accountID);
                const contactTags = tagsToApply[accountId];
                if (withTags && contactTags) {
                    try{
                        const tagsData = JSON.stringify(contactTags);
                        const tagsConfig = {
                            method: 'post',
                            url: `${process.env.KEAP_API_URL}/contacts/${contactId}/tags?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            data : tagsData
                        }
                        const tagsRes = await axios(tagsConfig);
                        console.log(tagsRes);
                        scriptResults.push({
                            action: 'post tags',
                            data: c,
                            response: {
                                data: tagsRes.data,
                                request_protocol: tagsRes.request.protocol,
                                request_host: tagsRes.request.host,
                                request_path: tagsRes.request.path,
                                request_method: tagsRes.request.method,
                                response_status: tagsRes.status,
                                response_statusText: tagsRes.statusText
                            }
                        });
                    } catch(err){
                        console.error(err);
                        errore = {
                            message: err.message,
                            stack: err.stack,
                            type: 'post tags error',
                            data: contactTags
                        };
                        apiErrors.push(errore);
                    }
                }
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
}

const buildInsertTaskRequest = (t, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const data = JSON.stringify(t);
            const config = {
                method: 'post',
                url: `${process.env.KEAP_API_URL}/tasks?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data : data
            }
            const res = await axios(config);
            console.log(res);
            scriptResults.push({
                action: 'insert task',
                data: t,
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
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'insert task error',
                data: t
            };
            apiErrors.push(errore);
        }
    }
    return fn;
}

const buildUpdateTaskRequest = (t, keapTasksInfo, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const description = t.description;    
            const idAndHashRegex = konst.TASK_DESCRIPTION_REGEX;
        
            let id;
            let localHash;
            if (idAndHashRegex.test(description)) {
                const match = idAndHashRegex.exec(description);
                id = match[2];
                localHash = match[3];
            }
            if(id){
                const remoteTaskInfo = keapTasksInfo[id];
                if(localHash !== remoteTaskInfo.hash){
                    const data = JSON.stringify({...t, description: `${remoteTaskInfo.description}${t.description}`});
                    const config = {
                        method: 'patch',
                        url: `${process.env.KEAP_API_URL}/tasks/${id}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data : data
                    }
                    const res = await axios(config);
                    console.log(res);
                    scriptResults.push({
                        action: 'update task',
                        data: t,
                        response: {
                            data: res.data,
                            request_protocol: res.request.protocol,
                            request_host: res.request.host,
                            request_path: res.request.path,
                            request_method: res.request.method,
                            response_status: res.status,
                            response_statusText: res.statusText
                        }
                    })
                } else {                    
                    console.log(`task: ${t.title ?? ''} is already up to date`)
                }
            } else {
                const error = {name: 'no-task-id tentative update', message: `it was not possible to find id within the task description`}
                throw error;
            }
        }
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'update task error',
                data: t
            };
            apiErrors.push(errore);
        }
    }
    return fn;
    
}

const buildInsertOpportunityRequest = (o, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const data = JSON.stringify(o);
            const config = {
                method: 'post',
                url: `${process.env.KEAP_API_URL}/opportunities?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data : data
            }
            const res = await axios(config);
            console.log(res);
            scriptResults.push({
                action: 'insert opportunity',
                data: o,
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
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'insert opportunity error',
                data: o
            };
            apiErrors.push(errore);
        }
    }
    return fn;
}

const buildUpdateOpportunityRequest = (o, keapOpportunitiesInfo, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const objectId = o.custom_fields.find(f => f.id === konst.opportunitiesCustomFieldsMap.objectId).content;    
            const hash = o.custom_fields.find(f => f.id === konst.opportunitiesCustomFieldsMap.hash).content; 
        
            const remoteOpportunity = keapOpportunitiesInfo[objectId];
            const remoteHash = remoteOpportunity.custom_fields.find(f => f.id === konst.opportunitiesCustomFieldsMap.hash).content; 
            if(hash !== remoteHash){
                const data = JSON.stringify(o);
                const config = {
                    method: 'patch',
                    url: `${process.env.KEAP_API_URL}/opportunities/${remoteOpportunity.id}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data : data
                }
                const res = await axios(config);
                console.log(res);
                scriptResults.push({
                    action: 'update task',
                    data: o,
                    response: {
                        data: res.data,
                        request_protocol: res.request.protocol,
                        request_host: res.request.host,
                        request_path: res.request.path,
                        request_method: res.request.method,
                        response_status: res.status,
                        response_statusText: res.statusText
                    }
                })
            } else {                    
                console.log(`opportunity: ${o.opportunity_title ?? ''} is already up to date (${remoteOpportunity.id})`)
            }
        }
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'update task error',
                data: o
            };
            apiErrors.push(errore);
        }
    }
    return fn;
}

const buildInsertAppointmentRequest = (a, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const data = JSON.stringify(a);
            const config = {
                method: 'post',
                url: `${process.env.KEAP_API_URL}/appointments?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data : data
            }
            const res = await axios(config);
            console.log(res);
            scriptResults.push({
                action: 'insert appointment',
                data: a,
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
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'insert appointment error',
                data: a
            };
            apiErrors.push(errore);
        }
    }
    return fn;
}

const buildUpdateAppointmentRequest = (a, keapAppointmentsInfo, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const description = a.description;    
            const idAndHashRegex = konst.TASK_DESCRIPTION_REGEX;
        
            let sapId;
            let localHash;
            if (idAndHashRegex.test(description)) {
                const match = idAndHashRegex.exec(description);
                sapId = match[2];
                localHash = match[3];
            }
            if(sapId){
                const remoteAppointmentInfo = keapAppointmentsInfo[sapId];
                if(localHash !== remoteAppointmentInfo.hash){
                    const data = JSON.stringify(a);
                    const config = {
                        method: 'patch',
                        url: `${process.env.KEAP_API_URL}/appointments/${remoteAppointmentInfo.id}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data : data
                    }
                    const res = await axios(config);
                    console.log(res);
                    scriptResults.push({
                        action: 'update appointment',
                        data: a,
                        response: {
                            data: res.data,
                            request_protocol: res.request.protocol,
                            request_host: res.request.host,
                            request_path: res.request.path,
                            request_method: res.request.method,
                            response_status: res.status,
                            response_statusText: res.statusText
                        }
                    })
                } else {                    
                    console.log(`appointment: ${a.title ?? ''} is already up to date`)
                }
            } else {
                const error = {name: 'no-appointment-sapId tentative update', message: `it was not possible to find id within the appointment description`}
                throw error;
            }
        }
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'update appointment error',
                data: a
            };
            apiErrors.push(errore);
        }
    }
    return fn;    
}

const buildUpdateLeadOwnerRequest = (l, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const data = JSON.stringify({owner_id: l.owner_id});
            const config = {
                method: 'patch',
                url: `${process.env.KEAP_API_URL}/contacts/${l.contactId}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data : data
            }
            const res = await axios(config);
            console.log(res);
            scriptResults.push({
                action: 'update lead owner',
                data: l,
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
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'update lead owner error',
                data: l
            };
            apiErrors.push(errore);
        }
    }
    return fn;   
}

const buildDeleteAppointmentRequest = (a, scriptResults, apiErrors) => {
    const fn = async () => {
        try{
            const config = {
                method: 'delete',
                url: `${process.env.KEAP_API_URL}/appointments/${a.id}?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
            const res = await axios(config);
            console.log(res);
            scriptResults.push({
                action: 'delete appointments',
                data: a,
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
        catch(err){
            console.error(err);
            errore = {
                message: err.message,
                stack: err.stack,
                type: 'delete appointments error',
                data: a
            };
            apiErrors.push(errore);
        }
    }
    return fn;
}

module.exports.retrieveKeapCompanies = retrieveKeapCompanies;
module.exports.retrieveKeapContacts = retrieveKeapContacts;
module.exports.retrieveKeapTasks = retrieveKeapTasks;
module.exports.retrieveKeapOpportunities = retrieveKeapOpportunities;
module.exports.retrieveKeapAppointments = retrieveKeapAppointments;
module.exports.buildUpsertContactRequest = buildUpsertContactRequest;
module.exports.buildInsertTaskRequest = buildInsertTaskRequest;
module.exports.buildUpdateTaskRequest = buildUpdateTaskRequest;
module.exports.buildInsertOpportunityRequest = buildInsertOpportunityRequest;
module.exports.buildUpdateOpportunityRequest = buildUpdateOpportunityRequest;
module.exports.buildInsertAppointmentRequest = buildInsertAppointmentRequest;
module.exports.buildUpdateAppointmentRequest = buildUpdateAppointmentRequest;
module.exports.buildUpdateLeadOwnerRequest = buildUpdateLeadOwnerRequest;
module.exports.buildDeleteAppointmentRequest = buildDeleteAppointmentRequest;
