const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { createLot, mergeLots, buyLot } = require("./func");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// =====================================================================
// ENDPOINTS
// =====================================================================

/**
 * POST /lot - Create a new lot (batch)
 * Body: { id, farmId, weight, farmerWallet? }
 */
app.post("/lot", async (req, res) => {
  try {
    const { id, farmId, weight, farmerWallet } = req.body;

    if (!id || !farmId || !weight) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: id, farmId, weight",
      });
    }

    const result = await createLot(
      id,
      farmId,
      weight,
      farmerWallet || process.env.WALLET_ADDRESS
    );

    res.json({
      success: true,
      txHash: result.txHash,
      message: `Lot ${id} created successfully`,
    });
  } catch (error) {
    console.error("Error creating lot:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /lot/merge - Merge multiple lots
 * Body: { newId, sourceIds, processorWallet? }
 */
app.post("/lot/merge", async (req, res) => {
  try {
    const { newId, sourceIds, processorWallet } = req.body;

    if (!newId || !sourceIds || sourceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: newId, sourceIds[]",
      });
    }

    const result = await mergeLots(
      newId,
      sourceIds,
      processorWallet || process.env.WALLET_ADDRESS
    );

    res.json({
      success: true,
      txHash: result.txHash,
      message: `Lots merged into ${newId} successfully`,
    });
  } catch (error) {
    console.error("Error merging lots:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /lot/:id/buy - Buy a lot
 * Body: { value (in ETH), buyerWallet? }
 */
app.post("/lot/:id/buy", async (req, res) => {
  try {
    const { id } = req.params;
    const { value, buyerWallet } = req.body;

    if (!value) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: value (in ETH)",
      });
    }

    const result = await buyLot(
      id,
      buyerWallet || process.env.WALLET_ADDRESS,
      value
    );

    res.json({
      success: true,
      txHash: result.txHash,
      message: `Lot ${id} purchased successfully`,
    });
  } catch (error) {
    console.error("Error buying lot:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


/**
 * GET /health - Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// =====================================================================
// ERROR HANDLING
// =====================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path,
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

// =====================================================================
// START SERVER
// =====================================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Available Endpoints:`);
  console.log(`   POST /lot - Create lot (batch)`);
  console.log(`   POST /lot/merge - Merge multiple lots`);
  console.log(`   POST /lot/:id/buy - Buy a lot`);
  console.log(`   GET /health - Health check`);
});
