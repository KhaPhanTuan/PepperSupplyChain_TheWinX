import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PepperModule = buildModule("PepperModule", (m) => {
  // Tên "PepperSupplyChain" phải khớp chính xác với tên contract trong file .sol
  const pepper = m.contract("PepperSupplyChain");

  return { pepper };
});

export default PepperModule;