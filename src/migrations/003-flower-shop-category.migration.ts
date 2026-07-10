/**
 * Migration 003 — Add flower_shop default fields to existing stores
 * flower_shop: openFoodFactsEnabled = false
 */
import mongoose from "mongoose";

export const name = "003-flower-shop-category";

export async function up(): Promise<string> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB not connected");

  const res = await db.collection("stores").updateMany(
    { category: "flower_shop", openFoodFactsEnabled: { $exists: false } },
    { $set: { openFoodFactsEnabled: false } }
  );

  return `flower_shop stores updated: ${res.modifiedCount}`;
}
