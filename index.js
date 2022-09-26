//load enviroment variables
const dotenv = require('dotenv');
const importCompanies = require('./scripts/companies');
const importContacts = require('./scripts/contacts');
const importCompanyContacts = require('./scripts/company-contacts');
const importTasks = require('./scripts/tasks');
const importOpportunities = require('./scripts/opportunities');
const importAppointments = require('./scripts/appointements')

dotenv.config();

(async () => {
    // const companies_result = await importCompanies(); 
    // const companyContacts_result = await importCompanyContacts();
    // const contacts_result = await importContacts(); 
    // const tasks = await importTasks();
    // const opportunities = await importOpportunities();
    const appointments = await importAppointments();

    const result = 
        // companies_result && 
        // companyContacts_result &&
        // contacts_result &&
        // tasks &&
        // opportunities &&
        appointments

    if (result){
        console.log('completed succesfully');
    } else {
        console.log('completed with errors');
    }
})();


