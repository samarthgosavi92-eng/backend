//========== FILE 1: backend/src/all-scrapers.js ==========
// ✅ FIXED: Amazon & Flipkart use APIs, rest use scraping

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
puppeteer.use(StealthPlugin());

// Base Scraper Class
class BaseScraper {
    constructor(name, id, category) {
        this.storeName = name;
        this.storeId = id;
        this.category = category;
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        try {
            // Try to find Chrome/Chromium in common locations
            let executablePath = null;
            const chromePaths = [
                // Windows paths
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
                // Mac paths
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                // Linux paths
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                // Custom path from environment
                process.env.CHROME_PATH,
            ].filter(Boolean);

            for (const path of chromePaths) {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(path)) {
                        executablePath = path;
                        console.log(`[${this.storeName}] Using Chrome at: ${path}`);
                        break;
                    }
                } catch (e) {}
            }

            const launchOptions = {
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                defaultViewport: null,
                ignoreHTTPSErrors: true
            };

            // Try to use system Chrome if available, otherwise use Puppeteer's Chromium
            if (executablePath) {
                launchOptions.executablePath = executablePath;
            } else {
                // Try to get Chromium path from puppeteer
                try {
                    const puppeteerFull = require('puppeteer');
                    const chromiumPath = puppeteerFull.executablePath();
                    if (chromiumPath) {
                        launchOptions.executablePath = chromiumPath;
                        console.log(`[${this.storeName}] Using Puppeteer Chromium at: ${chromiumPath}`);
                    }
                } catch (e) {
                    console.warn(`[${this.storeName}] Could not find Chromium, will try default`);
                }
            }

            this.browser = await puppeteer.launch(launchOptions);
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
            });
            // Remove webdriver property
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });
        } catch (e) {
            console.error(`[${this.storeName}] Browser initialization error:`, e.message);
            throw e;
        }
    }

    async close() {
        try {
            if (this.page) await this.page.close().catch(() => { });
            if (this.browser) await this.browser.close().catch(() => { });
        } catch (e) {
            console.error(`[${this.storeName}] Close error:`, e.message);
        }
    }

    delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    formatProduct(data) {
        // Clean price string
        let priceStr = String(data.price || '0').replace(/[^0-9.]/g, '');
        let price = parseFloat(priceStr) || 0;

        // Clean original price
        let originalPrice = null;
        if (data.originalPrice) {
            let origStr = String(data.originalPrice).replace(/[^0-9.]/g, '');
            originalPrice = parseFloat(origStr) || null;
        }

        // Clean URL
        let url = data.url || '';
        if (url && !url.startsWith('http')) {
            url = url.startsWith('/') ? `https://${this.storeName.toLowerCase().replace(/\s+/g, '')}.com${url}` : url;
        }

        // Clean and fix image URL - ensure it's a complete, valid URL
        let imageUrl = (data.imageUrl || '').trim();
        if (imageUrl) {
            // Remove data URIs and invalid formats
            if (imageUrl.startsWith('data:')) {
                imageUrl = '';
            }
            // Fix relative URLs
            else if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
            }
            else if (imageUrl.startsWith('/')) {
                const domainMap = {
                    'dmartready': 'dmartready.com',
                    'bigbasket': 'bigbasket.com',
                    'jiomart': 'jiomart.com',
                    'reliancesmart': 'reliancesmart.in',
                    'amazon': 'amazon.in',
                    'flipkart': 'flipkart.com',
                    'meesho': 'meesho.com',
                    'myntra': 'myntra.com',
                    'blinkit': 'blinkit.com',
                    'zomato': 'zomato.com',
                    'swiggy': 'swiggy.com'
                };
                const domain = domainMap[this.storeId] || this.storeName.toLowerCase().replace(/\s+/g, '') + '.com';
                imageUrl = `https://${domain}${imageUrl}`;
            }
            // Ensure it starts with http/https
            else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                imageUrl = 'https://' + imageUrl;
            }
        }
        
        // Fallback to placeholder if no image
        if (!imageUrl || imageUrl === '') {
            imageUrl = `https://via.placeholder.com/300x300?text=${encodeURIComponent((data.name || this.storeName).substring(0, 20))}`;
        }

        // Generate store icon URL
        const storeDomain = this.storeName.toLowerCase().replace(/\s+/g, '');
        const storeIcon = data.storeIcon || `https://logo.clearbit.com/${storeDomain}.com`;

        return {
            name: (data.name || '').trim(),
            brand: (data.brand || this.storeName).trim(),
            price: price,
            originalPrice: originalPrice,
            imageUrl: imageUrl,
            url: url,
            storeName: this.storeName,
            storeId: this.storeId,
            deliveryTime: data.deliveryTime || 60,
            inStock: data.inStock !== false,
            category: this.category,
            storeIcon: storeIcon
        };
    }

    async retry(fn, maxRetries = 2) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (e) {
                if (i === maxRetries - 1) throw e;
                console.log(`[${this.storeName}] Retry ${i + 1}/${maxRetries}...`);
                await this.delay(1000 * (i + 1));
            }
        }
    }
}

// ========== SCRAPER 1: DMART (Scraping) ==========
class DMartScraper extends BaseScraper {
    constructor() { super('DMart Ready', 'dmart', 'grocery'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://www.dmartready.com/search/${encodeURIComponent(query)}`, { timeout: 20000 });
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('[data-testid="product-card"], .product-card, .product-item, [class*="product"]')).map(el => {
                    // Try multiple image sources
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                   img.getAttribute('data-src') || 
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-original') ||
                                   img.src || '';
                    }
                    
                    return {
                        name: el.querySelector('[data-testid="product-name"], .product-name, h3, h4, [class*="name"]')?.textContent?.trim(),
                        price: el.querySelector('[data-testid="product-price"], .price, [class*="price"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        imageUrl: imageUrl,
                        url: el.querySelector('a')?.href,
                    };
                }).filter(p => p.name && p.price);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 180 }));
        } catch (e) {
            console.error('DMart error:', e.message);
            if (this.page) await this.page.screenshot({ path: 'dmart-error.png' });
            await this.close();
            return [];
        }
    }
}

// ========== SCRAPER 2: BIGBASKET (Scraping with RapidAPI support) ==========
class BigBasketScraper extends BaseScraper {
    constructor() { super('BigBasket', 'bigbasket', 'grocery'); }

    async scrape(query) {
        try {
            // Try RapidAPI first if available (for real-time prices)
            if (process.env.RAPIDAPI_KEY) {
                try {
                    console.log(`[BigBasket] Trying RapidAPI for: ${query}`);
                    // Using real-time Amazon data API which also covers some grocery items
                    const response = await axios.get('https://real-time-amazon-data.p.rapidapi.com/search', {
                        params: { 
                            query: query,
                            country: 'IN',
                            page: '1'
                        },
                        headers: {
                            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                            'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
                        },
                        timeout: 8000
                    });

                    if (response.data && response.data.data && response.data.data.products) {
                        const products = response.data.data.products
                            .filter(item => item.product_price && item.product_title)
                            .slice(0, 10)
                            .map(item => this.formatProduct({
                                name: item.product_title,
                                price: item.product_price?.replace(/[^0-9.]/g, ''),
                                originalPrice: item.product_original_price?.replace(/[^0-9.]/g, ''),
                                imageUrl: item.product_photo || item.product_main_image_url,
                                url: item.product_url,
                                deliveryTime: 15,
                            }));
                        if (products.length > 0) {
                            console.log(`[BigBasket] API returned ${products.length} products`);
                            return products;
                        }
                    }
                } catch (apiError) {
                    console.log('[BigBasket] API failed, using scraping fallback:', apiError.message);
                }
            }

            // Fallback to scraping
            await this.initialize();
            await this.page.goto(`https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`, { 
                timeout: 20000,
                waitUntil: 'domcontentloaded' 
            });
            await this.delay(1500);

            // Scroll to load more products
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(500);

            const products = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('._2GFdU, .product, [data-qa="product"], [class*="ProductCard"], [class*="product-card"], [class*="SKUDeck"]')).map(el => {
                    // Try multiple image sources
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                   img.getAttribute('data-src') || 
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-original') ||
                                   img.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0] ||
                                   img.src || '';
                    }
                    
                    return {
                        name: el.querySelector('a, h3, .product-name, [class*="name"], [data-qa="productName"]')?.textContent?.trim(),
                        price: el.querySelector('.AiUwH, .price, .Pricing___StyledDiv2, [class*="price"], [data-qa="price"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        originalPrice: el.querySelector('._14q8x, .old-price, [class*="original"], [class*="mrp"], [data-qa="oldPrice"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        imageUrl: imageUrl,
                        url: el.querySelector('a')?.href,
                    };
                }).filter(p => p.name && p.price && p.name.length > 3);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 15 }));
        } catch (e) {
            await this.close();
            console.error('BigBasket error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 3: JIOMART (Scraping) ==========
class JioMartScraper extends BaseScraper {
    constructor() { super('JioMart', 'jiomart', 'grocery'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://www.jiomart.com/search/${encodeURIComponent(query)}`, { timeout: 20000 });
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('.plp-card-container, [data-test="product"], [class*="ProductCard"], [class*="product"]')).map(el => {
                    // Try multiple image sources
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                   img.getAttribute('data-src') || 
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-original') ||
                                   img.src || '';
                    }
                    
                    return {
                        name: el.querySelector('.plp-card-details-name, .product-title, [class*="name"]')?.textContent?.trim(),
                        price: el.querySelector('.jm-heading-xxs, .price, [class*="price"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        imageUrl: imageUrl,
                        url: el.querySelector('a')?.href,
                    };
                }).filter(p => p.name && p.price);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 120 }));
        } catch (e) {
            await this.close();
            console.error('JioMart error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 4: RELIANCE SMART (Scraping) ==========
class RelianceSmartScraper extends BaseScraper {
    constructor() { super('Reliance Smart', 'reliancesmart', 'grocery'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://www.reliancesmart.in/search/?searchCriteria=${encodeURIComponent(query)}`, { timeout: 20000 });
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('.product-item, .product-card, [class*="product"]')).map(el => {
                    // Try multiple image sources
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                   img.getAttribute('data-src') || 
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-original') ||
                                   img.src || '';
                    }
                    
                    return {
                        name: el.querySelector('.product-name, h3, [class*="name"]')?.textContent?.trim(),
                        price: el.querySelector('.price, .product-price, [class*="price"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        imageUrl: imageUrl,
                        url: el.querySelector('a')?.href,
                    };
                }).filter(p => p.name && p.price);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 240 }));
        } catch (e) {
            await this.close();
            console.error('Reliance error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 5: AMAZON (✅ API - FAST!) ==========
class AmazonScraper extends BaseScraper {
    constructor() { super('Amazon', 'amazon', 'ecommerce'); }

    async scrape(query) {
        // Skip API if no key is provided, go directly to scraping
        if (!process.env.RAPIDAPI_KEY) {
            console.log(`[Amazon] No API key found, using scraping for: ${query}`);
            return await this.scrapeFallback(query);
        }

        try {
            console.log(`[Amazon] Searching API for: ${query}`);
            // Using RapidAPI Amazon Product Search (Free tier available)
            // You need to sign up at: https://rapidapi.com/marketplace
            const response = await axios.get('https://real-time-amazon-data.p.rapidapi.com/search', {
                params: { query, country: 'IN' },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                    'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com'
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.products) {
                console.log(`[Amazon] API found ${response.data.data.products.length} results`);
                return response.data.data.products.slice(0, 10).map(item => this.formatProduct({
                    name: item.product_title,
                    price: item.product_price?.replace(/[^0-9.]/g, ''),
                    originalPrice: item.product_original_price?.replace(/[^0-9.]/g, ''),
                    imageUrl: item.product_photo,
                    url: item.product_url,
                    deliveryTime: 1440,
                }));
            }

            console.log('[Amazon] API returned no products, using fallback');
            // Fallback to scraping if API fails
            return await this.scrapeFallback(query);
        } catch (e) {
            console.log('[Amazon] API error, using scraping fallback:', e.message);
            if (e.response) {
                console.log('[Amazon] API Response:', e.response.status, e.response.data?.message || e.response.data);
            }
            return await this.scrapeFallback(query);
        }
    }

    async scrapeFallback(query) {
        try {
            console.log('[Amazon] Starting scraper fallback...');
            await this.initialize();

            const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
            console.log(`[Amazon] Navigating to: ${url}`);

            await this.page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            // Handle captcha or login prompts
            try {
                const captchaSelectors = ['#captchacharacters', 'input[name="captcha"]'];
                for (const sel of captchaSelectors) {
                    if (await this.page.$(sel)) {
                        console.log('[Amazon] ⚠️ Captcha detected - skipping');
                        await this.close();
                        return [];
                    }
                }
            } catch (e) { }

            await this.delay(1000);

            // Scroll to load products
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(1000);

            const products = await this.page.evaluate(() => {
                // Try multiple selectors for Amazon's dynamic structure
                const resultSelectors = [
                    '[data-component-type="s-search-result"]',
                    '[data-asin]',
                    '.s-result-item',
                    'div[data-index]'
                ];

                let items = [];
                for (const sel of resultSelectors) {
                    items = Array.from(document.querySelectorAll(sel));
                    if (items.length > 0) break;
                }

                return items.slice(0, 10).map(el => {
                    // Find name
                    let name = '';
                    const nameSelectors = [
                        'h2 span',
                        'h2 a span',
                        '.s-title-instructions-style span',
                        'a[class*="title"] span',
                        'h2'
                    ];
                    for (const sel of nameSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            name = elem.textContent?.trim() || '';
                            if (name && name.length > 5) break;
                        }
                    }

                    // Find price
                    let price = '';
                    const priceSelectors = [
                        '.a-price-whole',
                        '.a-price .a-offscreen',
                        'span[class*="price"]',
                        '.a-price-symbol + span'
                    ];
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            price = elem.textContent?.trim() || elem.getAttribute('aria-label') || '';
                            if (price && /\d/.test(price)) break;
                        }
                    }

                    // Find original price (for discount)
                    let originalPrice = '';
                    const origPriceSelectors = [
                        '.a-price.a-text-price .a-offscreen',
                        '.a-text-price span',
                        'span[class*="strike"]'
                    ];
                    for (const sel of origPriceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            originalPrice = elem.textContent?.trim() || elem.getAttribute('aria-label') || '';
                            if (originalPrice) break;
                        }
                    }

                    // Find image
                    const img = el.querySelector('img.s-image, img[data-image-latency]');
                    const imageUrl = img?.src || img?.getAttribute('data-src') || '';

                    // Find URL - try multiple strategies to get actual product URL
                    let url = '';
                    
                    // First, try to find the actual product link (not sponsored/wrapper links)
                    const linkSelectors = [
                        'h2 a[href*="/dp/"]',
                        'h2 a[href*="/gp/product/"]',
                        'a[href*="/dp/"][class*="title"]',
                        'a[href*="/gp/product/"][class*="title"]',
                        'h2 a',
                        'a[class*="title"]'
                    ];
                    
                    for (const sel of linkSelectors) {
                        const link = el.querySelector(sel);
                        if (link) {
                            let href = link.href || link.getAttribute('href') || '';
                            
                            // Skip sponsored/wrapper links
                            if (href.includes('/sspa/') || href.includes('/click?')) {
                                // Try to extract the actual product URL from the wrapper
                                const urlMatch = href.match(/url=([^&]+)/);
                                if (urlMatch) {
                                    href = decodeURIComponent(urlMatch[1]);
                                } else {
                                    continue; // Skip this link
                                }
                            }
                            
                            if (href && (href.includes('/dp/') || href.includes('/gp/product/'))) {
                                url = href;
                                break;
                            }
                        }
                    }
                    
                    // If still no URL, try getting from any link in the element
                    if (!url) {
                        const allLinks = el.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
                        for (const link of allLinks) {
                            let href = link.href || link.getAttribute('href') || '';
                            if (href && !href.includes('/sspa/') && !href.includes('/click?')) {
                                url = href;
                                break;
                            }
                        }
                    }
                    
                    // If still no URL, try getting from parent link
                    if (!url) {
                        const parentLink = el.closest('a[href*="/dp/"]') || el.closest('a[href*="/gp/product/"]');
                        if (parentLink) {
                            let href = parentLink.href || parentLink.getAttribute('href') || '';
                            if (href && !href.includes('/sspa/') && !href.includes('/click?')) {
                                url = href;
                            }
                        }
                    }
                    
                    // Clean and format URL
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.amazon.in' + url;
                    }
                    
                    // Clean URL - remove unnecessary query parameters but keep essential ones
                    if (url && url.includes('?')) {
                        try {
                            const urlObj = new URL(url);
                            // Keep only essential parameters
                            const essentialParams = ['tag', 'ref'];
                            const newParams = new URLSearchParams();
                            for (const key of essentialParams) {
                                if (urlObj.searchParams.has(key)) {
                                    newParams.set(key, urlObj.searchParams.get(key));
                                }
                            }
                            url = urlObj.origin + urlObj.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
                        } catch (e) {
                            // If URL parsing fails, just use the base URL
                            url = url.split('?')[0];
                        }
                    }

                    return { name, price, originalPrice, imageUrl, url };
                }).filter(p => {
                    // Additional filtering to ensure quality
                    if (!p || !p.name || !p.price) return false;
                    if (p.name.length < 3 || p.name.length > 200) return false;
                    const priceNum = parseInt(p.price);
                    if (!priceNum || priceNum < 10 || priceNum > 10000000) return false;
                    // Skip discount badges
                    if (p.name.toLowerCase().includes('% off') && p.name.length < 15) return false;
                    if (p.name.match(/^\d+%$/)) return false;
                    // Skip badge images
                    if (p.imageUrl && (p.imageUrl.includes('mall-badge') || p.imageUrl.includes('badge-plp'))) return false;
                    return true;
                });
            });

            console.log(`[Amazon] Found ${products.length} products`);

            // Only take screenshot on actual errors, not empty results

            await this.close();
            const formatted = products.map(p => this.formatProduct({ ...p, deliveryTime: 1440 }));
            console.log(`[Amazon] Returning ${formatted.length} formatted products`);
            return formatted;
        } catch (e) {
            console.error(`❌ [Amazon] Fallback Error: ${e.message}`);
            console.error(e.stack);
            try {
                await this.page.screenshot({ path: 'amazon-error.png', fullPage: true });
            } catch (screenshotError) { }
            await this.close();
            return [];
        }
    }
}

// ========== SCRAPER 6: FLIPKART (Improved Scraping) ==========
class FlipkartScraper extends BaseScraper {
    constructor() { super('Flipkart', 'flipkart', 'ecommerce'); }

    async scrape(query) {
        return await this.retry(async () => {
            return await this.scrapeFallback(query);
        });
    }

    async scrapeFallback(query) {
        try {
            console.log(`[Flipkart] Searching for: "${query}"`);
            await this.initialize();

            const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
            console.log(`[Flipkart] Navigating to: ${url}`);

            await this.page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            // Handle login popup
            try {
                const loginSelectors = [
                    'button._2KpZ6l._2doB4z',
                    'button._2KpZ6l',
                    'span._2doB4z',
                    'button[class*="doB4z"]'
                ];
                for (const selector of loginSelectors) {
                    try {
                        await this.page.waitForSelector(selector, { timeout: 1500 });
                        await this.page.click(selector);
                        console.log(`[Flipkart] Closed popup with selector: ${selector}`);
                        await this.delay(500);
                        break;
                    } catch (e) { }
                }
            } catch (e) {
                console.log('[Flipkart] No popup found or already closed');
            }

            // Wait for products to load (reduced from 3000ms)
            await this.delay(1000);

            // Scroll to load more products
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(1000);

            const products = await this.page.evaluate(() => {
                // Multiple selector strategies for Flipkart's dynamic classes
                const selectors = [
                    'div[data-id]',
                    'div._1AtVbE',
                    'div[class*="product"]',
                    'div[class*="Product"]',
                    'a[href*="/p/"]'
                ];

                let items = [];
                for (const sel of selectors) {
                    items = Array.from(document.querySelectorAll(sel));
                    if (items.length > 0) break;
                }

                if (items.length === 0) {
                    // Try finding any product-like containers
                    items = Array.from(document.querySelectorAll('div')).filter(div => {
                        const text = div.textContent || '';
                        const hasPrice = /\d+/.test(text);
                        const hasLink = div.querySelector('a[href*="/p/"]');
                        return hasPrice && hasLink && text.length > 20;
                    });
                }

                return items.slice(0, 10).map(el => {
                    // Find name - try multiple strategies
                    let name = '';
                    const nameSelectors = [
                        'a[title]',
                        '._4rR01T',
                        '.IRpwTa',
                        '.RG5Slk',
                        'div[class*="title"]',
                        'span[class*="title"]',
                        'h2',
                        'h3',
                        'h4'
                    ];
                    for (const sel of nameSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            name = elem.textContent?.trim() || elem.getAttribute('title') || '';
                            if (name) break;
                        }
                    }

                    // Find price - try multiple strategies
                    let price = '';
                    const priceSelectors = [
                        '._30jeq3',
                        '.hZ3P6w',
                        'div[class*="Price"]',
                        'span[class*="Price"]',
                        'div[class*="price"]',
                        'span[class*="price"]'
                    ];
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            price = elem.textContent?.trim() || '';
                            if (price && /\d/.test(price)) break;
                        }
                    }

                    // Find image
                    const img = el.querySelector('img');
                    const imageUrl = img?.src || img?.getAttribute('data-src') || '';

                    // Find URL
                    const link = el.querySelector('a[href*="/p/"]') || el.closest('a[href*="/p/"]');
                    let url = link?.href || '';
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.flipkart.com' + url;
                    }

                    return { name, price, imageUrl, url };
                }).filter(p => p.name && p.price && p.name.length > 3);
            });

            console.log(`[Flipkart] Found ${products.length} products`);

            // Only take screenshot on actual errors, not empty results

            await this.close();
            const formatted = products.map(p => this.formatProduct({ ...p, deliveryTime: 1440 }));
            console.log(`[Flipkart] Returning ${formatted.length} formatted products`);
            return formatted;
        } catch (e) {
            console.error(`❌ [Flipkart] Error: ${e.message}`);
            console.error(e.stack);
            try {
                await this.page.screenshot({ path: 'flipkart-error.png', fullPage: true });
            } catch (screenshotError) { }
            await this.close();
            return [];
        }
    }
}

// ========== SCRAPER 7: MEESHO (Improved Scraping) ==========
class MeeshoScraper extends BaseScraper {
    constructor() { super('Meesho', 'meesho', 'fashion'); }

    async scrape(query) {
        return await this.retry(async () => {
            return await this.scrapeMeesho(query);
        });
    }

    async scrapeMeesho(query) {
        try {
            console.log(`[Meesho] Searching for: "${query}"`);
            await this.initialize();

            const url = `https://www.meesho.com/search?q=${encodeURIComponent(query)}`;
            console.log(`[Meesho] Navigating to: ${url}`);

            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // Wait for products to load - Meesho uses lazy loading
            await this.delay(3000);

            // Scroll multiple times to trigger lazy loading
            for (let i = 0; i < 3; i++) {
                await this.page.evaluate(() => {
                    window.scrollBy(0, 600);
                });
                await this.delay(1000);
            }

            const products = await this.page.evaluate(() => {
                // Find all product links first
                const allProductLinks = Array.from(document.querySelectorAll('a[href*="/product/"]'));
                
                // Get unique product containers (avoid duplicates)
                const productContainers = new Set();
                allProductLinks.forEach(link => {
                    const container = link.closest('div[class*="Card"]') || 
                                     link.closest('div[class*="card"]') ||
                                     link.closest('div[class*="Product"]') ||
                                     link.closest('div[class*="product"]') ||
                                     link.parentElement?.parentElement;
                    if (container) {
                        productContainers.add(container);
                    }
                });

                const items = Array.from(productContainers);

                return items.slice(0, 20).map(el => {
                    // Find name - get from product link or title element
                    let name = '';
                    const link = el.querySelector('a[href*="/product/"]') || el.closest('a[href*="/product/"]');
                    
                    if (link) {
                        // Try to get name from link's title or aria-label first
                        name = link.getAttribute('title') || link.getAttribute('aria-label') || '';
                        
                        // If not found, look for text elements that are likely product names
                        if (!name || name.length < 3) {
                            const nameSelectors = [
                                'p[class*="Text"]',
                                'span[class*="Text"]',
                                'div[class*="Text"]',
                                '[class*="title"]',
                                '[class*="Title"]',
                                'h3',
                                'h4',
                                'p',
                                'span'
                            ];
                            
                            for (const sel of nameSelectors) {
                                const elem = el.querySelector(sel);
                                if (elem) {
                                    const text = elem.textContent?.trim() || '';
                                    // Filter out discount badges and invalid names
                                    if (text && text.length > 3 && text.length < 200) {
                                        // Skip if it's clearly a discount badge
                                        if (text.toLowerCase().includes('% off') && text.length < 15) {
                                            continue;
                                        }
                                        if (text.match(/^\d+%$/)) {
                                            continue;
                                        }
                                        name = text;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Skip if no name found
                    if (!name || name.length < 3) {
                        return null;
                    }
                    // Skip discount badges
                    if (name.toLowerCase().includes('% off') && name.length < 15) {
                        return null;
                    }
                    if (name.match(/^\d+%$/)) {
                        return null;
                    }

                    // Find price - look for actual price, not discount percentages
                    let price = '';
                    const priceSelectors = [
                        'span[class*="Price"]',
                        'p[class*="Price"]',
                        'div[class*="Price"]',
                        '[class*="price"]'
                    ];
                    
                    // Try to find price element
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            const text = elem.textContent?.trim() || '';
                            // Extract numeric price
                            const priceMatch = text.match(/₹\s*(\d+)/) || text.match(/Rs\.?\s*(\d+)/i) || text.match(/(\d+)/);
                            if (priceMatch) {
                                const extractedPrice = parseInt(priceMatch[1]);
                                // Filter out unrealistic prices (too low or too high)
                                // Meesho has very cheap items, so allow from ₹10
                                if (extractedPrice >= 10 && extractedPrice < 10000000) {
                                    price = extractedPrice.toString();
                                    break;
                                }
                            }
                        }
                    }
                    
                    // If still no valid price, try extracting from all text
                    if (!price) {
                        const text = el.textContent || '';
                        // Look for price patterns, but filter out discount percentages
                        const priceMatches = text.matchAll(/₹\s*(\d{2,7})/g);
                        for (const match of priceMatches) {
                            const extractedPrice = parseInt(match[1]);
                            // Valid price range: ₹10 to ₹10,000,000 (Meesho has very cheap items)
                            if (extractedPrice >= 10 && extractedPrice < 10000000) {
                                price = extractedPrice.toString();
                                break;
                            }
                        }
                    }
                    
                    // Skip if no valid price found (minimum ₹10 for very cheap items)
                    if (!price) {
                        return null;
                    }
                    const priceNum = parseInt(price);
                    if (isNaN(priceNum) || priceNum < 10 || priceNum > 10000000) {
                        return null;
                    }

                    // Find original price (MRP)
                    let originalPrice = '';
                    const origPriceSelectors = [
                        '[class*="original"]',
                        '[class*="strike"]',
                        '[class*="mrp"]',
                        '[class*="MRP"]'
                    ];
                    for (const sel of origPriceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            originalPrice = elem.textContent?.trim() || '';
                            if (originalPrice && /\d/.test(originalPrice)) break;
                        }
                    }
                    
                    // Also try to extract MRP from text
                    if (!originalPrice || !/\d/.test(originalPrice)) {
                        const text = el.textContent || '';
                        const mrpMatch = text.match(/MRP[:\s]*₹?\s*(\d+)/i) || text.match(/₹\s*(\d+)/);
                        if (mrpMatch && mrpMatch[1] !== price) {
                            originalPrice = mrpMatch[1];
                        }
                    }

                    // Find image - skip badge images
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                  img.getAttribute('data-src') || 
                                  img.getAttribute('data-lazy-src') ||
                                  img.getAttribute('data-original') ||
                                  img.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0] ||
                                  img.src || '';
                        
                        // Skip badge images
                        if (imageUrl.includes('mall-badge') || imageUrl.includes('badge')) {
                            imageUrl = '';
                        }
                    }
                    
                    // Skip badge images
                    if (imageUrl && (imageUrl.includes('mall-badge') || imageUrl.includes('badge-plp'))) {
                        imageUrl = ''; // Clear it, will use placeholder
                    }

                    // Find URL - try multiple strategies
                    let url = '';
                    const linkSelectors = [
                        'a[href*="/product/"]',
                        'a[href*="/p/"]',
                        'a'
                    ];
                    
                    for (const sel of linkSelectors) {
                        const link = el.querySelector(sel);
                        if (link) {
                            url = link.href || link.getAttribute('href') || '';
                            if (url && (url.includes('/product/') || url.includes('/p/'))) {
                                break;
                            }
                        }
                    }
                    
                    // If still no URL, try getting from parent/closest link
                    if (!url) {
                        const parentLink = el.closest('a[href*="/product/"]') || el.closest('a[href*="/p/"]');
                        if (parentLink) {
                            url = parentLink.href || parentLink.getAttribute('href') || '';
                        }
                    }
                    
                    // Clean and format URL
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.meesho.com' + url;
                    }
                    
                    // Remove fragment and clean URL
                    if (url && url.includes('#')) {
                        url = url.split('#')[0];
                    }

                    return { name, price, originalPrice, imageUrl, url };
                }).filter(p => p.name && p.price && p.name.length > 3 && p.name.length < 200);
            });

            console.log(`[Meesho] Found ${products.length} products`);

            await this.close();
            const formatted = products.map(p => this.formatProduct({ ...p, deliveryTime: 2880 }));
            console.log(`[Meesho] Returning ${formatted.length} formatted products`);
            return formatted;
        } catch (e) {
            console.error(`❌ [Meesho] Error: ${e.message}`);
            console.error(e.stack);
            try {
                await this.page.screenshot({ path: 'meesho-error.png', fullPage: true });
                console.log('[Meesho] Screenshot saved to meesho-error.png');
            } catch (screenshotError) { }
            await this.close();
            return [];
        }
    }
}

// ========== SCRAPER 8: BLINKIT (Scraping) ==========
class BlinkitScraper extends BaseScraper {
    constructor() { super('Blinkit', 'blinkit', 'ecommerce'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://blinkit.com/s/?q=${encodeURIComponent(query)}`, { 
                timeout: 20000,
                waitUntil: 'domcontentloaded' 
            });
            await this.delay(1500);

            // Scroll to load products
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(500);

            const products = await this.page.evaluate(() => {
                return Array.from(document.querySelectorAll('.Product__UpdatedC, .product, [class*="Product"], [class*="product-card"]')).map(el => {
                    // Try multiple image sources
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                   img.getAttribute('data-src') || 
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-original') ||
                                   img.src || '';
                    }
                    
                    // Try to get URL
                    const link = el.querySelector('a') || el.closest('a');
                    let url = link?.href || window.location.href;
                    
                    return {
                        name: el.querySelector('.Product__UpdatedTitle, .product-title, [class*="title"], h3')?.textContent?.trim(),
                        price: el.querySelector('.Product__UpdatedPrice, .price, [class*="price"]')?.textContent?.replace(/[^0-9.]/g, ''),
                        imageUrl: imageUrl,
                        url: url,
                    };
                }).filter(p => p.name && p.price && p.name.length > 3);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 10 }));
        } catch (e) {
            await this.close();
            console.error('Blinkit error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 9: ZOMATO (Scraping) ==========
class ZomatoScraper extends BaseScraper {
    constructor() { super('Zomato', 'zomato', 'food'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://www.zomato.com/mumbai/search?q=${encodeURIComponent(query)}`, { 
                timeout: 20000,
                waitUntil: 'domcontentloaded' 
            });
            await this.delay(1500);

            // Scroll to load content
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(500);

            const products = await this.page.evaluate(() => {
                // Try multiple selectors for Zomato restaurant cards
                const selectors = [
                    'a[href*="/restaurant/"]',
                    '[data-testid="restaurant-card"]',
                    '.sc-1mo3ldo-0',
                    'div[class*="RestaurantCard"]',
                    'div[class*="restaurant"]'
                ];

                let items = [];
                for (const sel of selectors) {
                    items = Array.from(document.querySelectorAll(sel));
                    if (items.length > 0) break;
                }

                return items.slice(0, 10).map(el => {
                    // Find restaurant name
                    let name = '';
                    const nameSelectors = [
                        'h4',
                        '.sc-1hp8d8a-0',
                        '[class*="name"]',
                        '[class*="Name"]',
                        'a[title]'
                    ];
                    for (const sel of nameSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            name = elem.textContent?.trim() || elem.getAttribute('title') || '';
                            if (name && name.length > 3) break;
                        }
                    }

                    // Find price (average cost for two or per person)
                    let price = '';
                    const priceSelectors = [
                        '[class*="cost"]',
                        '[class*="price"]',
                        '[class*="Cost"]',
                        'span[class*="rupee"]'
                    ];
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            price = elem.textContent?.trim() || '';
                            if (price && /\d/.test(price)) break;
                        }
                    }
                    
                    // If no price found, try to extract from text content
                    if (!price || !/\d/.test(price)) {
                        const text = el.textContent || '';
                        const priceMatch = text.match(/₹\s*(\d+)/) || text.match(/(\d+)\s*for\s*two/i) || text.match(/avg\s*(\d+)/i);
                        if (priceMatch) {
                            price = priceMatch[1];
                        } else {
                            // Default to 300 if no price found (average food order)
                            price = '300';
                        }
                    }

                    // Find image
                    const img = el.querySelector('img');
                    const imageUrl = img?.src || img?.getAttribute('data-src') || '';

                    // Find URL
                    const link = el.querySelector('a[href*="/restaurant/"]') || el.closest('a[href*="/restaurant/"]') || el;
                    let url = link?.href || '';
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.zomato.com' + url;
                    }

                    return { name, price, imageUrl, url };
                }).filter(p => p.name && p.name.length > 3);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 30 }));
        } catch (e) {
            await this.close();
            console.error('Zomato error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 10: MYNTRA (Scraping) ==========
class MyntraScraper extends BaseScraper {
    constructor() { super('Myntra', 'myntra', 'fashion'); }

    async scrape(query) {
        return await this.retry(async () => {
            return await this.scrapeMyntra(query);
        });
    }

    async scrapeMyntra(query) {
        try {
            console.log(`[Myntra] Searching for: "${query}"`);
            await this.initialize();

            const url = `https://www.myntra.com/search?q=${encodeURIComponent(query)}`;
            console.log(`[Myntra] Navigating to: ${url}`);

            await this.page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Wait for products to load
            await this.delay(3000);

            // Scroll to load more products
            for (let i = 0; i < 2; i++) {
                await this.page.evaluate(() => {
                    window.scrollBy(0, 600);
                });
                await this.delay(1000);
            }

            const products = await this.page.evaluate(() => {
                // Myntra product selectors
                const productSelectors = [
                    'li[class*="product-base"]',
                    'div[class*="product-base"]',
                    'a[href*="/p/"]',
                    '[data-product-id]'
                ];

                let items = [];
                for (const sel of productSelectors) {
                    items = Array.from(document.querySelectorAll(sel));
                    if (items.length > 0) {
                        console.log(`Found ${items.length} items with selector: ${sel}`);
                        break;
                    }
                }

                // If still no items, try finding by product links
                if (items.length === 0) {
                    const allLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
                    items = allLinks.map(link => link.closest('li') || link.closest('div') || link.parentElement).filter(Boolean);
                    console.log(`Found ${items.length} items via link structure`);
                }

                return items.slice(0, 20).map(el => {
                    // Find name
                    let name = '';
                    const nameSelectors = [
                        'h3[class*="product-brand"]',
                        'h4[class*="product-brand"]',
                        '[class*="product-brand"]',
                        '[class*="product-title"]',
                        'h3',
                        'h4',
                        'a[title]'
                    ];
                    
                    for (const sel of nameSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            name = elem.textContent?.trim() || elem.getAttribute('title') || '';
                            if (name && name.length > 3) break;
                        }
                    }
                    
                    // Try getting from link
                    if (!name || name.length < 3) {
                        const link = el.querySelector('a[href*="/p/"]') || el.closest('a[href*="/p/"]');
                        if (link) {
                            name = link.getAttribute('title') || link.textContent?.trim() || '';
                        }
                    }

                    // Find price
                    let price = '';
                    const priceSelectors = [
                        'span[class*="product-discountedPrice"]',
                        'span[class*="product-price"]',
                        '[class*="price"]',
                        '[class*="Price"]'
                    ];
                    
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            const text = elem.textContent?.trim() || '';
                            const priceMatch = text.match(/₹\s*(\d+)/) || text.match(/Rs\.?\s*(\d+)/i) || text.match(/(\d+)/);
                            if (priceMatch) {
                                const extractedPrice = parseInt(priceMatch[1]);
                                if (extractedPrice >= 10 && extractedPrice < 10000000) {
                                    price = extractedPrice.toString();
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Extract price from text if not found
                    if (!price) {
                        const text = el.textContent || '';
                        const priceMatches = text.matchAll(/₹\s*(\d{2,7})/g);
                        for (const match of priceMatches) {
                            const extractedPrice = parseInt(match[1]);
                            if (extractedPrice >= 10 && extractedPrice < 10000000) {
                                price = extractedPrice.toString();
                                break;
                            }
                        }
                    }

                    // Find original price (MRP)
                    let originalPrice = '';
                    const origPriceSelectors = [
                        'span[class*="product-strike"]',
                        '[class*="strike"]',
                        '[class*="mrp"]',
                        '[class*="MRP"]'
                    ];
                    for (const sel of origPriceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            const text = elem.textContent?.trim() || '';
                            const mrpMatch = text.match(/₹\s*(\d+)/) || text.match(/(\d+)/);
                            if (mrpMatch) {
                                originalPrice = mrpMatch[1];
                                break;
                            }
                        }
                    }

                    // Find image
                    const img = el.querySelector('img');
                    let imageUrl = '';
                    if (img) {
                        imageUrl = img.getAttribute('src') || 
                                  img.getAttribute('data-src') || 
                                  img.getAttribute('data-lazy-src') ||
                                  img.getAttribute('data-original') ||
                                  img.src || '';
                    }

                    // Find URL
                    const link = el.querySelector('a[href*="/p/"]') || el.closest('a[href*="/p/"]');
                    let url = '';
                    if (link) {
                        url = link.href || link.getAttribute('href') || '';
                    }
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.myntra.com' + url;
                    }

                    return { name, price, originalPrice, imageUrl, url };
                }).filter(p => {
                    if (!p || !p.name || !p.price) return false;
                    if (p.name.length < 3 || p.name.length > 200) return false;
                    const priceNum = parseInt(p.price);
                    if (!priceNum || priceNum < 10 || priceNum > 10000000) return false;
                    return true;
                });
            });

            console.log(`[Myntra] Found ${products.length} products`);

            await this.close();
            const formatted = products.map(p => this.formatProduct({ ...p, deliveryTime: 1440 }));
            console.log(`[Myntra] Returning ${formatted.length} formatted products`);
            return formatted;
        } catch (e) {
            console.error(`❌ [Myntra] Error: ${e.message}`);
            console.error(e.stack);
            try {
                await this.page.screenshot({ path: 'myntra-error.png', fullPage: true });
            } catch (screenshotError) { }
            await this.close();
            return [];
        }
    }
}

// ========== SCRAPER 11: SWIGGY (Scraping) ==========
class SwiggyScraper extends BaseScraper {
    constructor() { super('Swiggy', 'swiggy', 'food'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(`https://www.swiggy.com/search?query=${encodeURIComponent(query)}`, { 
                timeout: 20000,
                waitUntil: 'domcontentloaded' 
            });
            await this.delay(1500);

            // Scroll to load content
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
            });
            await this.delay(500);

            const products = await this.page.evaluate(() => {
                // Try multiple selectors for Swiggy restaurant cards
                const selectors = [
                    'a[href*="/restaurant/"]',
                    '[data-testid="restaurant-card"]',
                    '.sc-dlfnbm',
                    'div[class*="RestaurantCard"]',
                    'div[class*="restaurant"]'
                ];

                let items = [];
                for (const sel of selectors) {
                    items = Array.from(document.querySelectorAll(sel));
                    if (items.length > 0) break;
                }

                return items.slice(0, 10).map(el => {
                    // Find restaurant name
                    let name = '';
                    const nameSelectors = [
                        'h3',
                        '.sc-dlfnbm',
                        '[class*="name"]',
                        '[class*="Name"]',
                        'a[title]'
                    ];
                    for (const sel of nameSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            name = elem.textContent?.trim() || elem.getAttribute('title') || '';
                            if (name && name.length > 3) break;
                        }
                    }

                    // Find price (average cost or delivery time)
                    let price = '';
                    const priceSelectors = [
                        '[class*="cost"]',
                        '[class*="price"]',
                        '[class*="Cost"]',
                        'span[class*="rupee"]',
                        '[class*="min"]'
                    ];
                    for (const sel of priceSelectors) {
                        const elem = el.querySelector(sel);
                        if (elem) {
                            price = elem.textContent?.trim() || '';
                            if (price && /\d/.test(price)) break;
                        }
                    }
                    
                    // If no price found, try to extract from text content
                    if (!price || !/\d/.test(price)) {
                        const text = el.textContent || '';
                        const priceMatch = text.match(/₹\s*(\d+)/) || text.match(/(\d+)\s*for\s*two/i) || text.match(/min\s*(\d+)/i);
                        if (priceMatch) {
                            price = priceMatch[1];
                        } else {
                            // Default to 250 if no price found (average food order)
                            price = '250';
                        }
                    }

                    // Find image
                    const img = el.querySelector('img');
                    const imageUrl = img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || '';

                    // Find URL
                    const link = el.querySelector('a[href*="/restaurant/"]') || el.closest('a[href*="/restaurant/"]') || el;
                    let url = link?.href || '';
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.swiggy.com' + url;
                    }

                    return { name, price, imageUrl, url };
                }).filter(p => p.name && p.name.length > 3);
            });

            await this.close();
            return products.map(p => this.formatProduct({ ...p, deliveryTime: 25 }));
        } catch (e) {
            await this.close();
            console.error('Swiggy error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 12: TATA 1MG (Academic/demo scraping) ==========
// NOTE: Selectors are best-effort and may break if the site layout changes.
class Tata1MgScraper extends BaseScraper {
    constructor() { super('Tata 1mg', 'tata1mg', 'pharmacy'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(
                `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`,
                { timeout: 20000, waitUntil: 'domcontentloaded' }
            );
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                const cards = Array.from(
                    document.querySelectorAll(
                        'a[data-qa^="medicine_card"], a[href*="/drugs/"], a[href*="/otc/"], div[class*="ProductCard"], div[class*="product-card"]'
                    )
                );

                return cards.slice(0, 12).map((el) => {
                    // Container can be <a> or parent div
                    const container = el.closest('a') || el;

                    const nameEl =
                        container.querySelector('[data-qa="product_name"], h3, h2, .style__pro-title, [class*="name"]') ||
                        container;
                    const packEl =
                        container.querySelector('[data-qa="pack_size"], [class*="pack"], [class*="Pack"]') || null;
                    const priceEl =
                        container.querySelector('[data-qa="price"], [class*="price"], [class*="Price"]') || null;
                    const availEl =
                        container.querySelector('[data-qa*="availability"], [class*="stock"], [class*="availability"]') ||
                        null;
                    const img = container.querySelector('img');

                    const name = nameEl.textContent?.trim() || '';
                    const pack = packEl?.textContent?.trim() || '';
                    const priceText = priceEl?.textContent?.trim() || '';
                    const availability = availEl?.textContent?.trim() || 'See on Tata 1mg';
                    const imageUrl =
                        img?.getAttribute('src') ||
                        img?.getAttribute('data-src') ||
                        img?.getAttribute('data-lazy-src') ||
                        img?.src ||
                        '';

                    let url = container.getAttribute('href') || '';
                    if (!url && container.tagName === 'A') {
                        url = container.href || '';
                    }

                    return {
                        name,
                        price: priceText.replace(/[^0-9.]/g, ''),
                        imageUrl,
                        url,
                        unit: pack,
                        availability,
                    };
                }).filter((p) => p.name && p.price);
            });

            await this.close();
            return products.map((p) =>
                this.formatProduct({
                    ...p,
                    deliveryTime: 1440,
                    inStock: !/out of stock/i.test(p.availability || ''),
                })
            );
        } catch (e) {
            await this.close();
            console.error('Tata 1mg error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 13: PHARMEASY (Academic/demo scraping) ==========
class PharmEasyScraper extends BaseScraper {
    constructor() { super('PharmEasy', 'pharmeasy', 'pharmacy'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(
                `https://www.pharmeasy.in/search/all?name=${encodeURIComponent(query)}`,
                { timeout: 20000, waitUntil: 'domcontentloaded' }
            );
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                const cards = Array.from(
                    document.querySelectorAll(
                        'a[href*="/online-medicine-order/"], a[href*="/otc/"], div[class*="ProductCard"], div[class*="product-card"]'
                    )
                );

                return cards.slice(0, 12).map((el) => {
                    const container = el.closest('a') || el;

                    const nameEl =
                        container.querySelector('h1, h2, h3, [class*="title"], [class*="name"]') || container;
                    const packEl =
                        container.querySelector('[class*="pack"], [class*="Pack"], [data-qa*="pack"]') || null;
                    const priceEl =
                        container.querySelector('[class*="price"], [class*="Price"], [data-qa*="price"]') || null;
                    const availEl =
                        container.querySelector('[class*="stock"], [class*="availability"]') || null;
                    const img = container.querySelector('img');

                    const name = nameEl.textContent?.trim() || '';
                    const pack = packEl?.textContent?.trim() || '';
                    const priceText = priceEl?.textContent?.trim() || '';
                    const availability = availEl?.textContent?.trim() || 'See on PharmEasy';
                    const imageUrl =
                        img?.getAttribute('src') ||
                        img?.getAttribute('data-src') ||
                        img?.getAttribute('data-lazy-src') ||
                        img?.src ||
                        '';

                    let url = container.getAttribute('href') || '';
                    if (!url && container.tagName === 'A') {
                        url = container.href || '';
                    }

                    return {
                        name,
                        price: priceText.replace(/[^0-9.]/g, ''),
                        imageUrl,
                        url,
                        unit: pack,
                        availability,
                    };
                }).filter((p) => p.name && p.price);
            });

            await this.close();
            return products.map((p) =>
                this.formatProduct({
                    ...p,
                    deliveryTime: 1440,
                    inStock: !/out of stock/i.test(p.availability || ''),
                })
            );
        } catch (e) {
            await this.close();
            console.error('PharmEasy error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 14: NETMEDS (Academic/demo scraping) ==========
class NetmedsScraper extends BaseScraper {
    constructor() { super('Netmeds', 'netmeds', 'pharmacy'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(
                `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(query)}/all`,
                { timeout: 20000, waitUntil: 'domcontentloaded' }
            );
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                const cards = Array.from(
                    document.querySelectorAll(
                        '.cat-item, .product-list, div[class*="product"], a[href*="/prescriptions/"], a[href*="/non-prescriptions/"]'
                    )
                );

                return cards.slice(0, 12).map((el) => {
                    const container = el.closest('a') || el;

                    const nameEl =
                        container.querySelector('h3, h2, h1, [class*="name"], [class*="title"]') || container;
                    const packEl =
                        container.querySelector('[class*="pack"], [class*="Pack"], .drug-manu, .drug-varient') ||
                        null;
                    const priceEl =
                        container.querySelector('[class*="price"], [class*="Price"], .final-price') || null;
                    const availEl =
                        container.querySelector('[class*="stock"], [class*="availability"]') || null;
                    const img = container.querySelector('img');

                    const name = nameEl.textContent?.trim() || '';
                    const pack = packEl?.textContent?.trim() || '';
                    const priceText = priceEl?.textContent?.trim() || '';
                    const availability = availEl?.textContent?.trim() || 'See on Netmeds';
                    const imageUrl =
                        img?.getAttribute('src') ||
                        img?.getAttribute('data-src') ||
                        img?.getAttribute('data-lazy-src') ||
                        img?.src ||
                        '';

                    let url = container.getAttribute('href') || '';
                    if (!url && container.tagName === 'A') {
                        url = container.href || '';
                    }

                    return {
                        name,
                        price: priceText.replace(/[^0-9.]/g, ''),
                        imageUrl,
                        url,
                        unit: pack,
                        availability,
                    };
                }).filter((p) => p.name && p.price);
            });

            await this.close();
            return products.map((p) =>
                this.formatProduct({
                    ...p,
                    deliveryTime: 1440,
                    inStock: !/out of stock/i.test(p.availability || ''),
                })
            );
        } catch (e) {
            await this.close();
            console.error('Netmeds error:', e.message);
            return [];
        }
    }
}

// ========== SCRAPER 15: APOLLO PHARMACY (Academic/demo scraping) ==========
class ApolloScraper extends BaseScraper {
    constructor() { super('Apollo Pharmacy', 'apollo', 'pharmacy'); }

    async scrape(query) {
        try {
            await this.initialize();
            await this.page.goto(
                `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(query)}`,
                { timeout: 20000, waitUntil: 'domcontentloaded' }
            );
            await this.delay(1500);

            const products = await this.page.evaluate(() => {
                const cards = Array.from(
                    document.querySelectorAll(
                        'a[href*="/otc/"], a[href*="/prescription/"], div[class*="ProductCard"], div[class*="product-card"]'
                    )
                );

                return cards.slice(0, 12).map((el) => {
                    const container = el.closest('a') || el;

                    const nameEl =
                        container.querySelector('h2, h3, [class*="name"], [class*="title"]') || container;
                    const packEl =
                        container.querySelector('[class*="pack"], [class*="Pack"], [data-qa*="pack"]') || null;
                    const priceEl =
                        container.querySelector('[class*="price"], [class*="Price"], [data-qa*="price"]') || null;
                    const availEl =
                        container.querySelector('[class*="stock"], [class*="availability"]') || null;
                    const img = container.querySelector('img');

                    const name = nameEl.textContent?.trim() || '';
                    const pack = packEl?.textContent?.trim() || '';
                    const priceText = priceEl?.textContent?.trim() || '';
                    const availability = availEl?.textContent?.trim() || 'See on Apollo Pharmacy';
                    const imageUrl =
                        img?.getAttribute('src') ||
                        img?.getAttribute('data-src') ||
                        img?.getAttribute('data-lazy-src') ||
                        img?.src ||
                        '';

                    let url = container.getAttribute('href') || '';
                    if (!url && container.tagName === 'A') {
                        url = container.href || '';
                    }

                    return {
                        name,
                        price: priceText.replace(/[^0-9.]/g, ''),
                        imageUrl,
                        url,
                        unit: pack,
                        availability,
                    };
                }).filter((p) => p.name && p.price);
            });

            await this.close();
            return products.map((p) =>
                this.formatProduct({
                    ...p,
                    deliveryTime: 1440,
                    inStock: !/out of stock/i.test(p.availability || ''),
                })
            );
        } catch (e) {
            await this.close();
            console.error('Apollo Pharmacy error:', e.message);
            return [];
        }
    }
}

// Export all scrapers
module.exports = {
    dmart: DMartScraper,
    bigbasket: BigBasketScraper,
    jiomart: JioMartScraper,
    reliancesmart: RelianceSmartScraper,
    amazon: AmazonScraper,
    flipkart: FlipkartScraper,
    meesho: MeeshoScraper,
    myntra: MyntraScraper,
    blinkit: BlinkitScraper,
    zomato: ZomatoScraper,
    swiggy: SwiggyScraper,
    tata1mg: Tata1MgScraper,
    pharmeasy: PharmEasyScraper,
    netmeds: NetmedsScraper,
    apollo: ApolloScraper,
};