/**
 * Migration 001 — Add openFoodFactsEnabled field to all existing stores
 *
 * Rule:
 *   supermarket → true   (needs nutrition data, expiry, barcodes)
 *   all others  → false
 *
 * Safe: uses $setOnInsert equivalent (only sets if field is missing).
 * Does not touch any other store field or data.
 */
import mongoose from "mongoose";

export const name = "001-open-food-facts-field";

export async function up(): Promise<string> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB not connected");

  const stores = db.collection("stores");

  // Set default for supermarkets that don't have the field yet
  const superRes = await stores.updateMany(
    { category: "supermarket", openFoodFactsEnabled: { $exists: false } },
    { $set: { openFoodFactsEnabled: true } }
  );

  // Set default false for all other categories missing the field
  const otherRes = await stores.updateMany(
    { category: { $ne: "supermarket" }, openFoodFactsEnabled: { $exists: false } },
    { $set: { openFoodFactsEnabled: false } }
  );

  return `supermarkets: ${superRes.modifiedCount} set true, others: ${otherRes.modifiedCount} set false`;
}
