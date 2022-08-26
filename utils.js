const path = require('path');
const fs = require('fs');

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

module.exports.readCsvFile = readCsvFile;