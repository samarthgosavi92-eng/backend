const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'price-history.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify({ products: {} }, null, 2));
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { products: {} };
    if (!parsed.products || typeof parsed.products !== 'object') parsed.products = {};
    return parsed;
  } catch {
    return { products: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(store, null, 2));
}

function upsertPricePoint(productKey, point) {
  const store = readStore();
  store.products[productKey] ||= { points: [] };
  store.products[productKey].points.push(point);
  // keep last 365 days to control file growth
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  store.products[productKey].points = store.products[productKey].points
    .filter(p => typeof p.ts === 'number' && p.ts >= cutoff)
    .slice(-2000);
  writeStore(store);
  return store.products[productKey].points;
}

function getPoints(productKey) {
  const store = readStore();
  return store.products[productKey]?.points || [];
}

function summarize(points) {
  const valid = points.filter(p => typeof p.price === 'number' && !Number.isNaN(p.price) && p.price > 0);
  if (valid.length === 0) {
    return {
      lowestEver: null,
      highestPrice: null,
      averagePrice: null,
      lastSalePrice: null,
    };
  }
  const prices = valid.map(p => p.price);
  const lowestEver = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lastSalePrice = valid[valid.length - 1].price;
  return { lowestEver, highestPrice, averagePrice, lastSalePrice };
}

function series(points, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return points
    .filter(p => typeof p.ts === 'number' && p.ts >= cutoff && typeof p.price === 'number' && p.price > 0)
    .map(p => ({ ts: p.ts, price: p.price }));
}

module.exports = {
  upsertPricePoint,
  getPoints,
  summarize,
  series,
};

