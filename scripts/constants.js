
const API_PARALLEL_CALLS = 20;
const CRYPTO_SECRET = 'SECRET';

const VALID_COMPANIES_ROLES = [
    'CRM000',
    'BUP002',
    'Z00010',
    'Z00100'
];

const VALID_COMPANIES_STATUSES = [
    2, 
    3
]

const TASK_DESCRIPTION_REGEX = /(.*)\s+-\s+\[id:(.*),\s+hash:(.*)\]/;

const contactCustomFieldsMap = {
    contactID: 17,
    accountID: 19,
    businessRole: 25,
    c4cMigration: 70,
    hash: 68
};

const companyCustomFiledsMap = {
    industry: 48,
    abcClass: 50,
    userOwner: 64,
    sapId: 54,
    c4cId: 56,
    c4cMigrationEvent: 62,
    hash: 66
};

const opportunitiesCustomFieldsMap = {
    objectId: 86,
    hash: 88
}

const opportunityStageMap = {
    1: {stage_id:22, name:"New Opportunity", stage_order: 10},
    2: {stage_id:24, name:"Qualified Opportunity", stage_order: 20},
    3: {stage_id:34, name:"Sent Offer", stage_order: 25},
    4: {stage_id:26, name:"Won", stage_order: 30},
    5: {stage_id:28, name:"Lost", stage_order: 40}
}

module.exports.API_PARALLEL_CALLS = API_PARALLEL_CALLS;
module.exports.CRYPTO_SECRET = CRYPTO_SECRET;
module.exports.VALID_COMPANIES_ROLES = VALID_COMPANIES_ROLES;
module.exports.VALID_COMPANIES_STATUSES = VALID_COMPANIES_STATUSES;
module.exports.TASK_DESCRIPTION_REGEX = TASK_DESCRIPTION_REGEX;
module.exports.contactCustomFieldsMap = contactCustomFieldsMap;
module.exports.companyCustomFiledsMap = companyCustomFiledsMap;
module.exports.opportunitiesCustomFieldsMap = opportunitiesCustomFieldsMap;
module.exports.opportunityStageMap = opportunityStageMap;