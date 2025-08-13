
// import { createClient } from '@supabase/supabase-js'
require('dotenv').config(); 
const { createClient } = require('@supabase/supabase-js'); // CommonJS

const supabaseUrl = process.env.SUPABASE_URL

// const supabaseUrl = 'https://usaaehixgdgaqbwwcjeo.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)


module.exports = supabase;