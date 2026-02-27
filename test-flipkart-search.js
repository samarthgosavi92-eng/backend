const axios = require('axios');

const options = {
    method: 'GET',
    // Trying /product-search
    url: 'https://real-time-flipkart-data2.p.rapidapi.com/product-search',
    params: {
        q: 'iphone',
        page: '1',
        sort: 'popularity'
    },
    headers: {
        'x-rapidapi-key': '9dff16b8b9msh8ac99b0a31da267p1632aajsn5d0098930a2e',
        'x-rapidapi-host': 'real-time-flipkart-data2.p.rapidapi.com'
    }
};

async function testSearch() {
    try {
        console.log("Testing Search on 'real-time-flipkart-data2'...");
        const response = await axios.request(options);
        console.log("Response Status:", response.status);
        console.log("Data sample:", JSON.stringify(response.data).substring(0, 200));
    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("API Response Status:", error.response.status);
            console.error("API Response Data:", JSON.stringify(error.response.data));
        }
    }
}

testSearch();
