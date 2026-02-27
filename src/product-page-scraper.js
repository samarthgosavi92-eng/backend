const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function resolveChromeExecutablePath() {
  // Check environment variable first (set by Docker/Railway)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
  }
  if (process.env.CHROME_PATH) {
    if (fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
  }
  const candidates = [
    // Windows paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    // Mac paths
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux paths (Docker/Railway)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const puppeteerFull = require('puppeteer');
    const chromiumPath = puppeteerFull.executablePath();
    if (chromiumPath) return chromiumPath;
  } catch {
    // ignore
  }
  return null;
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some pages include invalid JSON-LD (multiple objects without array).
      // Best-effort: try to wrap in array if it looks like concatenated objects.
      try {
        const fixed = raw.replace(/}\s*{/g, '},{');
        blocks.push(JSON.parse(`[${fixed}]`));
      } catch {
        // ignore
      }
    }
  }
  return blocks.flat();
}

function extractMeta(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function parseMoneyToNumber(input) {
  if (input == null) return null;
  const s = String(input).replace(/,/g, '').replace(/[^\d.]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('myntra.')) return 'Myntra';
  if (u.includes('flipkart.')) return 'Flipkart';
  if (u.includes('amazon.') || u.includes('amzn.')) return 'Amazon';
  if (u.includes('ajio.')) return 'Ajio';
  return 'Unknown';
}

function buildProductKey(platform, url) {
  // keep it stable and filesystem-safe-ish
  return `${platform}:${url}`.toLowerCase();
}

function pickProductFromJsonLd(jsonLdBlocks) {
  const candidates = [];
  for (const obj of jsonLdBlocks) {
    if (!obj) continue;
    if (obj['@type'] === 'Product') candidates.push(obj);
    if (Array.isArray(obj['@graph'])) {
      for (const g of obj['@graph']) {
        if (g && g['@type'] === 'Product') candidates.push(g);
      }
    }
  }
  return candidates[0] || null;
}

function extractOffer(productJsonLd) {
  if (!productJsonLd) return null;
  const offers = productJsonLd.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) return offers[0] || null;
  return offers;
}

async function extractProductDetails(url, htmlOrPageData) {
  const platform = detectPlatform(url);
  
  // Handle both old format (html string) and new format ({html, page, browser})
  let html, page, browser;
  if (typeof htmlOrPageData === 'string') {
    html = htmlOrPageData;
  } else {
    html = htmlOrPageData.html;
    page = htmlOrPageData.page;
    browser = htmlOrPageData.browser;
  }

  const jsonLd = extractJsonLd(html);
  const product = pickProductFromJsonLd(jsonLd);
  const offer = extractOffer(product);

  let name = product?.name || extractMeta(html, 'og:title') || null;
  let brand = (typeof product?.brand === 'string' ? product.brand : product?.brand?.name) || null;
  let imageUrl = (Array.isArray(product?.image) ? product.image[0] : product?.image) || extractMeta(html, 'og:image') || null;

  let currentPrice =
    parseMoneyToNumber(offer?.price) ??
    parseMoneyToNumber(offer?.lowPrice) ??
    null;

  const currency = offer?.priceCurrency || 'INR';

  // MRP is rarely available in JSON-LD; attempt to infer for known platforms via patterns.
  let mrp =
    parseMoneyToNumber(offer?.highPrice) ??
    null;

  // Always use DOM for Flipkart (real-time price from script/DOM); for others when JSON-LD failed or price wrong
  const needDOM = page && (
    platform === 'Flipkart' ||
    !name ||
    !currentPrice ||
    (currentPrice < 1000 && ['Amazon', 'Flipkart', 'Myntra'].includes(platform))
  );
  if (needDOM) {
    try {
      const domData = await extractFromDOM(page, platform);
      if (domData) {
        if (!name && domData.name) name = domData.name;
        if (domData.price != null && (platform === 'Flipkart' || !currentPrice || currentPrice < 1000)) currentPrice = domData.price;
        if (!mrp && domData.mrp) mrp = domData.mrp;
        if (!imageUrl && domData.imageUrl) imageUrl = domData.imageUrl;
        if (!brand && domData.brand) brand = domData.brand;
      }
    } catch (error) {
      console.error('DOM fallback extraction error:', error);
    }
  }

  // Close browser if it was opened
  if (browser) {
    await browser.close();
  }

  return {
    platform,
    name,
    brand,
    imageUrl,
    currentPrice,
    mrp,
    currency,
  };
}

async function extractFromDOM(page, platform) {
  if (!['Amazon', 'Flipkart', 'Myntra'].includes(platform)) return null;
  
  try {
    return await page.evaluate((platform) => {
      let name = '', price = null, mrp = null, imageUrl = '', brand = '';

      if (platform === 'Amazon') {
        // Amazon selectors
        const nameSelectors = [
          '#productTitle',
          'h1.a-size-large',
          'h1[data-automation-id="title"]',
          'span#productTitle',
          'h1 span',
          '[data-automation-id="title"]'
        ];
        for (const sel of nameSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            name = elem.textContent?.trim() || '';
            if (name && name.length > 5) break;
          }
        }

        // Main product price only – try in order to avoid delivery/EMI/accessory
        const priceSelectors = [
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '.a-price .a-offscreen',
          '.a-price[data-a-color="base"] .a-offscreen',
          '[data-a-color="price"] .a-offscreen',
          '.a-price-whole',
          'span.a-price-whole',
          '#priceblock_saleprice'
        ];
        for (const sel of priceSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            const priceText = (elem.textContent || elem.getAttribute('aria-label') || '').trim().replace(/₹/g, '').replace(/,/g, '');
            const priceMatch = priceText.match(/(\d+(?:\.\d+)?)/);
            if (priceMatch) {
              const p = parseFloat(priceMatch[1]);
              if (p > 0) { price = p; break; }
            }
          }
        }

        const mrpSelectors = [
          '.basisPrice .a-offscreen',
          '.a-text-price .a-offscreen',
          '#priceblock_saleprice + .a-text-price .a-offscreen',
          '.a-price.a-text-price .a-offscreen'
        ];
        for (const sel of mrpSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            const mrpText = elem.textContent?.trim() || elem.getAttribute('aria-label') || '';
            const mrpMatch = mrpText.replace(/,/g, '').match(/(\d+)/);
            if (mrpMatch) {
              mrp = parseFloat(mrpMatch[1]);
              if (mrp > 0) break;
            }
          }
        }

        const imageSelectors = [
          '#landingImage',
          '#imgBlkFront',
          '#main-image',
          'img[data-a-image-name="landingImage"]',
          '#product-image img'
        ];
        for (const sel of imageSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            imageUrl = elem.getAttribute('src') || elem.getAttribute('data-src') || '';
            if (imageUrl && imageUrl.includes('http')) break;
          }
        }

        const brandSelectors = [
          '#brand',
          'a#brand',
          '[data-brand]',
          '.po-brand .po-break-word'
        ];
        for (const sel of brandSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            brand = elem.textContent?.trim() || elem.getAttribute('data-brand') || '';
            if (brand && brand.length > 1) break;
          }
        }
      } else if (platform === 'Flipkart') {
        // Flipkart selectors
        const nameSelectors = [
          'h1[class*="B_NuCI"]',
          'span[class*="B_NuCI"]',
          'h1',
          '.B_NuCI',
          '[class*="product-title"]'
        ];
        for (const sel of nameSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            name = elem.textContent?.trim() || '';
            if (name && name.length > 5) break;
          }
        }

        // 1) Try script tags first – Flipkart embeds real product price in JSON (avoids DOM noise)
        var scriptPrices = [];
        var scripts = document.querySelectorAll('script');
        var keyPatterns = [
          /"current_selling_price"\s*:\s*(\d+)/g,
          /"selling_price"\s*:\s*(\d+)/g,
          /"actualPrice"\s*:\s*(\d+)/g,
          /"salePrice"\s*:\s*(\d+)/g,
          /"price"\s*:\s*(\d+)/g,
          /"final_price"\s*:\s*(\d+)/g
        ];
        for (var s = 0; s < scripts.length; s++) {
          var text = scripts[s].textContent || '';
          for (var k = 0; k < keyPatterns.length; k++) {
            keyPatterns[k].lastIndex = 0;
            var m;
            while ((m = keyPatterns[k].exec(text)) !== null) {
              var num = parseFloat(m[1]);
              if (num > 1000) scriptPrices.push(num);
            }
          }
        }
        if (scriptPrices.length > 0) price = Math.max.apply(null, scriptPrices);
        // 2) DOM: only consider prices > 1000 (main product), ignore delivery/EMI (e.g. 200)
        if (price == null) {
          var priceSelectors = ['div._30jeq3._16Jk6d', 'div._30jeq3', 'div[class*="_30jeq3"]'];
          var candidates = [];
          for (var ps = 0; ps < priceSelectors.length; ps++) {
            var elems = document.querySelectorAll(priceSelectors[ps]);
            for (var e = 0; e < elems.length; e++) {
              var elem = elems[e];
              var priceText = elem.textContent?.trim() || '';
              if (!priceText.includes('₹')) continue;
              var cleaned = priceText.replace(/₹/g, '').replace(/,/g, '').trim();
              var match = cleaned.match(/(\d+)/);
              if (match) {
                var p = parseFloat(match[1]);
                if (p > 1000) candidates.push(p);
              }
            }
          }
          if (candidates.length > 0) price = Math.max.apply(null, candidates);
        }

        const mrpSelectors = [
          'div[class*="_3I9_wc"]',
          '[class*="original-price"]',
          '.CEmiEU ._3I9_wc'
        ];
        for (const sel of mrpSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            const mrpText = elem.textContent?.trim() || '';
            const mrpMatch = mrpText.replace(/,/g, '').replace(/₹/g, '').match(/(\d+)/);
            if (mrpMatch) {
              mrp = parseFloat(mrpMatch[1]);
              if (mrp > 0) break;
            }
          }
        }

        const imageSelectors = [
          'img[class*="_396cs4"]',
          '.CXW8mj img',
          '#container img',
          'img[alt*="product"]'
        ];
        for (const sel of imageSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            imageUrl = elem.getAttribute('src') || elem.getAttribute('data-src') || '';
            if (imageUrl && imageUrl.includes('http')) break;
          }
        }
      } else if (platform === 'Myntra') {
        // Myntra selectors
        const nameSelectors = [
          'h1[class*="pdp-title"]',
          'h1[class*="pdp-name"]',
          'h1',
          '[class*="pdp-title"]',
          '[class*="product-title"]'
        ];
        for (const sel of nameSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            name = elem.textContent?.trim() || '';
            if (name && name.length > 5) break;
          }
        }

        // Main product price – prefer pdp-price elements only
        const priceSelectors = ['span.pdp-price strong', 'span.pdp-price', 'div.pdp-price'];
        for (const sel of priceSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            const priceText = (elem.textContent || '').trim().replace(/₹/g, '').replace(/,/g, '');
            const priceMatch = priceText.match(/(\d+)/);
            if (priceMatch) {
              const p = parseFloat(priceMatch[1]);
              if (p > 0) { price = p; break; }
            }
          }
        }

        const mrpSelectors = [
          'span[class*="pdp-mrp"]',
          '[class*="original-price"]',
          '.pdp-mrp'
        ];
        for (const sel of mrpSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            const mrpText = elem.textContent?.trim() || '';
            const mrpMatch = mrpText.replace(/,/g, '').replace(/₹/g, '').match(/(\d+)/);
            if (mrpMatch) {
              mrp = parseFloat(mrpMatch[1]);
              if (mrp > 0) break;
            }
          }
        }

        const imageSelectors = [
          'img[class*="image-grid-image"]',
          '.image-grid img',
          '#mountRoot img',
          'img[alt*="product"]'
        ];
        for (const sel of imageSelectors) {
          const elem = document.querySelector(sel);
          if (elem) {
            imageUrl = elem.getAttribute('src') || elem.getAttribute('data-src') || '';
            if (imageUrl && imageUrl.includes('http')) break;
          }
        }
      }

      return { name, price, mrp, imageUrl, brand };
    }, platform);
  } catch (error) {
    console.error('DOM extraction error:', error);
    return null;
  }
}

async function fetchProductPage(url) {
  const executablePath = await resolveChromeExecutablePath();
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1366,768',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreHTTPSErrors: true,
  };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en;q=0.9' });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4000));
    if (url.toLowerCase().includes('flipkart')) await new Promise((r) => setTimeout(r, 2000));
    const html = await page.content();
    return { html, page, browser };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

module.exports = {
  detectPlatform,
  buildProductKey,
  fetchProductPage,
  extractProductDetails,
  parseMoneyToNumber,
};

