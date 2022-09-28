//load enviroment variables
const dotenv = require('dotenv');
const upsertCompanies = require('./scripts/companies');
const upsertCompanyContacts = require('./scripts/company-contacts');
const upsertContacts = require('./scripts/contacts');
const upsertTasks = require('./scripts/tasks');
const upsertOpportunities = require('./scripts/opportunities');
const importAppointments = require('./scripts/appointements');
const importPhoneCalls = require('./scripts/phone_calls');
const updateLeadOwners = require('./scripts/lead_owners')

dotenv.config();

(async () => {
    // const companies_result = await upsertCompanies(); 
    // const companyContacts_result = await upsertCompanyContacts();
    // const contacts_result = await upsertContacts(); 
    // const tasks = await upsertTasks();
    // const opportunities = await upsertOpportunities();
    // const appointments = await importAppointments();
    // const phonecalls = await importPhoneCalls();
    const leadOwners = await updateLeadOwners();

    const result = 
        // companies_result && 
        // companyContacts_result &&
        // contacts_result &&
        // tasks &&
        // opportunities &&
        // appointments &&
        // phonecalls &&
        leadOwners

    if (result){
        console.log('completed succesfully');
    } else {
        console.log('completed with errors');
    }
})();


