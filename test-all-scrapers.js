// Test script to verify all scrapers are working
const { searchProducts } = require('./src/product-controller');

async function testScrapers() {
    console.log('='.repeat(60));
    console.log('🧪 TESTING BHAVTOL SCRAPERS');
    console.log('='.repeat(60));

    const testQuery = 'iphone';
    console.log(`\n📱 Testing with query: "${testQuery}"\n`);

    // Mock request/response objects
    const mockReq = {
        query: {
            q: testQuery,
            category: 'ecommerce'
        }
    };

    const mockRes = {
        json: (data) => {
            console.log('\n✅ SUCCESS!');
            console.log(`📊 Total Products: ${data.count}`);
            console.log(`🏪 Stores Searched: ${data.stores}`);
            console.log(`\n📦 Sample Products:`);

            if (data.products && data.products.length > 0) {
                data.products.slice(0, 3).forEach((product, idx) => {
                    console.log(`\n${idx + 1}. ${product.name}`);
                    console.log(`   Brand: ${product.brand}`);
                    console.log(`   Stores: ${product.storePrices.length}`);
                    product.storePrices.forEach(sp => {
                        console.log(`   - ${sp.storeName}: ₹${sp.price}`);
                    });
                });
            } else {
                console.log('⚠️ No products found');
            }
            console.log('\n' + '='.repeat(60));
        },
        status: (code) => ({
            json: (data) => {
                console.log(`\n❌ ERROR (${code}):`);
                console.log(data);
                console.log('\n' + '='.repeat(60));
            }
        })
    };

    try {
        await searchProducts(mockReq, mockRes);
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
    }
}

// Run test
testScrapers();








