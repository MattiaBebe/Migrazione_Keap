const axios = require('axios');
const konst = require('./scripts/constants');

const buildUpsertContactRequest = (c, keepContactsHash, withTags=false, scriptResults, apiErrors) => {
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

module.exports.buildUpsertContactRequest = buildUpsertContactRequest;