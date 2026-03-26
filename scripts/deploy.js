import { ethers } from "ethers";
import fs from "fs";

async function main() {
  console.log("⏳ Đang đọc file biên dịch...");
  
  // 1. Đọc trực tiếp file Artifact mà Hardhat vừa biên dịch xong
  const artifactJson = fs.readFileSync("./artifacts/contracts/PepperSupplyChain.sol/PepperSupplyChain.json", "utf8");
  const artifact = JSON.parse(artifactJson);

  console.log("⏳ Đang kết nối Node bằng Ethers.js thuần...");
  
  // 2. Kết nối với Hardhat Node đang chạy
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // 3. Dùng Private Key mặc định số 0 của mạng Local
  const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

  console.log("🚀 Đang đẩy Contract lên mạng...");
  
  // 4. Đóng gói và Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const pepper = await factory.deploy();

  await pepper.waitForDeployment();

  console.log("-----------------------------------------------");
  console.log(`✅ Thành công! Contract Address: ${await pepper.getAddress()}`);
  console.log("-----------------------------------------------");
}

main().catch((error) => {
  console.error("❌ LỖI:", error);
  process.exit(1);
});