/**
 * Migration 002 — Add print_shop default fields to existing stores
 *
 * print_shop stores:
 *   openFoodFactsEnabled = false (not a food store)
 *
 * All existing stores already handled by migration 001.
 * This migration ensures new print_shop stores created before
 * this deploy get their defaults set correctly.
 */
import mongoose from "mongoose";

export const name = "002-print-shop-category";

export async function up(): Promise<string> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB not connected");

  const stores = db.collection("stores");

  // print_shop is never a food store
  const res = await stores.updateMany(
    { category: "print_shop", openFoodFactsEnabled: { $exists: false } },
    { $set: { openFoodFactsEnabled: false } }
  );

  return `print_shop stores updated: ${res.modifiedCount}`;
}
