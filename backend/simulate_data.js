// // backend/seed-users.js
// require('dotenv').config();
// const { ethers } = require("ethers");
// const { createClient } = require("@supabase/supabase-js");

// // Khởi tạo Supabase
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

// async function seedUsers() {
//     console.log("🚀 Đang khởi tạo 30 Users mẫu...");

//     // Cấu trúc phân bổ Role cho 30 user (Bạn có thể tự chỉnh sửa số lượng)
//     const rolesDistribution = {
//         'Admin': 1,
//         'Certifier': 3,
//         'Farmer': 12,
//         'Processor': 5,
//         'Distributor': 4,
//         'Retailer': 5
//     };

//     const usersToInsert = [];

//     // Vòng lặp đẻ ra user
//     for (const [role, count] of Object.entries(rolesDistribution)) {
//         for (let i = 1; i <= count; i++) {
//             // Dùng ethers tạo ra một ví ảo mới toanh, hợp lệ 100%
//             const randomWallet = ethers.Wallet.createRandom();
            
//             usersToInsert.push({
//                 wallet_address: randomWallet.address,
//                 role: role,
//                 name: `${role} số ${i} (Data Mẫu)`
//             });
//         }
//     }

//     try {
//         console.log(`⏳ Đang đẩy ${usersToInsert.length} users lên bảng 'users' của Supabase...`);
        
//         // Supabase hỗ trợ insert cả 1 mảng (array) cùng lúc, cực kỳ nhanh!
//         const { data, error } = await supabase
//             .from('users')
//             .insert(usersToInsert)
//             .select(); // Trả về data sau khi insert thành công

//         if (error) {
//             throw error;
//         }

//         console.log("✅ THÀNH CÔNG RỰC RỠ! Đã tạo xong 30 Users.");
//         console.log("👉 Bạn có thể vào trình duyệt mở Supabase -> Table Editor -> users để xem thành quả.");
        
//         // In thử 3 người đầu tiên ra xem cho vui
//         console.log("\n📦 Dữ liệu mẫu (3 người đầu tiên):");
//         console.table(data.slice(0, 3).map(u => ({ Name: u.name, Role: u.role, Wallet: u.wallet_address })));

//     } catch (err) {
//         console.error("❌ CÓ LỖI XẢY RA:", err.message);
//     }
// }

// // Chạy hàm
// seedUsers();



// // backend/seed-farms.js
// require('dotenv').config();
// const { ethers } = require("ethers");
// const { createClient } = require("@supabase/supabase-js");

// // Khởi tạo Supabase
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

// async function seedFarms() {
//     console.log("🚀 Đang khởi tạo Nông trại mẫu cho các Nông dân...");

//     try {
//         // 1. Lấy danh sách tất cả Farmer từ bảng users
//         const { data: farmers, error: fetchErr } = await supabase
//             .from('users')
//             .select('user_id, name')
//             .eq('role', 'Farmer');

//         if (fetchErr) throw fetchErr;

//         if (!farmers || farmers.length === 0) {
//             console.log("❌ Không tìm thấy Farmer nào! Bạn nhớ chạy file seed-users.js trước nhé.");
//             return;
//         }

//         console.log(`👨‍🌾 Đã tìm thấy ${farmers.length} Nông dân. Đang cấp đất...`);

//         // Danh sách các vùng trồng tiêu nổi tiếng ở Việt Nam
//         const locations = [
//             'Chư Sê, Gia Lai', 
//             'Buôn Hồ, Đắk Lắk', 
//             'Đắk R\'lấp, Đắk Nông', 
//             'Lộc Ninh, Bình Phước', 
//             'Châu Đức, Bà Rịa - Vũng Tàu',
//             'Cẩm Mỹ, Đồng Nai'
//         ];

//         const farmsToInsert = [];

//         // 2. Vòng lặp: Mỗi nông dân sẽ có 1 đến 2 nông trại
//         for (const farmer of farmers) {
//             // Random số lượng nông trại: 1 hoặc 2
//             const farmCount = Math.floor(Math.random() * 2) + 1; 

//             for (let i = 0; i < farmCount; i++) {
//                 // Tạo một chain_farm_id chuẩn bytes32 cho Blockchain bằng ethers.js
//                 const randomString = `FARM_${farmer.user_id}_${i}_${Date.now()}`;
//                 const chainFarmId = ethers.id(randomString); 

//                 // Chọn random 1 địa điểm
//                 const randomLocation = locations[Math.floor(Math.random() * locations.length)];

//                 farmsToInsert.push({
//                     chain_farm_id: chainFarmId,
//                     owner_id: farmer.user_id,
//                     location: randomLocation
//                 });
//             }
//         }

//         // 3. Đẩy lên Supabase
//         console.log(`⏳ Đang đẩy ${farmsToInsert.length} Nông trại lên bảng 'farms'...`);
        
//         const { data, error: insertErr } = await supabase
//             .from('farms')
//             .insert(farmsToInsert)
//             .select();

//         if (insertErr) throw insertErr;

//         console.log(`✅ THÀNH CÔNG! Đã tạo xong ${data.length} Nông trại.`);
//         console.log("👉 Bạn có thể vào Supabase -> Table Editor -> farms để xem thành quả.");
        
//     } catch (err) {
//         console.error("❌ CÓ LỖI XẢY RA:", err.message);
//     }
// }

// // Chạy hàm
// seedFarms();


// // backend/seed-batches.js
// require('dotenv').config();
// const { createClient } = require("@supabase/supabase-js");

// // Khởi tạo Supabase
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

// async function seedBatches() {
//     console.log("🚀 Đang khởi tạo 50 Lô hàng (Batches) mẫu...");

//     try {
//         // 1. Lấy danh sách tất cả Nông trại (kèm theo owner_id tức là Nông dân sở hữu)
//         const { data: farms, error: fetchErr } = await supabase
//             .from('farms')
//             .select('farm_id, owner_id');

//         if (fetchErr) throw fetchErr;

//         if (!farms || farms.length === 0) {
//             console.log("❌ Không tìm thấy Nông trại nào! Bạn nhớ chạy file seed-farms.js trước nhé.");
//             return;
//         }

//         console.log(`🏭 Đã tìm thấy ${farms.length} Nông trại. Bắt đầu thu hoạch...`);

//         const batchesToInsert = [];
//         const baseTimestamp = Date.now(); // Dùng timestamp làm ID để đảm bảo không trùng

//         // 2. Vòng lặp tạo 50 Lô hàng
//         for (let i = 1; i <= 50; i++) {
//             // Chọn ngẫu nhiên 1 nông trại từ danh sách
//             const randomFarm = farms[Math.floor(Math.random() * farms.length)];
            
//             // Random cân nặng từ 100kg đến 1000kg
//             const randomWeight = Math.floor(Math.random() * 900) + 100; 

//             batchesToInsert.push({
//                 chain_batch_id: (baseTimestamp + i).toString(), // Ép kiểu chuỗi cho ID Blockchain
//                 farm_id: randomFarm.farm_id,
//                 farmer_id: randomFarm.owner_id, // Nông dân tạo lô
//                 owner_id: randomFarm.owner_id,  // Ban đầu chủ sở hữu cũng chính là Nông dân
//                 initial_weight: randomWeight,
//                 status: 'Created'
//             });
//         }

//         // 3. Đẩy 50 lô hàng lên bảng 'batches'
//         console.log(`⏳ Đang đẩy 50 Lô hàng lên bảng 'batches'...`);
//         const { data: insertedBatches, error: batchErr } = await supabase
//             .from('batches')
//             .insert(batchesToInsert)
//             .select(); // Quan trọng: select() để lấy lại batch_id (UUID) vừa được tạo

//         if (batchErr) throw batchErr;
//         console.log(`✅ Đã tạo thành công ${insertedBatches.length} Lô hàng.`);

//         // 4. Bơm dữ liệu vào bảng 'batch_history' cho chuẩn logic
//         console.log(`⏳ Đang ghi nhận 50 dòng log vào bảng 'batch_history'...`);
        
//         const historyToInsert = insertedBatches.map(batch => ({
//             batch_id: batch.batch_id,
//             new_status: 'Created',
//             action_type: 'CREATE',
//             updated_by: batch.farmer_id,
//             tx_hash: '0x_mock_tx_hash_' + batch.chain_batch_id // Gắn mã hash giả lập
//         }));

//         const { error: historyErr } = await supabase
//             .from('batch_history')
//             .insert(historyToInsert);

//         if (historyErr) throw historyErr;

//         console.log("✅ THÀNH CÔNG RỰC RỠ TOÀN TẬP!");
//         console.log("👉 Bạn có thể vào Supabase -> Table Editor -> batches để xem thành quả.");
        
//         // In thử 3 lô hàng đầu tiên ra xem
//         console.log("\n📦 Dữ liệu mẫu (3 Lô hàng đầu tiên):");
//         console.table(insertedBatches.slice(0, 3).map(b => ({ 
//             'Chain ID': b.chain_batch_id, 
//             'Weight (kg)': b.initial_weight, 
//             'Status': b.status 
//         })));

//     } catch (err) {
//         console.error("❌ CÓ LỖI XẢY RA:", err.message);
//     }
// }

// // Chạy hàm
// seedBatches();

