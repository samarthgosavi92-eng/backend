const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create Supabase client with fallback for missing credentials
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
  } catch (error) {
    console.warn('⚠️  Supabase initialization failed:', error.message);
    console.warn('⚠️  Medicine price history will not be saved, but scraping will still work');
  }
} else {
  console.warn('⚠️  Supabase credentials not found in .env file');
  console.warn('⚠️  Medicine price history will not be saved, but scraping will still work');
  console.warn('⚠️  To enable Supabase, add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env');
}

// Export a mock supabase object if credentials are missing
if (!supabase) {
  supabase = {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null })
        })
      })
    })
  };
}

module.exports = supabase;
