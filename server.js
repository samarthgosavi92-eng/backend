const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'BhavTOL Backend is running', stores: 10 });
});

// Import Product + Deal Controllers
const { searchProducts } = require('./src/product-controller');
const { analyzeDeal } = require('./src/deal-controller');
const { analyzeDealSense } = require('./src/dealsense-controller');

// DealScan: medicine price comparison (Supabase + axios + cheerio)
const dealScanRoutes = require('./routes/dealscan');
app.use('/api', dealScanRoutes);

// Search endpoint - uses product-controller for better organization
app.get('/api/products/search', searchProducts);

// Deal analysis endpoint (generic scraper)
app.get('/api/deals/analyze', analyzeDeal);

// DealSense endpoint (BuyHatke-based, Axios + Cheerio)
app.get('/api/deals/dealsense', analyzeDealSense);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('✅ BHAVTOL BACKEND SERVER RUNNING');
    console.log('='.repeat(50));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`🔍 Search: http://localhost:${PORT}/api/products/search?q=iPhone&category=ecommerce`);
    console.log('='.repeat(50) + '\n');
});