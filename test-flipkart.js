const axios = require('axios');

const options = {
    method: 'GET',
    url: 'https://real-time-flipkart-data2.p.rapidapi.com/products-by-category',
    params: {
        page: '1',
        categoryId: 'tyy,4io', // Users example category
        sortBy: 'POPULARITY'
    },
    headers: {
        'x-rapidapi-key': '9dff16b8b9msh8ac99b0a31da267p1632aajsn5d0098930a2e',
        'x-rapidapi-host': 'real-time-flipkart-data2.p.rapidapi.com'
    }
};

async function fetchData() {
    try {
        console.log("Testing Flipkart API...");
        const response = await axios.request(options);
        console.log("Response Status:", response.status);
        console.log("Data:", JSON.stringify(response.data).substring(0, 200) + "...");
    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("API Response:", error.response.data);
        }
    }
}

fetchData();
