const axios = require('axios');
const konst = require('./scripts/constants');


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

const retrieveKeapTasks = async () => {
    let apiErrors = [];
    let keapTasks = [];
    const tasksChunkSize = 1000;
    try{
        let iterations = 0;
        let all = false;
        while (!all) {
            const url = `${process.env.KEAP_API_URL}/tasks?access_token=${process.env.KEAP_ACCESS_TOKEN}&limit=${tasksChunkSize}&offset=${tasksChunkSize*iterations}`;
            const res = await axios.get(url);
            keapTasks = [...keapTasks, ...res.data.tasks];
            console.log(`getTasks iterations: ${iterations}, status: ${res.status} - ${res.statusText}, returnedTasks: ${res.data.tasks.length}`);
            iterations++;
            all = res.data.tasks.length < tasksChunkSize;
        }
    }
    catch(err){
        console.error(err);
        errore = {
            message: err.message,
            stack: err.stack,
            type: 'get tasks error'
        };
        apiErrors.push(errore);
    }

    return {
        tasks: keapTasks,
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
            const idAndHashRegex = /(.*)\s+-\s+\[id:(.*), \s+hash:(.*)\]/;
        
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
                        url: `${process.env.KEAP_API_URL}/tasks/id?access_token=${process.env.KEAP_ACCESS_TOKEN}`,
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

module.exports.retrieveKeapCompanies = retrieveKeapCompanies;
module.exports.retrieveKeapContacts = retrieveKeapContacts;
module.exports.retrieveKeapTasks = retrieveKeapTasks;
module.exports.buildUpsertContactRequest = buildUpsertContactRequest;
module.exports.buildInsertTaskRequest = buildInsertTaskRequest;
module.exports.buildUpdateTaskRequest = buildUpdateTaskRequest;
