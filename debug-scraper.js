const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('Navigating to Flipkart...');
        await page.goto('https://www.flipkart.com/search?q=iphone', { timeout: 60000, waitUntil: 'domcontentloaded' });

        console.log('Waiting for network idle...');
        // Wait a bit for Client Side Rendering
        await new Promise(r => setTimeout(r, 5000));

        console.log('Capturing content...');
        const html = await page.content();
        fs.writeFileSync('flipkart-source.html', html);

        await page.screenshot({ path: 'debug-flipkart.png' });
        console.log('Saved flipkart-source.html and debug-flipkart.png');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

run();
