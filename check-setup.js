// Quick setup verification script
console.log('='.repeat(60));
console.log('🔍 Checking BhavTOL Backend Setup');
console.log('='.repeat(60));
console.log();

const fs = require('fs');
const path = require('path');

let allGood = true;

// Check if we're in the right directory
console.log('📁 Checking directory structure...');
const requiredFiles = [
    'package.json',
    'server.js',
    'src/all-scrapers.js',
    'src/product-controller.js',
    'src/scraper-factory.js'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - NOT FOUND!`);
        allGood = false;
    }
});

console.log();

// Check node_modules
console.log('📦 Checking dependencies...');
if (fs.existsSync('node_modules')) {
    console.log('  ✅ node_modules exists');
    
    const requiredModules = [
        'express',
        'puppeteer',
        'puppeteer-extra',
        'axios',
        'cors'
    ];
    
    requiredModules.forEach(module => {
        const modulePath = path.join('node_modules', module);
        if (fs.existsSync(modulePath)) {
            console.log(`  ✅ ${module}`);
        } else {
            console.log(`  ❌ ${module} - NOT INSTALLED!`);
            allGood = false;
        }
    });
} else {
    console.log('  ❌ node_modules not found - run: npm install');
    allGood = false;
}

console.log();

// Test require statements
console.log('🔗 Testing module imports...');
try {
    require('./src/all-scrapers');
    console.log('  ✅ all-scrapers.js');
} catch (e) {
    console.log(`  ❌ all-scrapers.js - ${e.message}`);
    allGood = false;
}

try {
    require('./src/product-controller');
    console.log('  ✅ product-controller.js');
} catch (e) {
    console.log(`  ❌ product-controller.js - ${e.message}`);
    allGood = false;
}

try {
    require('./src/scraper-factory');
    console.log('  ✅ scraper-factory.js');
} catch (e) {
    console.log(`  ❌ scraper-factory.js - ${e.message}`);
    allGood = false;
}

console.log();
console.log('='.repeat(60));
if (allGood) {
    console.log('✅ All checks passed! Backend is ready to use.');
    console.log('   Run: npm start');
} else {
    console.log('❌ Some issues found. Please fix them before running the server.');
    console.log('   Try running: npm install');
}
console.log('='.repeat(60));








