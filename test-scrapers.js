const { flipkart, amazon } = require('./src/all-scrapers');

async function test() {
    console.log("=== Testing Scrapers ===");

    try {
        // Test Flipkart
        console.log("\n[Flipkart] Initializing...");
        const flipkartScraper = new flipkart();
        console.log("[Flipkart] Scraping 'iphone'...");
        const fResults = await flipkartScraper.scrape('iphone');
        console.log(`[Flipkart] Results: ${fResults.length}`);
        if (fResults.length > 0) console.log(fResults[0]);

        // Test Amazon
        console.log("\n[Amazon] Initializing...");
        const amazonScraper = new amazon();
        console.log("[Amazon] Scraping 'iphone'...");
        const aResults = await amazonScraper.scrape('iphone');
        console.log(`[Amazon] Results: ${aResults.length}`);
        if (aResults.length > 0) console.log(aResults[0]);

    } catch (e) {
        console.error("Test Error:", e);
    }
}

test();
