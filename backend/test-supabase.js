const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require("ethers");
const contractArtifact = require("../artifacts/contracts/PepperSupplyChain.sol/PepperSupplyChain.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const rpcUrl = process.env.RPC_URL;
const contractAddress = process.env.CONTRACT_ADDRESS;

if (!supabaseUrl || !supabaseKey || !rpcUrl || !contractAddress) {
    console.error("❌ Thiếu biến môi trường trong file .env!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, contractArtifact.abi, provider);

async function testConnection() {
    console.log("⏳ Đang thử kết nối...");
    
    try {
        const { data, error } = await supabase.from('batches').select('*').limit(1);
        
        if (error) throw new Error("Lỗi Supabase: " + error.message);
        console.log("✅ SUPABASE: Kết nối thành công!");
        console.log("📦 Dữ liệu test:", data);

        const network = await provider.getNetwork();
        console.log(`✅ BLOCKCHAIN: Kết nối thành công (Chain ID: ${network.chainId})`);

        const adminAddress = await contract.admin();
        console.log(`✅ SMART CONTRACT: Đã kết nối (Admin: ${adminAddress})`);

    } catch (error) {
        console.error("❌ KẾT NỐI THẤT BẠI:");
        console.error(error.message);
    }
}

testConnection();