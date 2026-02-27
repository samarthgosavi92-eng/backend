/**
 * DealScan route: medicine price comparison with Supabase storage.
 * POST /api/dealscan — body: { medicineName }
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { scrapeMedicinePrices } = require('../services/medicine-scraper');

/**
 * Validate request body. Returns { valid: true, medicineName } or { valid: false, error, status }.
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.', status: 400 };
  }
  const medicineName = body.medicineName;
  if (medicineName == null) {
    return { valid: false, error: 'medicineName is required.', status: 400 };
  }
  if (typeof medicineName !== 'string') {
    return { valid: false, error: 'medicineName must be a string.', status: 400 };
  }
  const trimmed = medicineName.trim();
  if (!trimmed) {
    return { valid: false, error: 'medicineName cannot be empty.', status: 400 };
  }
  return { valid: true, medicineName: trimmed };
}

/**
 * POST /dealscan
 * Body: { medicineName: string }
 * Returns: { success: true, lowestPrice: {}, comparison: [], history: [] }
 * Or 404 if no prices found, 4xx on validation error, 500 on server error.
 */
router.post('/dealscan', async (req, res) => {
  const validation = validateBody(req.body);
  if (!validation.valid) {
    console.warn('[DealScan] Validation failed:', validation.error);
    return res.status(validation.status).json({
      success: false,
      error: validation.error,
    });
  }

  const { medicineName } = validation;

  try {
    console.log('[DealScan] Starting scan for:', medicineName);

    const comparison = await scrapeMedicinePrices(medicineName);

    if (!comparison || comparison.length === 0) {
      console.warn('[DealScan] No prices found for:', medicineName);
      return res.status(404).json({
        success: false,
        error: 'No prices found for this medicine. Try a different name or try again later.',
        comparison: [],
        history: [],
      });
    }

    console.log('[DealScan] Scraped', comparison.length, 'prices. Storing in Supabase.');

    // Try to store in Supabase (optional - won't fail if Supabase is not configured)
    let history = [];
    try {
      if (supabase && supabase.from) {
        for (const item of comparison) {
          const { error } = await supabase.from('medicines').insert({
            name: medicineName,
            site: item.site,
            price: item.price,
          });
          if (error) {
            console.warn('[DealScan] Supabase insert error (non-fatal):', error.message);
          }
        }

        const { data: historyRows, error: historyError } = await supabase
          .from('medicines')
          .select('id, name, site, price, created_at')
          .eq('name', medicineName)
          .order('created_at', { ascending: true });

        if (historyError) {
          console.warn('[DealScan] Supabase history fetch error (non-fatal):', historyError.message);
        } else if (historyRows) {
          history = historyRows.map((row) => ({
            id: row.id,
            name: row.name,
            site: row.site,
            price: row.price != null ? Number(row.price) : null,
            created_at: row.created_at,
          }));
        }
      }
    } catch (supabaseError) {
      console.warn('[DealScan] Supabase operation failed (non-fatal):', supabaseError.message);
      // Continue without history - scraping still works
    }

    const lowestEntry = comparison.reduce((min, cur) =>
      cur.price < min.price ? cur : min
    );
    const lowestPrice = {
      site: lowestEntry.site,
      siteId: lowestEntry.siteId || lowestEntry.site,
      price: lowestEntry.price,
    };

    console.log('[DealScan] Success. Lowest:', lowestPrice.price, 'at', lowestPrice.site);

    return res.json({
      success: true,
      medicineName,
      lowestPrice,
      comparison: comparison.map((c) => ({
        site: c.site,
        siteId: c.siteId || c.site,
        price: c.price,
      })),
      history,
    });
  } catch (error) {
    console.error('[DealScan] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while scanning medicine prices. Please try again later.',
      comparison: [],
      history: [],
    });
  }
});

module.exports = router;
