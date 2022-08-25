const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');

const ROOT = process.cwd();

const readCsvFile = async (directory) => {
    const directoryPath = path.join(ROOT, directory);
    let data = {};
    let results = [];
    data = fs.createReadStream(directoryPath, 'utf-8')
    .pipe(csv({}))
    .on('data', (data) => results.push(data))
    .on('end', () => {
        return results;
    });   
}

module.exports.readCsvFile = readCsvFile;