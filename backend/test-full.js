const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");

// Import các hàm nghiệp vụ
const { certifyFarm, createLot, buyLot, processLot } = require("./func.js");
const contractArtifact = require("../artifacts/contracts/PepperSupplyChain.sol/PepperSupplyChain.json");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Private Keys từ môi trường local (Hardhat)
const PK_ADMIN = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; 
const PK_FARMER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; 
const PK_PROCESSOR = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const WALLET_ADMIN = new ethers.Wallet(PK_ADMIN).address;
const WALLET_FARMER = new ethers.Wallet(PK_FARMER).address;
const WALLET_PROCESSOR = new ethers.Wallet(PK_PROCESSOR).address;

async function setupMockData() {
    console.log("1. Đang tạo dữ liệu nền (Users & Farm) vào DB...");
    await supabase.from('users').upsert([
        { wallet_address: WALLET_ADMIN, role: 'Certifier', name: 'Admin Certifier' },
        { wallet_address: WALLET_FARMER, role: 'Farmer', name: 'Nong Dan A' },
        { wallet_address: WALLET_PROCESSOR, role: 'Processor', name: 'Nha May B' }
    ], { onConflict: 'wallet_address' });

    const { data: farmer } = await supabase.from('users').select('user_id').eq('wallet_address', WALLET_FARMER).single();

    await supabase.from('farms').upsert([
        { chain_farm_id: 'FARM-001', owner_id: farmer.user_id, location: 'Tay Nguyen' }
    ], { onConflict: 'chain_farm_id' });

    console.log("2. Đang cấp quyền (Grant Roles) trên Smart Contract...");
    
    const adminSigner = new ethers.Wallet(PK_ADMIN, provider);
    const contractAdmin = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractArtifact.abi, adminSigner);

    // Lấy nonce hiện tại
    let nonce = await adminSigner.getNonce();
    console.log(`   - Nonce hiện tại: ${nonce}`);

    console.log("   - Cấp quyền Certifier...");
    const tx1 = await contractAdmin.grantCertifier(WALLET_ADMIN, { nonce: nonce });
    await tx1.wait();
    nonce++;

    console.log("   - Cấp quyền Farmer...");
    const tx2 = await contractAdmin.grantFarmer(WALLET_FARMER, { nonce: nonce });
    await tx2.wait();
    nonce++;

    console.log("   - Cấp quyền Processor...");
    const tx3 = await contractAdmin.grantProcessor(WALLET_PROCESSOR, { nonce: nonce });
    await tx3.wait();
    
    console.log("✅ Hoàn tất cấp quyền.");
}
async function runTestFlow() {
    try {
        // Reset/Khởi tạo dữ liệu
        await setupMockData();

        console.log("\n--- BẮT ĐẦU CHẠY NGHIỆP VỤ ---");
        const chainFarmId = "FARM-001";
        const lotId = Math.floor(Math.random() * 100000); 

        // 1. Chứng nhận Farm
        console.log("⏳ 1. Cấp chứng nhận hữu cơ (certifyFarm)...");
        const validUntil = Math.floor(Date.now() / 1000) + 31536000; 
        const r1 = await certifyFarm(chainFarmId, "HASH_CERT_123", validUntil, PK_ADMIN);
        console.log("✅ Xong! TxHash:", r1.txHash);

        // Đợi 1 chút để node kịp cập nhật trạng thái (tùy chọn nhưng an toàn)
        await new Promise(r => setTimeout(r, 1000));

        // 2. Tạo lô hàng
        console.log(`⏳ 2. Nông dân tạo lô hàng ID ${lotId} (createLot)...`);
        const r2 = await createLot(lotId, chainFarmId, 1000, "2026-03-26", PK_FARMER);
        console.log("✅ Xong! Batch UUID trong DB:", r2.batchId);

        await new Promise(r => setTimeout(r, 1000));

        // 3. Mua lô hàng
        console.log("⏳ 3. Đơn vị chế biến mua lô hàng (buyLot)...");
        const r3 = await buyLot(lotId, "0.5", PK_PROCESSOR); 
        console.log("✅ Xong! TxHash:", r3.txHash);

        await new Promise(r => setTimeout(r, 1000));

        // 4. Xử lý lô hàng
        console.log("⏳ 4. Đơn vị chế biến xử lý và hao hụt còn 850kg (processLot)...");
        const r4 = await processLot(lotId, 850, PK_PROCESSOR);
        console.log("✅ Xong! TxHash:", r4.txHash);

        console.log("\n🎉 TEST LUỒNG CHÍNH THÀNH CÔNG TỪ A-Z!");

    } catch (error) {
        console.error("\n❌ LỖI TRONG QUÁ TRÌNH TEST:");
        // In chi tiết lỗi để debug
        if (error.reason) console.error("Lý do:", error.reason);
        console.error(error.message);
    }
}

runTestFlow();