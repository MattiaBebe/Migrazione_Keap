
const API_PARALLEL_CALLS = 20;
const CRYPTO_SECRET = 'SECRET'

const contactCustomFieldsMap = {
    contactID: 17,
    accountID: 19,
    businessRole: 25,
    c4cMigration: 70,
    hash: 68
}

const companyCustomFiledsMap = {
    industry: 48,
    abcClass: 50,
    userOwner: 64,
    sapId: 54,
    c4cId: 56,
    c4cMigrationEvent: 62,
    hash: 66
}

module.exports.API_PARALLEL_CALLS = API_PARALLEL_CALLS;
module.exports.CRYPTO_SECRET = CRYPTO_SECRET;
module.exports.contactCustomFieldsMap = contactCustomFieldsMap;
module.exports.companyCustomFiledsMap = companyCustomFiledsMap;