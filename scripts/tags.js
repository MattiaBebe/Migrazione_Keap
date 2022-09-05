const sisAccounts = [
    'Dealer (SIS)',
    'End user (SIS)'
];

const pneumaticsAccounts = [
    'Dealer  (Pneumatica)',
    'End User (Pneumatica)'    
];

module.exports = () => {
    (c4cContact, c4cAccountIds) => {
        let tags = [];
    
        const accountId = c4cAccountIds[c4cContact.Account_ID];
    
        if (pneumaticsAccounts.includes(accountId?.industry)){
            if(accountId?.country === 'ITA'){
                tags.push(269);
                tags.push(259);
            }
            else if(accountId?.country === 'DEU' || accountId?.country === 'AUT'){
                tags.push(271);
                tags.push(345);
            }
            else {
                tags.push(271);
                tags.push(261);
            }
        }
        else if (sisAccounts.includes(accountId?.industry)){
            tags.push(227);
    
            if(accountId?.country === 'ITA'){
                tags.push(259);
            }
            else {
                tags.push(261);
            }
        }
    
        return tags;
    }
}