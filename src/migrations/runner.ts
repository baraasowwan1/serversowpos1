/**
 * Migration Runner — نظام الترحيل الآمن للبيانات
 *
 * How it works:
 *  1. At server startup, runMigrations() is called after DB connects.
 *  2. It reads all *.migration.ts files from this directory.
 *  3. For each migration not yet in the `applied_migrations` collection, it runs it.
 *  4. On success the migration name is recorded so it never runs again.
 *  5. Failures are logged but do NOT crash the server — existing data is never lost.
 *
 * Adding a new migration:
 *  - Create backend/src/migrations/YYYYMMDD-description.migration.ts
 *  - Export: name (string), up(db) async function
 *  - Re-deploy — it runs once on all environments automatically.
 */
import mongoose, { Schema, Document } from "mongoose";
import * as m001 from "./001-open-food-facts-field.migration";
import * as m002 from "./002-print-shop-category.migration";

// ── Applied Migration record ──────────────────────────────────────────────────
interface IAppliedMigration extends Document {
  name: string;
  appliedAt: Date;
  durationMs: number;
  result: string;
}
const AppliedMigrationSchema = new Schema<IAppliedMigration>({
  name:       { type: String, required: true, unique: true },
  appliedAt:  { type: Date,   default: Date.now },
  durationMs: { type: Number, default: 0 },
  result:     { type: String, default: "" },
});
const AppliedMigration = mongoose.model<IAppliedMigration>("AppliedMigration", AppliedMigrationSchema);

// ── Migration registry — add new migrations here in order ────────────────────
const MIGRATIONS: { name: string; up: () => Promise<string> }[] = [
  m001,
  m002,
];

// ── Runner ────────────────────────────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  console.log("🔄 Checking pending migrations...");

  for (const migration of MIGRATIONS) {
    const already = await AppliedMigration.findOne({ name: migration.name });
    if (already) {
      console.log(`  ✅ Already applied: ${migration.name}`);
      continue;
    }

    console.log(`  ⏳ Running: ${migration.name}`);
    const start = Date.now();
    try {
      const result = await migration.up();
      const durationMs = Date.now() - start;
      await AppliedMigration.create({ name: migration.name, durationMs, result });
      console.log(`  ✅ Done (${durationMs}ms): ${migration.name} — ${result}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed: ${migration.name} — ${msg}`);
      // Record the failure but do NOT re-throw — server must keep running
      await AppliedMigration.create({
        name: migration.name,
        durationMs: Date.now() - start,
        result: `FAILED: ${msg}`,
      }).catch(() => {});
    }
  }

  console.log("✅ Migration check complete.");
}
