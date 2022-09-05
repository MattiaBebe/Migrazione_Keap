const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const axios = require('axios');

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
    const validationRegex = /(?:[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
    const valid = validationRegex.test(email);

    return valid
}

const validateUrl = (url) => {
    const validationRegex = /((https?|ftp|smtp):\/\/)(www\.)[a-z0-9]+\.[a-z]+(\/[a-zA-Z0-9#]+\/?)*$/;
    const valid = validationRegex.test(url);
    
    return valid
}

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

const buildAccountsInfo = (keapCompanies, customFiledsMap) => {
    const c4cAccountIds = {};
    keapCompanies.map(k => {
            const c4cId = k.custom_fields.find(f => f.id === customFiledsMap.c4cId).content;
            const industry = k.custom_fields.find(f => f.id === customFiledsMap.industry).content;
            if (c4cId) {
                c4cAccountIds[c4cId] = {
                    id: k.id, 
                    country: k.address.country_code,
                    industry: industry
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

const buildUpsertContactRequest = () => {

}

module.exports.readCsvFile = readCsvFile;
module.exports.saveCsv = saveCsv;
module.exports.saveJson = saveJson;
module.exports.loadJson = loadJson;

module.exports.validateEmail = validateEmail;
module.exports.validateUrl = validateUrl;

module.exports.retrieveKeapCompanies = retrieveKeapCompanies;
module.exports.retrieveKeapContacts = retrieveKeapContacts;

module.exports.buildAccountsInfo = buildAccountsInfo;
module.exports.buildContatsHash = buildContatsHash;
