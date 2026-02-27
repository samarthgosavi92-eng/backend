# BhavTOL Backend

Price comparison backend with web scrapers for multiple e-commerce platforms.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Set Environment Variables (Optional)
Create a `.env` file:
```env
PORT=3000
RAPIDAPI_KEY=your_rapidapi_key_here
```

### 3. Start the Server
```bash
npm start
```

The server will start on `http:3000//localhost:`

## 🧪 Testing

### Test All Scrapers
```bash
node test-all-scrapers.js
```

### Test Individual Scrapers
```bash
node test-scrapers.js
```

### Test API Endpoint
```bash
curl "http://localhost:3000/api/products/search?q=iphone&category=ecommerce"
```

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Search Products
```
GET /api/products/search?q=<query>&category=<category>
```

**Parameters:**
- `q` (required): Search query
- `category` (optional): `grocery`, `ecommerce`, `food`, or `all`

**Example:**
```
GET /api/products/search?q=iphone&category=ecommerce
```

**Response:**
```json
{
  "query": "iphone",
  "category": "ecommerce",
  "count": 15,
  "stores": 3,
  "products": [
    {
      "id": "iphone_15_pro",
      "name": "iPhone 15 Pro",
      "brand": "Apple",
      "imageUrl": "https://...",
      "category": "ecommerce",
      "storePrices": [
        {
          "storeName": "Amazon",
          "storeId": "amazon",
          "price": 134900,
          "originalPrice": 139900,
          "deliveryTime": 1440,
          "inStock": true,
          "url": "https://...",
          "storeIcon": "https://..."
        }
      ],
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## 🏪 Supported Stores

### E-commerce
- **Amazon** - Uses API with scraping fallback
- **Flipkart** - Web scraping
- **Meesho** - Web scraping

### Grocery
- **DMart Ready** - Web scraping
- **BigBasket** - Web scraping
- **JioMart** - Web scraping
- **Reliance Smart** - Web scraping
- **Blinkit** - Web scraping

### Food Delivery
- **Zomato** - Web scraping
- **Swiggy** - Web scraping

## 🔧 Troubleshooting

### Scrapers Not Working

1. **Check Puppeteer Installation**
   ```bash
   npm list puppeteer puppeteer-extra
   ```

2. **Update Dependencies**
   ```bash
   npm update
   ```

3. **Check for Errors**
   - Look for screenshot files: `*-error.png`, `*-empty.png`
   - Check console logs for detailed error messages

4. **Common Issues**
   - **Captcha/Bot Detection**: Some sites may block automated access
   - **Outdated Selectors**: Websites change their HTML structure frequently
   - **Network Issues**: Check your internet connection
   - **Rate Limiting**: Some sites may temporarily block too many requests

### Debug Mode

Enable detailed logging by checking console output. The scrapers log:
- Navigation steps
- Product counts
- Errors with stack traces
- Screenshots on failures

## 📝 Notes

- Scrapers use **Puppeteer** with stealth plugin to avoid detection
- Amazon scraper tries API first, falls back to scraping
- All scrapers have retry logic (2 retries)
- Products are grouped by name and sorted by lowest price
- Screenshots are saved on errors for debugging

## 🔒 Security

- Never commit API keys to version control
- Use environment variables for sensitive data
- Rate limit your requests to avoid being blocked








