// Thay toolbox bằng ethers, bỏ qua toàn bộ các thư viện test không cần thiết
import "@nomicfoundation/hardhat-ethers";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.20",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};

export default config;