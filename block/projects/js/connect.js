// connect.js - Full & cải tiến: Tự lower case + dễ quản lý địa chỉ

let currentAccount = null;

// ==================== DANH SÁCH ĐỊA CHỈ VÍ (NHẬP BÌNH THƯỜNG CŨNG ĐƯỢC) ====================
const roleMap = {
  "0x2Da7b42deEd538d00D9139fa9b4498E9b50CB533": "farmer",
  "0x355946B10DCbb7d6090fe7d1aDFCcD7929CDf418": "processor",
  "0xA49AF12E2858AB54dc25E4fFFFfC08942F7094F6": "distributor",
  "0x331e2eC5b5D638ccA5Ad3eE6E2FA2885cAF2da8e": "certifier",
  "0x373e45b298b8b80d74469E981b7880171A14C5cb": "retailer",
};

// Chuyển toàn bộ roleMap về chữ thường khi khởi động
const normalizedRoleMap = Object.fromEntries(
  Object.entries(roleMap).map(([address, role]) => [address.toLowerCase(), role])
);

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("Vui lòng cài MetaMask để kết nối ví!");
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    currentAccount = accounts[0].toLowerCase();

    console.log("🔗 Địa chỉ ví vừa connect:", currentAccount);

    const role = normalizedRoleMap[currentAccount] || "unknown";

    console.log("📌 Role tìm được:", role);

    // Cập nhật nút
    updateWalletButton();

    // Chuyển hướng theo role
    switch (role) {
      case "farmer":
        window.location.href = "farm_01.html";
        break;
      case "processor":
        window.location.href = "process_01.html";
        break;
      case "distributor":
        window.location.href = "distribution.html";
        break;
      case "certifier":
        window.location.href = "cert_01.html";
        break;
      case "retailer":
        window.location.href = "retail.html";
        break;
      default:
        alert(`Tài khoản ${currentAccount.slice(0,6)}...${currentAccount.slice(-4)}\n\nChưa được cấp quyền trong hệ thống!`);
    }

  } catch (error) {
    console.error(error);
    alert("Kết nối ví bị từ chối hoặc xảy ra lỗi!");
  }
}

function updateWalletButton() {
  const btn = document.getElementById("connectWalletBtn");
  if (btn && currentAccount) {
    btn.textContent = `${currentAccount.slice(0,6)}...${currentAccount.slice(-4)}`;
  }
}

// Reset wallet khi quay về trang chính
function resetWalletOnMain() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("main.html") || 
      path.includes("index.html") || 
      path.endsWith("/") || 
      path === "") {
    
    currentAccount = null;
    const btn = document.getElementById("connectWalletBtn");
    if (btn) btn.textContent = "Connect Wallet";
  }
}

// Khởi tạo
document.addEventListener("DOMContentLoaded", () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  if (connectBtn) {
    connectBtn.addEventListener("click", connectWallet);
  }

  resetWalletOnMain();
  window.addEventListener("pageshow", resetWalletOnMain);
});