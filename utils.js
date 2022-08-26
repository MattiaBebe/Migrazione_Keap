const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const ROOT = process.cwd();

const readCsvFile = async (directory) => {
    const directoryPath = path.join(ROOT, directory);
    let data = {};
    data = fs.readFileSync(directoryPath, 'utf-8');
    const results = parseCSV(data);
    return results;   
}


const parseCSV = (data, separator = ',', textIndicator='"') => {
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

const saveJson = async (object, filename = `${(new Date()).valueOf()}`, directory = 'db_migration') => {
    const directoryPath = path.join(ROOT, directory);
    const filepath = path.join(ROOT, directory, filename);
    const jsonObject = JSON.stringify(object, null, 2)
    if(!fs.existsSync(directoryPath)){
        fs.mkdirSync(directoryPath, {recursive: true});
    }
    await fsp.writeFile(`${filepath}.json`, jsonObject);
}

const loadJson = async (filename = '', directory = 'db_migration') => {
    const filepath = path.join(ROOT, directory, filename);
    const file = await fsp.readFile(`${filepath}.json`, 'utf-8');
    const jsonContent = JSON.parse(file);
    return jsonContent;
}

module.exports.readCsvFile = readCsvFile;
module.exports.saveJson = saveJson;
module.exports.loadJson = loadJson;