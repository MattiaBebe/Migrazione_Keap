const axios = require('axios');

const requestToken = async () => {
   const res = await axios.request({
        url: '/token',
        method: 'post',
        baseURL: process.env.TOKEN_BASE_URL,
        header:{
            'content-type': 'application/x-www-form-urlencoded'
        },
        auth: {
            username: process.env.AUTH_CLIENT_ID,
            password: process.env.AUTH_CLIENT_SECRET
        },
        data: qs.stringify({
            'code': code,
            'grant_type': auth_grant_type,
            'scope': auth_scope,
            // 'redirect_uri': `${req.protocol}://${req.hostname}:${__app_port}${req.baseUrl}/${call}`
            'redirect_uri': `https://${req.hostname}${req.baseUrl}/${call}`
        })
    })
    // .then(function(response) {
    //     let token = response.data.access_token;
    //     //let token_type = response.data.token_type;
    //     let refresh_token = response.data.refresh_token;
    //     let handleRoute = `/api/keap/${call}/${token}/${refresh_token}`;   
    //     res.redirect(handleRoute);
    // })
    // .catch(error => {
    //     console.log(error);
    // })
}