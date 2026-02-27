const ScraperFactory = require('./scraper-factory');
const allScrapers = require('./all-scrapers');

// Platforms to use for medicine comparison
const PHARMACY_STORES = ['tata1mg', 'pharmeasy', 'netmeds'];

function isBarcode(query) {
  const trimmed = (query || '').trim();
  return /^\d{9,}$/.test(trimmed);
}

async function scrapeStore(storeId, query) {
  try {
    const ScraperClass = allScrapers[storeId];
    if (!ScraperClass) {
      throw new Error(`Unknown pharmacy store: ${storeId}`);
    }
    const scraper = new ScraperClass();
    const products = await scraper.scrape(query);

    if (!Array.isArray(products) || products.length === 0) {
      return null;
    }

    const first = products[0];
    const price = Number(first.price) || 0;
    if (!price) return null;

    const mrp = first.originalPrice != null ? Number(first.originalPrice) : null;
    let discount = null;
    if (mrp && mrp > price) {
      discount = Math.round(((mrp - price) / mrp) * 100);
    }

    return {
      platform: first.storeName || storeId,
      price,
      mrp,
      discount,
      link: first.url,
      name: first.name,
    };
  } catch (error) {
    console.error(`❌ Medicine scrape failed for ${storeId}:`, error.message);
    return null;
  }
}

async function searchMedicine(req, res) {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Field "query" is required in request body.' });
    }

    const trimmed = query.trim();
    const barcode = isBarcode(trimmed);
    const searchQuery = trimmed; // For now we pass the same query to all sites

    console.log(
      `💊 Medicine search: "${searchQuery}" (${barcode ? 'barcode' : 'name'}) across ${PHARMACY_STORES.length} stores.`
    );

    const results = await Promise.all(
      PHARMACY_STORES.map((storeId) => scrapeStore(storeId, searchQuery))
    );

    const valid = results.filter(Boolean);
    if (!valid.length) {
      return res.json({
        error: 'Unable to fetch live prices at the moment. Please try again later.',
      });
    }

    const medicineName = valid.find((r) => r.name)?.name || searchQuery;

    const prices = valid.map((r) => r.price);
    const cheapest = valid.reduce((min, r) => (r.price < min.price ? r : min), valid[0]);
    const highestPrice = Math.max(...prices);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    return res.json({
      medicine: medicineName,
      cheapest: {
        platform: cheapest.platform,
        price: cheapest.price,
        link: cheapest.link,
      },
      highestPrice,
      averagePrice: Number(averagePrice.toFixed(2)),
      allPrices: valid.map((r) => ({
        platform: r.platform,
        price: r.price,
        mrp: r.mrp,
        discount: r.discount,
        link: r.link,
      })),
    });
  } catch (error) {
    console.error('❌ /api/medicine/search error:', error);
    return res.json({
      error: 'Unable to fetch live prices at the moment. Please try again later.',
    });
  }
}

module.exports = {
  searchMedicine,
};

