import { expect } from "chai";
import { network } from "hardhat";
import { PepperSupplyChain } from "../typechain-types";

const { ethers } = await network.connect();

describe("PepperSupplyChain", function () {
  let pepperChain: PepperSupplyChain;
  let admin: any;
  let farmer: any;
  let processor: any;
  let distributor: any;
  let retailer: any;
  let certifier: any;
  let buyer: any;

  const FARM_ID = ethers.id("FARM_001");
  const LOT_ID = 1n;
  const WEIGHT = 1000n;
  const PRICE = ethers.parseEther("10");

  beforeEach(async function () {
    [admin, farmer, processor, distributor, retailer, certifier, buyer] =
      await ethers.getSigners();

    pepperChain = await ethers.deployContract("PepperSupplyChain");
  });

  describe("Role Management", function () {
    it("Should grant farmer role", async function () {
      await expect(pepperChain.grantFarmer(farmer.address))
        .to.emit(pepperChain, "RoleGranted")
        .withArgs("FARMER", farmer.address);

      expect(await pepperChain.farmers(farmer.address)).to.be.true;
    });

    it("Should grant all roles", async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantProcessor(processor.address);
      await pepperChain.grantDistributor(distributor.address);
      await pepperChain.grantRetailer(retailer.address);
      await pepperChain.grantCertifier(certifier.address);

      expect(await pepperChain.farmers(farmer.address)).to.be.true;
      expect(await pepperChain.processors(processor.address)).to.be.true;
      expect(await pepperChain.distributors(distributor.address)).to.be.true;
      expect(await pepperChain.retailers(retailer.address)).to.be.true;
      expect(await pepperChain.certifiers(certifier.address)).to.be.true;
    });

    it("Should revoke farmer role", async function () {
      await pepperChain.grantFarmer(farmer.address);
      expect(await pepperChain.farmers(farmer.address)).to.be.true;

      await pepperChain.revokeFarmer(farmer.address);
      expect(await pepperChain.farmers(farmer.address)).to.be.false;
    });

    it("Should only allow admin to grant roles", async function () {
      await expect(
        pepperChain.connect(farmer).grantFarmer(farmer.address)
      ).to.be.revertedWith("ONLY_ADMIN");
    });
  });

  describe("Farm Certification", function () {
    beforeEach(async function () {
      await pepperChain.grantCertifier(certifier.address);
    });

    it("Should certify a farm", async function () {
      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

      await expect(
        pepperChain
          .connect(certifier)
          .certifyFarm(FARM_ID, certHash, validUntil)
      )
        .to.emit(pepperChain, "FarmCertified")
        .withArgs(FARM_ID);

      const farm = await pepperChain.farms(FARM_ID);
      expect(farm.certified).to.be.true;
      expect(farm.certHash).to.equal(certHash);
      expect(farm.validUntil).to.equal(validUntil);
    });

    it("Should update farm certification", async function () {
      const certHash1 = ethers.id("CERT_HASH_001");
      const certHash2 = ethers.id("CERT_HASH_002");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash1, validUntil);

      const newValidUntil = validUntil + 100;
      await pepperChain
        .connect(certifier)
        .updateFarmCertification(FARM_ID, certHash2, newValidUntil);

      const farm = await pepperChain.farms(FARM_ID);
      expect(farm.certHash).to.equal(certHash2);
      expect(farm.validUntil).to.equal(newValidUntil);
    });
  });

  describe("Lot Creation and Management", function () {
    beforeEach(async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantCertifier(certifier.address);
      await pepperChain.grantProcessor(processor.address);
      await pepperChain.grantDistributor(distributor.address);
      await pepperChain.grantRetailer(retailer.address);

      // Certify farm
      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash, validUntil);
    });

    it("Should create a lot", async function () {
      await expect(
        pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT)
      )
        .to.emit(pepperChain, "LotCreated")
        .withArgs(LOT_ID, farmer.address);

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.id).to.equal(LOT_ID);
      expect(lot.farmId).to.equal(FARM_ID);
      expect(lot.farmer).to.equal(farmer.address);
      expect(lot.owner).to.equal(farmer.address);
      expect(lot.initialWeight).to.equal(WEIGHT);
    });

    it("Should not allow non-farmer to create lot", async function () {
      await expect(
        pepperChain.connect(buyer).createLot(LOT_ID, FARM_ID, WEIGHT)
      ).to.be.revertedWith("ONLY_FARMER");
    });

    it("Should not create lot for uncertified farm", async function () {
      const uncertifiedFarmId = ethers.id("UNCERTIFIED_FARM");
      await expect(
        pepperChain.connect(farmer).createLot(LOT_ID, uncertifiedFarmId, WEIGHT)
      ).to.be.revertedWith("FARM_NOT_CERTIFIED");
    });

    it("Should set price for lot", async function () {
      await pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT);
      await pepperChain.connect(farmer).setPrice(LOT_ID, PRICE);

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.price).to.equal(PRICE);
    });
  });

  describe("Buying Lot", function () {
    beforeEach(async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantCertifier(certifier.address);
      await pepperChain.grantProcessor(processor.address);

      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash, validUntil);

      await pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT);
      await pepperChain.connect(farmer).setPrice(LOT_ID, PRICE);
    });

    it("Should buy a lot", async function () {
      await expect(
        pepperChain
          .connect(processor)
          .buyLot(LOT_ID, { value: PRICE })
      )
        .to.emit(pepperChain, "OwnershipTransferred")
        .withArgs(LOT_ID, farmer.address, processor.address);

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.owner).to.equal(processor.address);
      expect(lot.escrow).to.equal(PRICE);
    });

    it("Should reject purchase with insufficient payment", async function () {
      const insufficientPrice = PRICE / 2n;
      await expect(
        pepperChain
          .connect(processor)
          .buyLot(LOT_ID, { value: insufficientPrice })
      ).to.be.revertedWith("INSUFFICIENT_PAYMENT");
    });
  });

  describe("Processing and Shipping", function () {
    beforeEach(async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantCertifier(certifier.address);
      await pepperChain.grantProcessor(processor.address);
      await pepperChain.grantDistributor(distributor.address);
      // Processor also needs distributor role to ship after processing
      await pepperChain.grantDistributor(processor.address);

      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash, validUntil);

      await pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT);
      await pepperChain.connect(farmer).setPrice(LOT_ID, PRICE);
      await pepperChain
        .connect(processor)
        .buyLot(LOT_ID, { value: PRICE });
    });

    it("Should process a lot", async function () {
      const processedWeight = 950n;
      await expect(
        pepperChain
          .connect(processor)
          .processLot(LOT_ID, processedWeight)
      )
        .to.emit(pepperChain, "StatusChanged");

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.status).to.equal(1); // Status.Processed
      expect(lot.processedWeight).to.equal(processedWeight);
    });

    it("Should ship a lot after processing", async function () {
      const processedWeight = 950n;
      await pepperChain
        .connect(processor)
        .processLot(LOT_ID, processedWeight);

      await expect(
        pepperChain
          .connect(processor)
          .markShipped(LOT_ID)
      )
        .to.emit(pepperChain, "StatusChanged");

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.status).to.equal(2); // Status.Shipped
    });
  });

  describe("Selling and Payment", function () {
    beforeEach(async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantCertifier(certifier.address);
      await pepperChain.grantProcessor(processor.address);
      await pepperChain.grantDistributor(distributor.address);
      await pepperChain.grantRetailer(retailer.address);
      // Processor needs distributor role to mark as shipped
      await pepperChain.grantDistributor(processor.address);

      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash, validUntil);

      await pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT);
      await pepperChain.connect(farmer).setPrice(LOT_ID, PRICE);
      await pepperChain
        .connect(processor)
        .buyLot(LOT_ID, { value: PRICE });
      await pepperChain
        .connect(processor)
        .processLot(LOT_ID, 950n);
      await pepperChain
        .connect(processor)
        .markShipped(LOT_ID);
      // Retailer buys the lot from processor
      await pepperChain
        .connect(retailer)
        .buyLot(LOT_ID, { value: PRICE });
    });

    it("Should mark lot as sold and release escrow", async function () {
      await expect(
        pepperChain
          .connect(retailer)
          .markSold(LOT_ID)
      )
        .to.emit(pepperChain, "StatusChanged")
        .to.emit(pepperChain, "PaymentReleased");

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.status).to.equal(3); // Status.Sold
      expect(lot.escrowPaid).to.be.true;
    });
  });

  describe("Flagging and Recall", function () {
    beforeEach(async function () {
      await pepperChain.grantFarmer(farmer.address);
      await pepperChain.grantCertifier(certifier.address);

      const certHash = ethers.id("CERT_HASH_001");
      const validUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      await pepperChain
        .connect(certifier)
        .certifyFarm(FARM_ID, certHash, validUntil);

      await pepperChain.connect(farmer).createLot(LOT_ID, FARM_ID, WEIGHT);
    });

    it("Should flag a lot", async function () {
      await expect(pepperChain.flagLot(LOT_ID))
        .to.emit(pepperChain, "LotFlagged");

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.flagged).to.be.true;
      expect(lot.status).to.equal(4); // Status.Flagged
    });

    it("Should recall a lot", async function () {
      await expect(pepperChain.recallLot(LOT_ID))
        .to.emit(pepperChain, "LotRecalled");

      const lot = await pepperChain.getLot(LOT_ID);
      expect(lot.flagged).to.be.true;
    });
  });
});
