const express = require('express');
const cors = require('cors');
const api = require('./func.js'); 
const { createClient } = require("@supabase/supabase-js");
require('dotenv').config();

// Kết nối Database để đọc dữ liệu cho farm_01
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. API cho farm_01.html (Lấy danh sách lô hàng)
// ==========================================
app.get('/api/my-batches', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('batches')
            .select(`
                chain_batch_id,
                harvest_date,
                initial_weight,
                status,
                farms ( chain_farm_id )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==========================================
// 2. API cho farm_02.html (Tạo lô hàng mới)
// ==========================================
app.post('/api/create-lot', async (req, res) => {
    try {
        const { id, chainFarmId, weight, harvestDate, farmerPrivateKey } = req.body;
        const result = await api.createLot(id, chainFarmId, weight, harvestDate, farmerPrivateKey);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==========================================
// 3. API lấy chi tiết một lô hàng cụ thể (dùng cho farm_03.html)
// ==========================================
app.get('/api/lot/:id', async (req, res) => {
    try {
        const batchId = parseInt(req.params.id);
        
        // Lấy thông tin lô hàng từ Supabase
        const { data: lot, error } = await supabase
            .from('batches')
            .select(`
                *,
                farms ( chain_farm_id, certifications ( cert_hash ) ),
                users!owner_id ( wallet_address )
            `)
            .eq('chain_batch_id', batchId)
            .single();

        if (error || !lot) throw new Error("Không tìm thấy lô hàng này");

        res.json({ success: true, data: lot });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
});
// ==========================================
// 4. API Truy xuất nguồn gốc (Dành cho khách hàng - Trace Product)
// ==========================================
app.get('/api/trace/:id', async (req, res) => {
    try {
        const batchId = req.params.id;
        const { data: lot, error } = await supabase
            .from('batches')
            .select(`
                *,
                farms ( 
                    chain_farm_id, 
                    location
                ),
                users!owner_id ( wallet_address )
            `)
            .eq('chain_batch_id', batchId)
            .single();

        if (error || !lot) throw new Error("Mã lô hàng không tồn tại!");
        res.json({ success: true, data: lot });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
});
// ==========================================
// 5. API Lấy danh sách chứng chỉ (Dành cho cert_01.html)
// ==========================================
app.get('/api/certificates', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('certifications')
            .select(`
                cert_id,
                cert_hash,
                certificate_type,
                issued_date,
                farms ( chain_farm_id, location )
            `)
            .order('issued_date', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// ==========================================
// 6. API Cấp chứng chỉ mới (Dành cho cert_02.html)
// ==========================================
app.post('/api/certify', async (req, res) => {
    try {
        const { chainFarmId, certHash, certificateType, expiryDate } = req.body;

        // 1. Tìm UUID của Farm từ chain_farm_id người dùng nhập
        const { data: farm, error: farmError } = await supabase
            .from('farms')
            .select('farm_id')
            .eq('chain_farm_id', chainFarmId)
            .single();

        if (farmError || !farm) throw new Error("Không tìm thấy Farm ID này trong hệ thống!");

        // 2. Chèn dữ liệu vào bảng certifications
        const { data, error: certError } = await supabase
            .from('certifications')
            .insert([{
                farm_id: farm.farm_id,
                cert_hash: certHash,
                issued_date: new Date().toISOString().split('T')[0], // Ngày hôm nay
                expiry_date: expiryDate,
                certificate_type: certificateType || 'Organic',
                is_valid: true
            }])
            .select();

        if (certError) throw certError;

        // Giả lập trả về TxHash (Sau này em kết nối Web3 thì lấy từ Smart Contract)
        const fakeTxHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

        res.json({ success: true, txHash: fakeTxHash, data: data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// ==========================================
// 7. API DÀNH CHO PROCESSOR (distribution.html)
// ==========================================

// A. Lấy tất cả các Batch đang ở trạng thái 'Created' (Chưa có ai mua)
app.get('/api/available-batches', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('batches')
            .select('*, farms(chain_farm_id)')
            .eq('status', 'Created');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// B. Xử lý "Mua" Batch (Đổi owner_id sang người mua)
app.post('/api/lot/:id/buy', async (req, res) => {
    try {
        const batchId = req.params.id;
        const { newOwnerWallet } = req.body; // Ví của Processor

        // Tìm User ID từ ví
        const { data: user } = await supabase.from('users').select('user_id').eq('wallet_address', newOwnerWallet).single();
        if(!user) throw new Error("Ví người mua chưa đăng ký hệ thống!");

        const { error } = await supabase
            .from('batches')
            .update({ owner_id: user.user_id, status: 'Processing', updated_at: new Date() })
            .eq('chain_batch_id', batchId);

        if (error) throw error;
        res.json({ success: true, txHash: "0x" + Math.random().toString(16).slice(2) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// C. Xử lý "Chế biến" (Cập nhật khối lượng sau chế biến)
app.post('/api/lot/:id/process', async (req, res) => {
    try {
        const batchId = req.params.id;
        const { processedWeight } = req.body;

        const { error } = await supabase
            .from('batches')
            .update({ 
                processed_weight: processedWeight, 
                status: 'Processed', // Đổi sang Processed (đã chế biến)
                updated_at: new Date() 
            })
            .eq('chain_batch_id', batchId);

        if (error) throw error;
        res.json({ success: true, txHash: "0x" + Math.random().toString(16).slice(2) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// ==========================================
// 8. API DÀNH CHO PROCESSOR (process_01.html)
// ==========================================
app.get('/api/my-batches/:wallet', async (req, res) => {
    try {
        const wallet = req.params.wallet;
        
        // 1. Tìm User ID từ ví của Processor
        const { data: user } = await supabase.from('users').select('user_id').eq('wallet_address', wallet).single();
        if(!user) return res.json({ success: true, data: [] });

        // 2. Lấy các batch mà người này đang làm chủ (owner_id)
        const { data, error } = await supabase
            .from('batches')
            .select('*, farms(chain_farm_id)')
            .eq('owner_id', user.user_id)
            .neq('status', 'Created'); // Không lấy hàng đang treo bán ở Farm

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// ==========================================
// 9. API Vận chuyển (Dành cho Processor/Distributor)
// ==========================================
app.post('/api/lot/:id/ship', async (req, res) => {
    try {
        const batchId = req.params.id;

        const { error } = await supabase
            .from('batches')
            .update({ 
                status: 'Shipped', 
                updated_at: new Date() 
            })
            .eq('chain_batch_id', batchId);

        if (error) throw error;
        
        // Giả lập TxHash cho Blockchain
        const txHash = "0x" + Math.random().toString(16).slice(2, 10) + "...ship";
        
        res.json({ success: true, txHash });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// ==========================================
// 10. API DÀNH CHO RETAILER (retail.html)
// ==========================================
// A. Lấy danh sách hàng đang trên đường vận chuyển (Sẵn sàng để Retailer nhập kho)
app.get('/api/shipped-batches', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('batches')
            .select('*, farms(chain_farm_id)')
            .eq('status', 'Shipped'); // Chỉ lấy những lô đã được Processor nhấn "Ship"
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// B. Xử lý "Bán lẻ" (Đổi trạng thái sang Sold)
app.post('/api/lot/:id/sell', async (req, res) => {
    try {
        const batchId = req.params.id;
        const { error } = await supabase
            .from('batches')
            .update({ 
                status: 'Sold', 
                updated_at: new Date() 
            })
            .eq('chain_batch_id', batchId);

        if (error) throw error;
        res.json({ success: true, txHash: "0x" + Math.random().toString(16).slice(2, 10) + "...sold" });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// ==========================================
// KHỞI ĐỘNG MÁY CHỦ
// ==========================================
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 API Server đang chạy tại: http://localhost:${PORT}`);
});