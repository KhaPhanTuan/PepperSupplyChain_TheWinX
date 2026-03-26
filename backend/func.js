const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const contractArtifact = require("../artifacts/contracts/PepperSupplyChain.sol/PepperSupplyChain.json");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function getContractWithSigner(privateKey) {
    const wallet = new ethers.Wallet(privateKey, provider);
    return new ethers.Contract(process.env.CONTRACT_ADDRESS, contractArtifact.abi, wallet);
}

async function getUser(walletAddress) {
    const { data, error } = await supabase.from('users').select('user_id').eq('wallet_address', walletAddress).single();
    if (error || !data) throw new Error("User not found: " + walletAddress);
    return data;
}

async function logHistory(batchId, status, actionType, userId, txHash) {
    const { error } = await supabase.from('batch_history').insert([{
        batch_id: batchId,
        new_status: status,
        action_type: actionType,
        updated_by: userId,
        tx_hash: txHash
    }]);
    if (error) throw error;
}

async function certifyFarm(chainFarmId, certHash, validUntil, certifierPrivateKey) {
    const user = await getUser(new ethers.Wallet(certifierPrivateKey).address);
    const contract = getContractWithSigner(certifierPrivateKey);
    
    const tx = await contract.certifyFarm(ethers.encodeBytes32String(chainFarmId), ethers.encodeBytes32String(certHash), validUntil);
    await tx.wait();

    const { data: farm } = await supabase.from('farms').select('farm_id').eq('chain_farm_id', chainFarmId).single();
    
    const { error } = await supabase.from('certifications').insert([{
        farm_id: farm.farm_id,
        cert_hash: certHash,
        expiry_date: new Date(validUntil * 1000).toISOString(),
        is_valid: true
    }]);
    if (error) throw error;

    return { success: true, txHash: tx.hash };
}

// ... (Giữ nguyên phần import và cấu hình supabase, provider, contract) ...

async function createLot(id, chainFarmId, weight, harvestDate, farmerPrivateKey) {
    const user = await getUser(new ethers.Wallet(farmerPrivateKey).address);
    const { data: farm } = await supabase.from('farms').select('farm_id').eq('chain_farm_id', chainFarmId).single();
    
    // 1. KIỂM TRA CHỨNG NHẬN HỮU CƠ (Rule R2)
    const { data: cert } = await supabase.from('certifications')
        .select('cert_id')
        .eq('farm_id', farm.farm_id)
        .eq('is_valid', true)
        .gte('expiry_date', new Date().toISOString())
        .maybeSingle();

    if (!cert) throw new Error("VALIDATION_FAILED: Nông trại chưa có chứng nhận hợp lệ hoặc đã hết hạn.");

    const contract = getContractWithSigner(farmerPrivateKey);
    const tx = await contract.createLot(id, ethers.encodeBytes32String(chainFarmId), weight);
    await tx.wait();

    const { data: newBatch, error: batchErr } = await supabase.from('batches').insert([{
        chain_batch_id: id.toString(),
        farm_id: farm.farm_id,
        farmer_id: user.user_id,
        owner_id: user.user_id,
        initial_weight: weight,
        harvest_date: harvestDate,
        status: 'Created'
    }]).select('batch_id').single();
    
    if (batchErr) throw batchErr;
    await logHistory(newBatch.batch_id, 'Created', 'CREATE', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash, batchId: newBatch.batch_id };
}

async function buyLot(chainId, ethValue, buyerPrivateKey) {
    const buyer = await getUser(new ethers.Wallet(buyerPrivateKey).address);
    const { data: batch } = await supabase.from('batches').select('batch_id, owner_id, status').eq('chain_batch_id', chainId.toString()).single();

    // 2. KIỂM TRA TRẠNG THÁI TRƯỚC KHI MUA (Rule R5, R6)
    const allowedStatuses = ['Created', 'Processed', 'Shipped'];
    if (!allowedStatuses.includes(batch.status)) {
        throw new Error(`VALIDATION_FAILED: Không thể mua lô hàng đang ở trạng thái ${batch.status}`);
    }

    const contract = getContractWithSigner(buyerPrivateKey);
    const tx = await contract.buyLot(chainId, { value: ethers.parseEther(ethValue.toString()) });
    await tx.wait();

    await supabase.from('batches').update({ owner_id: buyer.user_id, price: 0 }).eq('batch_id', batch.batch_id);
    await supabase.from('transactions').insert([{
        batch_id: batch.batch_id,
        from_user: batch.owner_id,
        to_user: buyer.user_id,
        amount: ethValue,
        tx_hash: tx.hash
    }]);
    await logHistory(batch.batch_id, null, 'BUY', buyer.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}

async function processLot(chainId, processedWeight, processorPrivateKey) {
    const user = await getUser(new ethers.Wallet(processorPrivateKey).address);
    const { data: batch } = await supabase.from('batches').select('batch_id, owner_id, status').eq('chain_batch_id', chainId.toString()).single();

    // 3. KIỂM TRA QUYỀN SỞ HỮU VÀ TRẠNG THÁI
    if (batch.owner_id !== user.user_id) throw new Error("VALIDATION_FAILED: Bạn không phải chủ sở hữu lô hàng này.");
    if (batch.status !== 'Created') throw new Error("VALIDATION_FAILED: Lô hàng phải ở trạng thái Created để chế biến.");

    const contract = getContractWithSigner(processorPrivateKey);
    const tx = await contract.processLot(chainId, processedWeight);
    await tx.wait();

    await supabase.from('batches').update({ processed_weight: processedWeight, status: 'Processed' }).eq('batch_id', batch.batch_id);
    await logHistory(batch.batch_id, 'Processed', 'PROCESS', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}

async function mergeLots(newId, sourceIds, processorPrivateKey) {
    const user = await getUser(new ethers.Wallet(processorPrivateKey).address);
    const { data: sourceBatches } = await supabase.from('batches').select('batch_id, owner_id, status').in('chain_batch_id', sourceIds.map(String));

    // 3. KIỂM TRA QUYỀN SỞ HỮU VÀ TRẠNG THÁI (Rule R9)
    for (const src of sourceBatches) {
        if (src.owner_id !== user.user_id) throw new Error("VALIDATION_FAILED: Bạn không sở hữu tất cả các lô nguồn.");
        if (src.status !== 'Processed') throw new Error(`VALIDATION_FAILED: Lô nguồn phải ở trạng thái Processed (Lô hiện tại: ${src.status}).`);
    }

    const contract = getContractWithSigner(processorPrivateKey);
    const tx = await contract.mergeLots(newId, sourceIds);
    await tx.wait();

    const newLotData = await contract.getLot(newId);
    const { data: newBatch } = await supabase.from('batches').insert([{
        chain_batch_id: newId.toString(),
        farmer_id: user.user_id,
        owner_id: user.user_id,
        initial_weight: Number(newLotData.initialWeight),
        status: 'Processed'
    }]).select('batch_id').single();

    const sourcesData = sourceBatches.map(src => ({ merged_batch_id: newBatch.batch_id, source_batch_id: src.batch_id }));
    await supabase.from('batch_merge').insert(sourcesData);
    await supabase.from('batches').update({ status: 'Merged' }).in('batch_id', sourceBatches.map(src => src.batch_id));
    await logHistory(newBatch.batch_id, 'Processed', 'MERGE', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}

async function markShipped(chainId, distributorPrivateKey) {
    const user = await getUser(new ethers.Wallet(distributorPrivateKey).address);
    const { data: batch } = await supabase.from('batches').select('batch_id, owner_id, status').eq('chain_batch_id', chainId.toString()).single();

    // 3. KIỂM TRA QUYỀN SỞ HỮU VÀ TRẠNG THÁI
    if (batch.owner_id !== user.user_id) throw new Error("VALIDATION_FAILED: Bạn không phải chủ sở hữu lô hàng này.");
    if (batch.status !== 'Processed') throw new Error("VALIDATION_FAILED: Lô hàng phải ở trạng thái Processed để giao hàng.");

    const contract = getContractWithSigner(distributorPrivateKey);
    const tx = await contract.markShipped(chainId);
    await tx.wait();

    await supabase.from('batches').update({ status: 'Shipped' }).eq('batch_id', batch.batch_id);
    await logHistory(batch.batch_id, 'Shipped', 'SHIP', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}

async function markSold(chainId, retailerPrivateKey) {
    const user = await getUser(new ethers.Wallet(retailerPrivateKey).address);
    const { data: batch } = await supabase.from('batches').select('batch_id, owner_id, status').eq('chain_batch_id', chainId.toString()).single();

    // 3. KIỂM TRA QUYỀN SỞ HỮU VÀ TRẠNG THÁI
    if (batch.owner_id !== user.user_id) throw new Error("VALIDATION_FAILED: Bạn không phải chủ sở hữu lô hàng này.");
    if (batch.status !== 'Shipped') throw new Error("VALIDATION_FAILED: Lô hàng phải ở trạng thái Shipped để bán lẻ.");

    const contract = getContractWithSigner(retailerPrivateKey);
    const tx = await contract.markSold(chainId);
    await tx.wait();

    await supabase.from('batches').update({ status: 'Sold' }).eq('batch_id', batch.batch_id);
    await logHistory(batch.batch_id, 'Sold', 'SELL', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}

async function flagLot(chainId, adminPrivateKey) {
    const user = await getUser(new ethers.Wallet(adminPrivateKey).address);
    const contract = getContractWithSigner(adminPrivateKey);

    const tx = await contract.flagLot(chainId);
    await tx.wait();

    const { data: batch } = await supabase.from('batches').update({ status: 'Flagged' }).eq('chain_batch_id', chainId.toString()).select('batch_id').single();
    await logHistory(batch.batch_id, 'Flagged', 'FLAG', user.user_id, tx.hash);

    return { success: true, txHash: tx.hash };
}
module.exports = { 
    certifyFarm, createLot, buyLot, processLot, mergeLots, markShipped, markSold, flagLot 
};