// DealSense analyzer
// Academic prototype: uses BuyHatke price history pages via Axios + Cheerio.
// Flow:
// 1. User pastes Amazon / Flipkart URL.
// 2. Backend builds BuyHatke URL by prepending "https://buyhatke.com/".
// 3. Fetch HTML, parse price summary + date-wise history.
// 4. Return clean JSON to Flutter (no BuyHatke branding).

const axios = require('axios');
const cheerio = require('cheerio');
const { fetchProductPage, extractProductDetails } = require('./product-page-scraper');

function buildBuyHatkeUrl(productUrl) {
  const trimmed = productUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Please paste the full product URL from your browser (e.g. https://www.flipkart.com/... or https://www.amazon.in/...). The link must start with http or https.');
  }
  const lower = trimmed.toLowerCase();
  if (!lower.includes('flipkart') && !lower.includes('amazon') && !lower.includes('myntra')) {
    throw new Error('DealSense supports Flipkart, Amazon, and Myntra only. Please use a product page URL from one of these sites.');
  }
  // BuyHatke supports the "magic trick": prepend buyhatke.com/ before the product link.
  return `https://buyhatke.com/${trimmed}`;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.toString().replace(/[^\d.]/g, '');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function classifyDealQuality({ currentPrice, lowestEver, averagePrice }) {
  // Gracefully handle partial data:
  // - If we have a clear all‑time low, compare against that.
  // - If we only have an average, compare against the average.
  // - If we only have current price, we can't say much.
  if (!currentPrice) return 'Unknown';

  if (lowestEver != null) {
    if (currentPrice <= lowestEver * 1.05) return 'Good'; // within 5% of all‑time low
    if (currentPrice <= lowestEver * 1.25) return 'Average'; // not too far from low
  }

  if (averagePrice != null) {
    if (currentPrice <= averagePrice * 0.95) return 'Good'; // clearly below average
    if (currentPrice <= averagePrice * 1.05) return 'Average'; // near average
  }

  // If we only know the current price or it's far from known lows/averages.
  return 'Bad';
}

// Cheerio 1.x does not support :contains(). Use regex on body text to extract labeled values.
function extractLabeledValue($, labelPattern, valueRegex) {
  const bodyText = $('body').text();
  const labelRegex = new RegExp(labelPattern, 'i');
  const match = bodyText.match(labelRegex);
  if (!match) return null;
  const start = match.index + match[0].length;
  const afterLabel = bodyText.slice(start, start + 80);
  const valueRegexToUse = valueRegex || /₹?\s*([\d,]+(?:\.\d+)?)/;
  const valueMatch = afterLabel.match(valueRegexToUse);
  return valueMatch ? valueMatch[1].replace(/,/g, '') : null;
}

function getCurrentPriceText($) {
  return (
    extractLabeledValue($, 'Current\\s+Price', /₹?\s*([\d,]+(?:\.\d+)?)/) ||
    extractLabeledValue($, 'Price\\s*[:\s]', /₹?\s*([\d,]+(?:\.\d+)?)/)
  );
}
function getLowestPriceText($) {
  return extractLabeledValue($, 'Lowest\\s+Price\\s+Ever', /₹?\s*([\d,]+(?:\.\d+)?)/);
}
function getHighestPriceText($) {
  return extractLabeledValue($, 'Highest\\s+Price\\s+Ever', /₹?\s*([\d,]+(?:\.\d+)?)/);
}
function getAveragePriceText($) {
  return extractLabeledValue($, 'Average\\s+Price', /₹?\s*([\d,]+(?:\.\d+)?)/);
}

function extractHistoryTable($) {
  // Many price-history UIs render a table with Date / Price style columns.
  // We look for any table whose header row contains "Date" and "Price".
  const tables = $('table');
  const points = [];

  tables.each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('thead, tr').first().text().toLowerCase();
    if (!headerText.includes('date') || !headerText.includes('price')) return;

    $table
      .find('tbody tr')
      .each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;
        const dateText = $(cells[0]).text().trim();
        const priceText = $(cells[1]).text().trim();

        const price = parsePrice(priceText);
        if (!price) return;

        const date = new Date(dateText);
        const ts = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();

        points.push({
          date: dateText,
          ts,
          price,
        });
      });
  });

  return points;
}

async function analyzeDealSenseFromUrl(productUrl) {
  const buyHatkeUrl = buildBuyHatkeUrl(productUrl);

  const response = await axios.get(buyHatkeUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 15000,
  });

  const html = response.data;
  const $ = cheerio.load(html);

  // Try to get a decent product title for the UI; fallback to document title.
  let name =
    $('h1').first().text().trim() ||
    $('h2').first().text().trim() ||
    $('title').first().text().trim() ||
    'Product';

  const productUrlLower = productUrl.toLowerCase();
  let platform = productUrlLower.includes('amazon')
    ? 'Amazon'
    : productUrlLower.includes('flipkart')
    ? 'Flipkart'
    : productUrlLower.includes('myntra')
    ? 'Myntra'
    : '';
  let brand = '';
  let imageUrl = '';

  const currentPriceText = getCurrentPriceText($);
  const lowestPriceText = getLowestPriceText($);
  const highestPriceText = getHighestPriceText($);
  const averagePriceText = getAveragePriceText($);

  let currentPrice = parsePrice(currentPriceText);
  let lowestPriceEver = parsePrice(lowestPriceText);
  let highestPriceEver = parsePrice(highestPriceText);
  let averagePrice = parsePrice(averagePriceText);

  const historyPoints = extractHistoryTable($);

  // Also scrape the actual product page (Amazon / Flipkart) to get the
  // real current price, name, brand and image that the user sees on the
  // store itself. This runs in addition to the deal page scraping so we
  // can still use any available history information.
  try {
    const pageData = await fetchProductPage(productUrl);
    const details = await extractProductDetails(productUrl, pageData);
    if (details) {
      const scrapedPlatform = details.platform && details.platform !== 'Unknown' ? details.platform : platform;
      const scrapedPrice = details.currentPrice;

      console.log('Platform:', scrapedPlatform);
      console.log('Final scraped price:', scrapedPrice);

      if (scrapedPrice != null) {
        if (scrapedPrice < 1000) {
          throw new Error('Invalid price detected');
        }
        currentPrice = scrapedPrice;
        if (historyPoints.length > 0) {
          historyPoints[historyPoints.length - 1].price = currentPrice;
        }
      }
      if (details.name) name = details.name;
      if (details.brand) brand = details.brand;
      if (details.imageUrl) imageUrl = details.imageUrl;
      if (details.platform && details.platform !== 'Unknown') platform = details.platform;
    }
  } catch (e) {
    console.error('DealSense product-page scrape failed:', e.message);
  }

  // Fallback: if no labeled current price, use first price from history or first ₹ in body
  if (!currentPrice && historyPoints.length > 0) {
    const fromHistory = historyPoints.find((p) => p.price >= 1000);
    if (fromHistory) currentPrice = fromHistory.price;
  }
  if (!currentPrice) {
    const firstPriceMatch = $('body').text().match(/₹\s*([\d,]+(?:\.\d+)?)/);
    if (firstPriceMatch) {
      const p = parseFloat(firstPriceMatch[1].replace(/,/g, ''));
      if (p >= 1000) currentPrice = p;
    }
  }
  if (!currentPrice) {
    throw new Error('Could not read the product price. Use the full product page URL (copy from the browser address bar, e.g. https://www.flipkart.com/...). If the URL is correct, try again in a moment—the page may be slow to load.');
  }

  // If we didn't get any history from the page, synthesise a minimal history
  // using today's date and the current price – this keeps the chart and
  // summary cards functional for pages without explicit history tables.
  if (historyPoints.length === 0) {
    const now = Date.now();
    historyPoints.push({
      date: new Date(now).toISOString().slice(0, 10),
      ts: now,
      price: currentPrice,
    });
  }

  if (averagePrice == null && historyPoints.length > 0) {
    const sum = historyPoints.reduce((s, p) => s + p.price, 0);
    averagePrice = sum / historyPoints.length;
  }

  // Derive lowest / highest from history when labels are missing.
  const historyPrices = historyPoints.map((p) => p.price);
  const historyMin = Math.min(...historyPrices);
  const historyMax = Math.max(...historyPrices);
  if (lowestPriceEver == null) lowestPriceEver = historyMin;
  if (highestPriceEver == null) highestPriceEver = historyMax;

  const dealQuality = classifyDealQuality({
    currentPrice,
    lowestEver: lowestPriceEver,
    averagePrice,
  });

  // Convert history points into a "trends" array compatible with the existing Flutter chart.
  const trendsMax = historyPoints.map((p) => ({
    ts: p.ts,
    price: p.price,
  }));

  // Build explanation bullets for the UI (no external branding).
  const explanationBullets = [];
  if (lowestPriceEver != null) {
    const pct = ((currentPrice - lowestPriceEver) / lowestPriceEver * 100).toFixed(0);
    if (dealQuality === 'Good') {
      explanationBullets.push(`Current price is within 5% of the lowest ever (₹${Math.round(lowestPriceEver)}).`);
    } else if (dealQuality === 'Average') {
      explanationBullets.push(`Current price (₹${Math.round(currentPrice)}) is near the historical average.`);
    } else {
      explanationBullets.push(`Current price is ${pct}% above the lowest ever (₹${Math.round(lowestPriceEver)}).`);
    }
  }
  if (highestPriceEver != null && currentPrice < highestPriceEver) {
    explanationBullets.push(`Price has dropped from a high of ₹${Math.round(highestPriceEver)}.`);
  }
  if (historyPoints.length > 0) {
    explanationBullets.push(`Based on ${historyPoints.length} historical data points.`);
  }
  if (explanationBullets.length === 0) {
    explanationBullets.push('Verdict is based on current vs. lowest and average price.');
  }

  return {
    inputUrl: productUrl,
    product: {
      name,
      brand,
      platform,
      imageUrl,
      currentPrice,
    },
    summary: {
      currentPrice,
      lowestPriceEver,
      highestPriceEver,
      averagePrice,
      dealQuality,
    },
    history: {
      lowestEver: lowestPriceEver,
      highestPrice: highestPriceEver,
      averagePrice,
      lastSalePrice: currentPrice,
      points: historyPoints,
      trends: {
        max: trendsMax,
      },
    },
    explanationBullets,
  };
}

module.exports = {
  analyzeDealSenseFromUrl,
};

