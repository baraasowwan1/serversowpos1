/**
 * Database Seed — تهيئة البيانات الأولية
 * شغّله مرة واحدة فقط بعد إعداد قاعدة البيانات:
 * cd backend && node src/seed.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function seed() {
  console.log("🌱 Connecting to MongoDB Atlas...");
  await mongoose.connect(process.env["MONGODB_URI"] as string);
  console.log("✅ Connected to:", mongoose.connection.name);

  // ── حذف البيانات القديمة (اختياري) ────────────────────────
  // await mongoose.connection.dropDatabase();

  const db = mongoose.connection.db;
  if (!db) { console.error("No DB"); process.exit(1); }

  // ── إنشاء خطط الاشتراك ──────────────────────────────────────
  const existing = await db.collection("plans").countDocuments();
  if (existing === 0) {
    await db.collection("plans").insertMany([
      {
        nameAr: "المبتدئ",
        price: 15, yearlyPrice: 144,
        maxBranches: 1, maxUsers: 3, maxProducts: 500,
        maxInvoices: 1000, maxTerminals: 1,
        storage: "1 غيغابايت", apiAccess: false,
        features: ["نقطة بيع واحدة","إدارة المنتجات","تقارير أساسية","إدارة العملاء","دعم عبر البريد"],
        color: "#64748B", active: true,
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        nameAr: "الاحترافي",
        price: 35, yearlyPrice: 336,
        maxBranches: 3, maxUsers: 10, maxProducts: 2000,
        maxInvoices: 5000, maxTerminals: 5,
        storage: "5 غيغابايت", apiAccess: false,
        badge: "الأكثر شيوعاً",
        features: ["كل مزايا المبتدئ","إدارة متعددة الفروع","تقارير متقدمة","إدارة المخزون","ماسح الباركود","إدارة الموردين","دعم أولوية"],
        color: "#1D4ED8", active: true,
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        nameAr: "المؤسسي",
        price: 75, yearlyPrice: 720,
        maxBranches: 99, maxUsers: 99, maxProducts: 99999,
        maxInvoices: 99999, maxTerminals: 99,
        storage: "50 غيغابايت", apiAccess: true,
        features: ["كل مزايا الاحترافي","فروع غير محدودة","مستخدمون غير محدودون","وصول API كامل","تقارير مخصصة","نظام الولاء","إدارة المستودعات","نسخ احتياطي يومي","مدير حساب مخصص"],
        color: "#059669", active: true,
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    console.log("✅ Subscription plans created (3 plans)");
  } else {
    console.log(`ℹ️  Plans already exist (${existing} plans) — skipped`);
  }

  // ── إنشاء indexes للأداء ───────────────────────────────────
  await db.collection("stores").createIndex({ email: 1 }, { unique: true });
  await db.collection("products").createIndex({ storeId: 1, barcode: 1 });
  await db.collection("products").createIndex({ storeId: 1, sku: 1 });
  await db.collection("sales").createIndex({ storeId: 1, createdAt: -1 });
  await db.collection("customers").createIndex({ storeId: 1, phone: 1 });
  await db.collection("auditlogs").createIndex({ storeId: 1, createdAt: -1 });
  console.log("✅ Database indexes created");

  console.log("\n🎉 Database seeded successfully!");
  console.log("📊 Database name:", mongoose.connection.name);
  console.log("🔗 Cluster: sowwanpos.ewyiddb.mongodb.net");
  console.log("\nNext steps:");
  console.log("1. Deploy backend to Render.com");
  console.log("2. Add environment variables on Render");
  console.log("3. Deploy frontend to Vercel");
  console.log("4. Connect domain pos.sowwanjo.online");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error("❌ Seed failed:", err); process.exit(1); });
