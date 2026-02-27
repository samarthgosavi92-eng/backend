// ========== FILE 2: backend/src/scraper-factory.js ==========
class ScraperFactory {
    static getStores(category) {
        // Explicit category mapping per your request:
        // Groceries: Real-time prices from jiomart, blinkit, amazon (fresh), flipkart (groceries)
        // Groceries redirect-only (no scraping): dmart, bigbasket, reliancesmart
        // E-commerce: amazon, flipkart
        // Fashion: meesho, myntra, amazon, flipkart
        // Food delivery: swiggy, zomato
        // Pharmacy: tata1mg, pharmeasy, netmeds, apollo, amazon, flipkart, jiomart, bigbasket
        const all = [
            'dmart',
            'bigbasket',
            'jiomart',
            'reliancesmart',
            'blinkit',
            'amazon',
            'flipkart',
            'meesho',
            'myntra',
            'zomato',
            'swiggy',
            'tata1mg',
            'pharmeasy',
            'netmeds',
            'apollo',
        ];
        // Groceries: Only scrape stores with real-time prices (exclude redirect-only stores)
        const grocery = ['jiomart', 'blinkit', 'amazon', 'flipkart'];
        const ecommerce = ['amazon', 'flipkart'];
        const fashion = ['meesho', 'myntra', 'amazon', 'flipkart'];
        const food = ['zomato', 'swiggy'];
        // Medicines / Pharmacy: original pharmacy stores + specified stores (amazon, flipkart, jiomart, bigbasket)
        // NOT using all grocery stores - only the ones specified
        const pharmacy = ['tata1mg', 'pharmeasy', 'netmeds', 'apollo', 'amazon', 'flipkart', 'jiomart', 'bigbasket'];

        if (!category || category === 'all') return all;
        if (category === 'grocery') return grocery;
        if (category === 'ecommerce') return ecommerce;
        if (category === 'fashion') return fashion;
        if (category === 'food') return food;
        if (category === 'pharmacy' || category === 'mediscan') return pharmacy;
        return all;
    }

    static createScraper(storeId) {
        const scrapers = require('./all-scrapers');
        const ScraperClass = scrapers[storeId];
        if (!ScraperClass) {
            throw new Error(`Unknown store: ${storeId}`);
        }
        return new ScraperClass();
    }

    // Helper to get display name for a storeId
    static getStoreName(storeId) {
        const names = {
            'tata1mg': 'Tata 1mg',
            'pharmeasy': 'PharmEasy',
            'netmeds': 'Netmeds',
            'apollo': 'Apollo Pharmacy',
            'flipkart': 'Flipkart',
            'amazon': 'Amazon',
            'jiomart': 'JioMart',
            'bigbasket': 'BigBasket',
            'meesho': 'Meesho',
            'myntra': 'Myntra',
            'dmart': 'DMart',
            'blinkit': 'Blinkit',
            'reliancesmart': 'Reliance Smart',
            'zomato': 'Zomato',
            'swiggy': 'Swiggy',
        };
        return names[storeId] || storeId;
    }

    // Helper to get domain for a storeId
    static getStoreDomain(storeId) {
        const domains = {
            'tata1mg': '1mg.com',
            'pharmeasy': 'pharmeasy.in',
            'netmeds': 'netmeds.com',
            'apollo': 'apollopharmacy.in',
            'flipkart': 'flipkart.com',
            'amazon': 'amazon.in',
            'jiomart': 'jiomart.com',
            'bigbasket': 'bigbasket.com',
            'meesho': 'meesho.com',
            'myntra': 'myntra.com',
            'dmart': 'dmartready.com',
            'blinkit': 'blinkit.com',
            'reliancesmart': 'reliancesmart.in',
            'zomato': 'zomato.com',
            'swiggy': 'swiggy.com',
        };
        return domains[storeId] || `${storeId}.com`;
    }
}

module.exports = ScraperFactory;

