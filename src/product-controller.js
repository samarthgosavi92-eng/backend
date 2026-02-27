// ========== FILE 3: backend/src/product-controller.js ==========
const ScraperFactory = require('./scraper-factory');
const { scrapeMedicinePrices } = require('../services/medicine-scraper');

async function searchProducts(req, res) {
    try {
        const { q, category, gender } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        // Build search query with gender filter for fashion category
        let searchQuery = q.trim();
        if (category === 'fashion' && gender && gender !== 'all') {
            // Append gender to search query for fashion items
            const genderTerms = {
                'men': 'men',
                'women': 'women',
                'boys': 'boys',
                'girls': 'girls',
                'unisex': 'unisex'
            };
            const genderTerm = genderTerms[gender.toLowerCase()] || gender;
            searchQuery = `${genderTerm} ${searchQuery}`;
        }

        console.log(`🔍 Searching for: "${searchQuery}" in category: ${category || 'all'}${gender ? ` (gender: ${gender})` : ''}`);

        // For pharmacy category, use Medicine Scan logic for pharmacy stores + scrape Amazon/Flipkart/JioMart/BigBasket
        if (category === 'pharmacy') {
            console.log(`💊 Pharmacy search: Using Medicine Scan logic + scraping Amazon/Flipkart/JioMart/BigBasket`);
            try {
                // Get prices from pharmacy stores (fast axios + cheerio)
                const medicinePrices = await scrapeMedicinePrices(searchQuery);
                
                // Map siteId from medicine scraper to storeId format used by frontend
                const siteIdMap = {
                    '1mg': 'tata1mg',
                    'netmeds': 'netmeds',
                    'pharmeasy': 'pharmeasy',
                    'apollo': 'apollo'
                };

                // Stores to actually scrape (not redirect) - includes tata1mg
                const storesToScrape = ['tata1mg', 'amazon', 'flipkart', 'jiomart', 'bigbasket'];
                const CONCURRENCY = 4; // Run 4 scrapers in parallel

                // Helper to run async functions in batches
                async function runInBatches(items, workerFn, concurrency) {
                    const results = [];
                    let index = 0;

                    async function next() {
                        if (index >= items.length) return;
                        const i = index++;
                        try {
                            results[i] = await workerFn(items[i]);
                        } catch (e) {
                            results[i] = { storeId: items[i], products: [], success: false };
                        }
                        await next();
                    }

                    const runners = [];
                    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
                        runners.push(next());
                    }
                    await Promise.all(runners);
                    return results;
                }

                // Scrape Amazon, Flipkart, JioMart, BigBasket for medicines
                console.log(`📦 Scraping ${storesToScrape.length} stores for medicines...`);
                const scrapedResults = await runInBatches(storesToScrape, async (storeId) => {
                    try {
                        const scraper = ScraperFactory.createScraper(storeId);
                        const products = await scraper.scrape(searchQuery);

                        console.log(`✅ ${storeId}: ${products.length} products found`);
                        return { storeId, products: Array.isArray(products) ? products : [], success: true };
                    } catch (error) {
                        console.error(`❌ ${storeId} failed:`, error && error.message ? error.message : error);
                        return { storeId, products: [], success: false };
                    }
                }, CONCURRENCY);

                // Extract products from scraped results
                const scrapedProducts = scrapedResults
                    .filter(result => result && result.success && Array.isArray(result.products))
                    .map(result => result.products)
                    .flat();

                // Build store prices array
                const storePrices = [];
                
                // Add pharmacy store prices (from Medicine Scan)
                medicinePrices.forEach((mp) => {
                    const storeId = siteIdMap[mp.siteId] || mp.siteId || mp.site.toLowerCase().replace(/\s+/g, '');
                    const siteName = mp.site.toLowerCase().replace(/\s+/g, '');
                    storePrices.push({
                        storeName: mp.site,
                        storeId: storeId,
                        price: mp.price || 0, // Ensure price is a number, not null
                        originalPrice: null,
                        unit: null,
                        deliveryTime: 1440,
                        inStock: true,
                        url: `https://www.${siteName}.com/search?q=${encodeURIComponent(searchQuery)}`,
                        storeIcon: `https://logo.clearbit.com/${siteName}.com`,
                        isRedirect: false
                    });
                });

                // Add scraped products from Amazon/Flipkart/JioMart/BigBasket/Tata1mg
                // Group by store and take first product (lowest price) from each store
                const storeProductMap = new Map();
                scrapedProducts.forEach((product) => {
                    if (!product || !product.storeId || !product.price) return;
                    const storeId = product.storeId;
                    if (!storeProductMap.has(storeId) || product.price < storeProductMap.get(storeId).price) {
                        storeProductMap.set(storeId, {
                            storeName: product.storeName || ScraperFactory.getStoreName(storeId),
                            storeId: product.storeId,
                            price: product.price || 0, // Ensure price is a number
                            originalPrice: product.originalPrice || null,
                            unit: product.unit || null,
                            deliveryTime: product.deliveryTime || 1440,
                            inStock: product.inStock !== false,
                            url: product.url || `https://www.${ScraperFactory.getStoreDomain(storeId)}/search?q=${encodeURIComponent(searchQuery)}`,
                            storeIcon: product.storeIcon || `https://logo.clearbit.com/${ScraperFactory.getStoreDomain(storeId)}`,
                            isRedirect: false
                        });
                    }
                });

                // Add scraped store prices
                storeProductMap.forEach((storePrice) => {
                    storePrices.push(storePrice);
                });

                // Add redirect-only stores (non-working pharmacy stores only - tata1mg now scrapes)
                const redirectOnlyStores = ['netmeds', 'apollo'];
                const workingPharmacyStoreIds = new Set(medicinePrices.map(mp => {
                    const id = siteIdMap[mp.siteId] || mp.siteId || mp.site.toLowerCase().replace(/\s+/g, '');
                    return id;
                }));
                
                // Also add scraped stores to working set
                storeProductMap.forEach((_, storeId) => {
                    workingPharmacyStoreIds.add(storeId);
                });

                function getRedirectUrl(storeId, query) {
                    const urlMap = {
                        'tata1mg': `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`,
                        '1mg': `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`,
                        'netmeds': `https://www.netmeds.com/catalogsearch/result?q=${encodeURIComponent(query)}`,
                        'apollo': `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(query)}`
                    };
                    return urlMap[storeId] || `https://www.${storeId}.com/search?q=${encodeURIComponent(query)}`;
                }

                function getStoreName(storeId) {
                    const nameMap = {
                        'tata1mg': 'Tata 1mg',
                        'netmeds': 'Netmeds',
                        'apollo': 'Apollo Pharmacy'
                    };
                    return nameMap[storeId] || storeId;
                }

                redirectOnlyStores.forEach(storeId => {
                    if (!workingPharmacyStoreIds.has(storeId)) {
                        storePrices.push({
                            storeName: getStoreName(storeId),
                            storeId: storeId,
                            price: null,
                            originalPrice: null,
                            unit: null,
                            deliveryTime: null,
                            inStock: null,
                            url: getRedirectUrl(storeId, searchQuery),
                            storeIcon: `https://logo.clearbit.com/${storeId === 'tata1mg' ? '1mg' : storeId}.com`,
                            isRedirect: true
                        });
                    }
                });

                // If no results at all
                if (storePrices.length === 0) {
                    return res.json({
                        query: q,
                        category: 'pharmacy',
                        count: 0,
                        stores: 8,
                        products: [],
                        message: 'No medicine prices found. Try a different medicine name or check spelling.',
                    });
                }

                // Create products - for pharmacy, we group all stores into one product
                // But we need to ensure brand and imageUrl are not null (use empty string)
                const products = [{
                    id: searchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                    name: searchQuery,
                    brand: searchQuery.split(' ')[0] || 'Medicine', // Use first word as brand
                    imageUrl: '', // Empty string instead of null
                    category: 'pharmacy',
                    description: null,
                    storePrices: storePrices,
                    lastUpdated: new Date().toISOString(),
                }];

                const totalStores = medicinePrices.length + storeProductMap.size + redirectOnlyStores.filter(s => !workingPharmacyStoreIds.has(s)).length;
                console.log(`✨ Pharmacy: Found ${medicinePrices.length} pharmacy prices + ${storeProductMap.size} scraped prices + ${redirectOnlyStores.filter(s => !workingPharmacyStoreIds.has(s)).length} redirect links for "${searchQuery}"`);
                console.log(`📊 Total storePrices in product: ${storePrices.length}`);
                console.log(`📦 Store prices breakdown:`, storePrices.map(sp => ({ storeId: sp.storeId, price: sp.price, isRedirect: sp.isRedirect })));

                return res.json({
                    query: q,
                    category: 'pharmacy',
                    count: products.length,
                    stores: totalStores,
                    products,
                });
            } catch (error) {
                console.error('❌ Pharmacy search error:', error);
                return res.status(500).json({
                    error: 'Failed to search medicines. Please try again.',
                    query: q,
                    category: 'pharmacy',
                    count: 0,
                    stores: 0,
                    products: [],
                });
            }
        }

        // For other categories, use regular scrapers
        const stores = ScraperFactory.getStores(category);
        const CONCURRENCY = 4; // Run 4 scrapers in parallel
        
        console.log(`📦 Searching ${stores.length} stores...`);

        // Helper to run async functions in batches
        async function runInBatches(items, workerFn, concurrency) {
            const results = [];
            let index = 0;

            async function next() {
                if (index >= items.length) return;
                const i = index++;
                try {
                    results[i] = await workerFn(items[i]);
                } catch (e) {
                    results[i] = { storeId: items[i], products: [], success: false };
                }
                await next();
            }

            const runners = [];
            for (let i = 0; i < Math.min(concurrency, items.length); i++) {
                runners.push(next());
            }
            await Promise.all(runners);
            return results;
        }

        const results = await runInBatches(stores, async (storeId) => {
            try {
                const scraper = ScraperFactory.createScraper(storeId);
                const products = await scraper.scrape(searchQuery);

                console.log(`✅ ${storeId}: ${products.length} products found`);
                return { storeId, products: Array.isArray(products) ? products : [], success: true };
            } catch (error) {
                console.error(`❌ ${storeId} failed:`, error && error.message ? error.message : error);
                return { storeId, products: [], success: false };
            }
        }, CONCURRENCY);

        // Extract products from batch results (each result has { storeId, products, success })
        const allProducts = results
            .filter(result => result && result.success && Array.isArray(result.products))
            .map(result => result.products)
            .flat();

        // Group by product name
        const productMap = new Map();
        allProducts.forEach((product) => {
            const key = product.name.toLowerCase().trim().substring(0, 50);
            if (productMap.has(key)) {
                // prevent duplicate store entries (same storeId + url)
                const existing = productMap.get(key);
                const already = existing.storePrices.some(sp => sp.storeId === product.storeId && sp.url === product.url);
                if (!already) {
                    existing.storePrices.push({
                        storeName: product.storeName,
                        storeId: product.storeId,
                        price: product.price,
                        originalPrice: product.originalPrice,
                        unit: product.unit || null,
                        deliveryTime: product.deliveryTime,
                        inStock: product.inStock,
                        url: product.url,
                        storeIcon: product.storeIcon || `https://logo.clearbit.com/${product.storeName.toLowerCase().replace(/\s+/g, '')}.com`,
                    });
                }
            } else {
                productMap.set(key, {
                    id: key.replace(/[^a-z0-9]+/g, '_'),
                    name: product.name,
                    brand: product.brand,
                    imageUrl: product.imageUrl,
                    category: product.category,
                    description: null,
                    storePrices: [{
                        storeName: product.storeName,
                        storeId: product.storeId,
                        price: product.price,
                        originalPrice: product.originalPrice,
                        unit: product.unit || null,
                        deliveryTime: product.deliveryTime,
                        inStock: product.inStock,
                        url: product.url,
                        storeIcon: product.storeIcon || `https://logo.clearbit.com/${product.storeName.toLowerCase().replace(/\s+/g, '')}.com`,
                    }],
                    lastUpdated: new Date().toISOString(),
                });
            }
        });

        const products = Array.from(productMap.values());

        // Sort by lowest price
        products.sort((a, b) => {
            const aMin = Math.min(...a.storePrices.map(sp => sp.price));
            const bMin = Math.min(...b.storePrices.map(sp => sp.price));
            return aMin - bMin;
        });

        const successfulStores = results.filter(r => r && r.success).length;
        console.log(`✨ Total: ${products.length} unique products from ${successfulStores}/${stores.length} stores`);

        // If no products found, provide helpful error message
        if (products.length === 0) {
            const failedStores = results.filter(r => !r || !r.success).map(r => r?.storeId || 'unknown');
            const successfulStores = results.filter(r => r && r.success).map(r => r.storeId);
            console.warn(`⚠️  No products found. Failed stores: ${failedStores.join(', ')}`);
            console.warn(`⚠️  Successful stores: ${successfulStores.join(', ')}`);
            
            // For pharmacy, provide helpful message but return 200 (not 404) so frontend can show message
            if (category === 'pharmacy') {
                console.log(`💊 Pharmacy search completed but no products found. This is common due to site protections.`);
                return res.json({
                    query: q,
                    category: category || 'all',
                    count: 0,
                    stores: stores.length,
                    products: [],
                    message: 'No medicine prices found. Pharmacy sites may have anti-bot protection. Try using the "Medicine Scan" feature for more reliable results.',
                });
            }
        }

        res.json({
            query: q,
            category: category || 'all',
            gender: gender || null,
            count: products.length,
            stores: stores.length,
            products,
        });
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { searchProducts };