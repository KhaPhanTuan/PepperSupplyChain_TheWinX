const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function insertData() {
    const { data, error } = await supabase
        .from('users')
        .insert([{
            wallet_address: '0x1234567890123456789012345678901234567890',
            role: 'Farmer',
            name: 'Nguyen Van Test'
        }])
        .select();

    if (error) {
        console.error("LỖI INSERT:", error.message);
    } else {
        console.log("INSERT THÀNH CÔNG:");
        console.log(data);
    }
}

insertData();