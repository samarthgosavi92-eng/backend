const { analyzeProductDealFromUrl } = require('./deal-analyzer');

async function analyzeDeal(req, res) {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }

    const result = await analyzeProductDealFromUrl(url.trim());
    return res.json(result);
  } catch (error) {
    console.error('❌ Deal analyze error:', error);
    console.error('Error stack:', error.stack);
    const errorMessage = error.message || 'Unknown error';
    const errorDetails = {
      error: errorMessage,
      type: error.name || 'Error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    };
    return res.status(500).json(errorDetails);
  }
}

module.exports = { analyzeDeal };

