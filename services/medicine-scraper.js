/**
 * Medicine price scraper using axios + cheerio only.
 * Scrapes pharmacy search pages; skips a site without crashing if it fails.
 */

const axios = require('axios');
const cheerio = require('cheerio');

const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Clean price string and convert to number. Returns null if invalid.
 */
function parsePrice(value) {
  if (value == null) return null;
  const str = String(value)
    .replace(/[₹,]/g, '')
    .replace(/\s/g, '')
    .trim();
  const match = str.match(/[\d.]+/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Site config: search URL and cheerio selectors for first result price.
 * Selectors are tried in order; first non-null price wins.
 */
const SITES = [
  {
    id: '1mg',
    name: '1mg',
    url: (q) => `https://www.1mg.com/search/all?name=${encodeURIComponent(q)}`,
    selectors: [
      '[data-testid="price"]',
      '.style__price___D2ysu',
      '.DrugPriceBox__price___2hYXb',
      '.price',
      '[class*="price"]',
    ],
  },
  {
    id: 'netmeds',
    name: 'Netmeds',
    url: (q) => `https://www.netmeds.com/catalogsearch/result?q=${encodeURIComponent(q)}`,
    selectors: [
      '[data-price]',
      '.final_price',
      '.price',
      '[class*="Price"]',
      '[class*="price"]',
    ],
  },
  {
    id: 'pharmeasy',
    name: 'PharmEasy',
    url: (q) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(q)}`,
    selectors: [
      '[data-testid="price"]',
      '.ProductCard_ourPrice__yDEPT',
      '[class*="price"]',
      '.price',
    ],
  },
  {
    id: 'apollo',
    name: 'Apollo Pharmacy',
    url: (q) =>
      `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(q)}`,
    selectors: [
      '[data-price]',
      '.ProductCard_price__',
      '[class*="price"]',
      '.price',
    ],
  },
];

/**
 * Scrape one site: fetch HTML, parse with cheerio, extract first valid price.
 * Returns { site, price } or null on failure.
 */
async function scrapeOneSite(siteConfig, medicineName) {
  const { id, name, url, selectors } = siteConfig;
  try {
    const response = await axios.get(url(medicineName), {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (!response.data || typeof response.data !== 'string') {
      console.warn(`[DealScan] ${name}: no HTML body`);
      return null;
    }

    const $ = cheerio.load(response.data);

    for (const sel of selectors) {
      try {
        const el = $(sel).first();
        if (!el.length) continue;

        let price = null;
        const dataPrice = el.attr('data-price');
        if (dataPrice != null) {
          price = parsePrice(dataPrice);
        }
        if (price == null) {
          const text = el.text().trim();
          price = parsePrice(text);
        }
        if (price != null && price > 0) {
          return { site: name, siteId: id, price };
        }
      } catch {
        continue;
      }
    }

    console.warn(`[DealScan] ${name}: no price found with selectors`);
    return null;
  } catch (error) {
    console.warn(`[DealScan] ${name}: scrape failed`, error.message || error.code || error);
    return null;
  }
}

/**
 * Scrape all configured sites in parallel. Returns array of { site, price } (valid only).
 */
async function scrapeMedicinePrices(medicineName) {
  const trimmed = (medicineName || '').trim();
  if (!trimmed) {
    return [];
  }

  const results = await Promise.all(
    SITES.map((config) => scrapeOneSite(config, trimmed))
  );

  const valid = results.filter(
    (r) => r != null && r.price != null && Number(r.price) > 0
  );

  return valid.map((r) => ({
    site: r.site,
    siteId: r.siteId || r.site,
    price: Number(r.price),
  }));
}

module.exports = {
  scrapeMedicinePrices,
  parsePrice,
};
