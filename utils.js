const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const konst = require('./scripts/constants');

const ROOT = process.cwd();

const readCsvFile = async (directory) => {
    const directoryPath = path.join(ROOT, directory);
    let data = {};
    data = fs.readFileSync(directoryPath, 'utf-8');
    const results = parseCSV(data);
    return results;   
}

const saveCsv = async (objects=[], filename=`${(new Date()).valueOf()}`, directory='results') => {
    const directoryPath = path.join(ROOT, directory);
    const filepath = path.join(ROOT, directory, filename);
    if (objects.length > 0) {
        const headers = Object.keys(objects.shift()).map(h => h.replace(/,/g, ' ').replace(/s+/g, ' ')).join(',');
        const data = objects.map(d => {
            let info = Object.values(d);
            info = info.map(i => {
                if (i && i.includes(',')){
                    return `"${i}"`;
                } else {
                    return i;
                }
            })
            return info.join(',');
        });

        const file = [headers, ...data].join('\r\n');
        if(!fs.existsSync(directoryPath)){
            fs.mkdirSync(directoryPath, {recursive: true});
        }

        await fsp.writeFile(`${filepath}.csv`, file);
    } else {
        console.warn(`tentatative to save 0-length array into csv aborted: ${filename}`);
    }
}

const parseCSV = (data, separator=',', textIndicator='"') => {
    data = data.split(/\r\n|\r|\n/);
    const headers = data.shift().split(separator);
    data = data.map(r => {
        if (r) {
            const separatorRegex = new RegExp(`${textIndicator}([^${textIndicator}]*)${textIndicator},|([^${separator}]*)(?:${separator}|$)`, 'g');
            let d = [...r.matchAll(separatorRegex)];
            d = [...d.map((_,i) => d[i][1] || d[i][2])];
            const objKVList = headers.map((h, i) => {
                try{
                    return {
                        key: h,
                        value: d[i]
                    };
                } catch(ex) {
                    console.error(ex);
                    console.error(`issue with: ${r}`);
                    throw(ex);
                }
            });
        let obj = {};
        objKVList.forEach(kv => {
            obj[kv.key] = kv.value ? kv.value : null
        });
        return obj;
    }}).filter(r => r);

    return data;
}

const saveJson = async (object, filename=`${(new Date()).valueOf()}`, directory = 'db_migration') => {
    const directoryPath = path.join(ROOT, directory);
    const filepath = path.join(ROOT, directory, filename);
    const jsonObject = JSON.stringify(object, null, 2);
    if(!fs.existsSync(directoryPath)){
        fs.mkdirSync(directoryPath, {recursive: true});
    }
    await fsp.writeFile(`${filepath}.json`, jsonObject);
}

const loadJson = async (filename='', directory='db_migration') => {
    const filepath = path.join(ROOT, directory, filename);
    const file = await fsp.readFile(`${filepath}.json`, 'utf-8');
    const jsonContent = JSON.parse(file);
    return jsonContent;
}

const validateEmail = (email) => {
    const validationRegex = /^(?:[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-zA-Z0-9-]*[a-zA-Z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
    const valid = validationRegex.test(email);

    return valid
}

const validateUrl = (url) => {
    const validationRegex = /((https?|ftp|smtp):\/\/)(www\.)[a-z0-9]+\.[a-z]+(\/[a-zA-Z0-9#]+\/?)*$/;
    const valid = validationRegex.test(url);
    
    return valid
}

const buildAccountsInfo = (keapCompanies, customFiledsMap) => {
    const c4cAccountIds = {};
    keapCompanies.map(k => {
            const c4cId = k.custom_fields.find(f => f.id === customFiledsMap.c4cId).content;
            const industry = k.custom_fields.find(f => f.id === customFiledsMap.industry).content;
            const owner = k.custom_fields.find(f => f.id === customFiledsMap.userOwner).content;
            if (c4cId) {
                c4cAccountIds[c4cId] = {
                    id: k.id, 
                    country: k.address.country_code,
                    industry: industry,
                    primary_mail: k.email_address,
                    owner: owner,
                    name: k.company_name
                };
            }
    })

    return c4cAccountIds;
}

const buildContatsHash = (keapContacts, customFieldsMap) => {
    const keepContactsHash = {};
    keapContacts.map(k => {
            const hash = k.custom_fields.find(f => f.id === customFieldsMap.hash).content;
            if (hash) {
                const email = k.email_addresses.find(e => e.field === 'EMAIL1').email;
                keepContactsHash[email] = hash;
            }
    })

    return keepContactsHash;
}

const buildContactsInfo = (keapContacts, customFieldsMap) => {
    const keepContactsInfo = {};
    keapContacts.map(k => {
        const contactId = k.custom_fields.find(f => f.id === customFieldsMap.contactID)?.content;
        if(contactId) {
            const email = k.email_addresses.find(e => e.field === 'EMAIL1')?.email;
            const phone = k.phone_numbers.find(n => n.field === 'PHONE1')?.number;
            const jobTitle = k.custom_fields.find(f => f.id === customFieldsMap.businessRole).content
            if (email){
                keepContactsInfo[contactId] = {
                    email: email, 
                    keapId: k.id,
                    firstName: k.given_name,
                    lastName: k.family_name,
                    phone: phone,
                    jobTitle: jobTitle
                };
            }
        }
    })
    return keepContactsInfo;
}

const buildContactsEmails = (keapContacts, customFieldsMap) => {
    const keepContactsEmail = {};
    keapContacts.map(k => {
        const contactId = k.custom_fields.find(f => f.id === customFieldsMap.contactID)?.content;
        const email = k.email_addresses.find(e => e.field === 'EMAIL1')?.email;
        const owner = k.owner_id;
        if(email) {
            keepContactsEmail[email] = {keapId: k.id, c4cId: contactId}
        };
    })
    return keepContactsEmail;
}

const buildTasksInfo = (keapTasks) => {
    const keepTasksInfo = {};
    keapTasks.map(k => {
            const description = k.description;
            const idAndHashRegex = konst.TASK_DESCRIPTION_REGEX;
            if (idAndHashRegex.  test(description)) {
                const match = idAndHashRegex.exec(description);
                const text = match[1];
                const id = match[2];
                const hash = match[3];
                keepTasksInfo[id] = {
                    keapid: k.id,
                    hash: hash,
                    description: text
                };
            }
    })
    return keepTasksInfo;
}

const buildOpportunityInfo = (opportunities, customFieldsMap) => {
    const opportunitiesInfo = {};
    opportunities.map( o => {
        const objectId = o.custom_fields.find(f => f.id === customFieldsMap.objectId).content;
        if (objectId) {
            opportunitiesInfo[objectId] = o
        }
    })
    return opportunitiesInfo;
}

const buildAppointmentsInfo = (keapAppointments) => {
    const keepAppointmentsInfo = {};
    keapAppointments.map(k => {
            const description = k.description;
            const idAndHashRegex = konst.TASK_DESCRIPTION_REGEX;
            if (idAndHashRegex.  test(description)) {
                const match = idAndHashRegex.exec(description);
                const text = match[1];
                const id = match[2];
                const hash = match[3];
                keepAppointmentsInfo[id] = {
                    keapid: k.id,
                    hash: hash,
                    description: text
                };
            }
    })
    return keepAppointmentsInfo;
}

module.exports.readCsvFile = readCsvFile;
module.exports.saveCsv = saveCsv;
module.exports.saveJson = saveJson;
module.exports.loadJson = loadJson;

module.exports.validateEmail = validateEmail;
module.exports.validateUrl = validateUrl;

module.exports.buildAccountsInfo = buildAccountsInfo;
module.exports.buildContatsHash = buildContatsHash;
module.exports.buildContactsInfo = buildContactsInfo;
module.exports.buildContactsEmails = buildContactsEmails;
module.exports.buildTasksInfo = buildTasksInfo;
module.exports.buildOpportunityInfo = buildOpportunityInfo;
module.exports.buildAppointmentsInfo = buildAppointmentsInfo;
