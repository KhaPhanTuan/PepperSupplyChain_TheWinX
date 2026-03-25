const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Load ABI từ thư mục artifacts của Hardhat
const contractArtifact = require("../artifacts/contracts/PepperSupplyChain.sol/PepperSupplyChain.json");

// =====================================================================
// 1. CẤU HÌNH KẾT NỐI
// =====================================================================

// Blockchain (Ethers.js)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
);

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Nên dùng Service Role Key cho Backend để có toàn quyền ghi DB
const supabase = createClient(supabaseUrl, supabaseKey);

// =====================================================================
// 2. CÁC HÀM XỬ LÝ NGHIỆP VỤ (EXPORTS)
// =====================================================================

/**
 * TẠO LÔ HÀNG (Create Lot)
 */
async function createLot(id, chainFarmId, weight, farmerWallet) {
    try {
        // 1. Tìm UUID của farmer và farm
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('user_id')
            .eq('wallet_address', farmerWallet)
            .single();

        const { data: farm, error: farmErr } = await supabase
            .from('farms')
            .select('farm_id')
            .eq('chain_farm_id', chainFarmId)
            .single();

        if (userErr || farmErr || !user || !farm) {
            throw new Error("Không tìm thấy Nông dân hoặc Nông trại trong Supabase");
        }

        // 2. GỌI SMART CONTRACT
        const tx = await contract.createLot(id, chainFarmId, weight);
        await tx.wait(); // Đợi block được đào

        // 3. LƯU VÀO DATABASE SUPABASE
        // A. Insert vào bảng batches
        const { data: newBatch, error: batchErr } = await supabase
            .from('batches')
            .insert([{
                chain_batch_id: id.toString(),
                farm_id: farm.farm_id,
                farmer_id: user.user_id,
                owner_id: user.user_id,
                initial_weight: weight,
                status: 'Created'
            }])
            .select('batch_id')
            .single();

        if (batchErr) throw batchErr;

        // B. Insert vào bảng batch_history
        const { error: historyErr } = await supabase
            .from('batch_history')
            .insert([{
                batch_id: newBatch.batch_id,
                new_status: 'Created',
                action_type: 'CREATE',
                updated_by: user.user_id,
                tx_hash: tx.hash
            }]);

        if (historyErr) throw historyErr;

        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error("Lỗi createLot:", error);
        throw error;
    }
}

/**
 * GỘP LÔ HÀNG (Merge Lots)
 */
async function mergeLots(newId, sourceIds, processorWallet) {
    try {
        // 1. Tìm UUID của processor
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('user_id')
            .eq('wallet_address', processorWallet)
            .single();
        
        if (userErr || !user) throw new Error("Không tìm thấy Processor trong DB");

        // 2. GỌI SMART CONTRACT
        const tx = await contract.mergeLots(newId, sourceIds);
        await tx.wait();

        // Đọc lại tổng cân nặng từ contract
        const newLotData = await contract.getLot(newId);
        const totalWeight = Number(newLotData.initialWeight);

        // 3. LƯU DATABASE SUPABASE
        // A. Insert bảng batches
        const { data: newBatch, error: batchErr } = await supabase
            .from('batches')
            .insert([{
                chain_batch_id: newId.toString(),
                farmer_id: user.user_id,
                owner_id: user.user_id,
                initial_weight: totalWeight,
                status: 'Processed'
            }])
            .select('batch_id')
            .single();

        if (batchErr) throw batchErr;

        // B. Lấy danh sách UUID của các lô nguồn từ Supabase
        const { data: sourceBatches, error: srcErr } = await supabase
            .from('batches')
            .select('batch_id')
            .in('chain_batch_id', sourceIds.map(String));

        if (srcErr) throw srcErr;

        // C. Insert mảng vào Junction Table (batch_sources)
        const sourcesData = sourceBatches.map(src => ({
            merged_batch_id: newBatch.batch_id,
            source_batch_id: src.batch_id
        }));

        const { error: mergeErr } = await supabase
            .from('batch_sources')
            .insert(sourcesData);

        if (mergeErr) throw mergeErr;

        // D. Insert History
        const { error: historyErr } = await supabase
            .from('batch_history')
            .insert([{
                batch_id: newBatch.batch_id,
                new_status: 'Processed',
                action_type: 'MERGE',
                updated_by: user.user_id,
                tx_hash: tx.hash
            }]);

        if (historyErr) throw historyErr;

        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error("Lỗi mergeLots:", error);
        throw error;
    }
}

/**
 * MUA LÔ HÀNG (Buy Lot)
 */
async function buyLot(chainId, buyerWallet, ethValue) {
    try {
        // 1. GỌI SMART CONTRACT (Gửi kèm Wei)
        const tx = await contract.buyLot(chainId, { value: ethers.parseEther(ethValue.toString()) });
        await tx.wait();

        // 2. TÌM DỮ LIỆU ĐỂ CẬP NHẬT DB
        const { data: buyer, error: buyerErr } = await supabase
            .from('users')
            .select('user_id')
            .eq('wallet_address', buyerWallet)
            .single();

        const { data: batch, error: batchErr } = await supabase
            .from('batches')
            .select('batch_id, owner_id')
            .eq('chain_batch_id', chainId.toString())
            .single();

        if (buyerErr || batchErr || !buyer || !batch) {
             throw new Error("Lỗi truy xuất dữ liệu User hoặc Batch để mua hàng.");
        }

        // 3. LƯU DATABASE
        // A. Đổi owner trong batches
        const { error: updateErr } = await supabase
            .from('batches')
            .update({ owner_id: buyer.user_id })
            .eq('batch_id', batch.batch_id);

        if (updateErr) throw updateErr;

        // B. Lưu vào bảng transactions
        const { error: txErr } = await supabase
            .from('transactions')
            .insert([{
                batch_id: batch.batch_id,
                from_user: batch.owner_id, // Chủ cũ
                to_user: buyer.user_id,    // Chủ mới
                amount: ethValue,
                tx_hash: tx.hash
            }]);

        if (txErr) throw txErr;

        // C. Lưu history
        const { error: historyErr } = await supabase
            .from('batch_history')
            .insert([{
                batch_id: batch.batch_id,
                action_type: 'BUY',
                updated_by: buyer.user_id,
                tx_hash: tx.hash
            }]);

        if (historyErr) throw historyErr;

        return { success: true, txHash: tx.hash };
    } catch (error) {
        console.error("Lỗi buyLot:", error);
        throw error;
    }
}

module.exports = {
    createLot,
    mergeLots,
    buyLot
};


// ==========================================
// HÀM TEST KẾT NỐI 2 CHIỀU (BLOCKCHAIN & SUPABASE)
// ==========================================
async function testFullConnection() {
    console.log("⏳ Đang kiểm tra kết nối cả 2 đầu...");

    try {
        // 1. TEST BLOCKCHAIN: Gọi hàm lấy địa chỉ admin từ Smart Contract
        // Lưu ý: Đảm bảo mạng Hardhat (npx hardhat node) đang chạy
        console.log("👉 Đang gọi Smart Contract...");
        const adminAddress = await contract.admin();
        console.log("✅ KẾT NỐI BLOCKCHAIN THÀNH CÔNG! Địa chỉ Admin hợp đồng là:", adminAddress);

        // 2. TEST DATABASE: Lấy thử 1 dòng từ bảng 'users'
        console.log("👉 Đang gọi Supabase...");
        const { data, error } = await supabase.from('users').select('*').limit(1);
        
        if (error) {
            throw new Error("Lỗi Supabase: " + error.message);
        }
        console.log("✅ KẾT NỐI DATABASE THÀNH CÔNG!");
        
        console.log("🎉 XUẤT SẮC! Backend của bạn đã thông suốt cả 2 đường phố!");

    } catch (error) {
        console.error("❌ CÓ LỖI XẢY RA Đứt cáp ở đâu đó rồi:", error.message);
    }
}

// Chạy hàm test
testFullConnection();
