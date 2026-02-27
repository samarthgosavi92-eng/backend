const {
  fetchProductPage,
  extractProductDetails,
} = require('./product-page-scraper');
const { supabase } = require('./supabase');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Deal score: start 50
 * If current <= lowest → +30
 * If current <= average → +15
 * If current > average → -10
 * If current > highest → -30
 * Clamp between 0 and 100.
 */
function computeDealScore(currentPrice, lowest, average, highest) {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return 50;
  }
  let score = 50;
  if (lowest != null && currentPrice <= lowest) score += 30;
  if (average != null && currentPrice <= average) score += 15;
  if (average != null && currentPrice > average) score -= 10;
  if (highest != null && currentPrice > highest) score -= 30;
  return clamp(score, 0, 100);
}

async function findOrCreateProduct(title, platform) {
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('title', title)
    .eq('platform', platform)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from('products')
    .insert({ title, platform })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert product: ${error.message}`);
  return inserted.id;
}

async function analyzeProductDealFromUrl(url) {
  let expandedUrl = url;
  if (url.includes('amzn.in') || url.includes('amzn.to')) {
    try {
      const axios = require('axios');
      const response = await axios.get(url, {
        maxRedirects: 5,
        validateStatus: () => true,
        timeout: 10000,
      });
      expandedUrl =
        response.request?.res?.responseURL ||
        response.request?.responseURL ||
        response.config?.url ||
        url;
      console.log('Expanded URL:', expandedUrl);
    } catch (error) {
      console.warn('Could not expand shortened URL, using original:', error.message);
      expandedUrl = url;
    }
  }

  const pageData = await fetchProductPage(expandedUrl);
  const details = await extractProductDetails(expandedUrl, pageData);

  if (!details.name || details.currentPrice == null) {
    throw new Error('Could not extract product details from the link. Try a different product URL.');
  }

  const title = details.name.trim();
  const platform = details.platform || 'Unknown';
  const currentPrice = Number(details.currentPrice);

  const productId = await findOrCreateProduct(title, platform);

  const { error: insertPriceError } = await supabase
    .from('price_history')
    .insert({ product_id: productId, price: currentPrice });

  if (insertPriceError) throw new Error(`Failed to insert price: ${insertPriceError.message}`);

  const { data: historyRows, error: historyError } = await supabase
    .from('price_history')
    .select('price, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (historyError) throw new Error(`Failed to fetch price history: ${historyError.message}`);

  const prices = (historyRows || []).map((r) => (r.price != null ? Number(r.price) : null)).filter((p) => p != null && p > 0);
  const highestPrice = prices.length ? Math.max(...prices) : null;
  const lowestPrice = prices.length ? Math.min(...prices) : null;
  const averagePrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  const dealScore = computeDealScore(currentPrice, lowestPrice, averagePrice, highestPrice);

  const history = (historyRows || []).map((r) => ({
    date: r.created_at,
    price: r.price != null ? Number(r.price) : null,
  }));

  return {
    title,
    platform,
    currentPrice,
    highestPrice,
    lowestPrice,
    averagePrice,
    dealScore,
    history,
  };
}

module.exports = { analyzeProductDealFromUrl };
