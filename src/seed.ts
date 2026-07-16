/**
 * Database Seed — تهيئة البيانات الأولية
 * شغّله مرة واحدة:  cd backend && npx ts-node src/seed.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

async function seed() {
  console.log("🌱 Connecting to MongoDB Atlas...");
  await mongoose.connect(process.env["MONGODB_URI"] as string);
  console.log("✅ Connected:", mongoose.connection.name);

  const db = mongoose.connection.db;
  if (!db) { console.error("No DB connection"); process.exit(1); }

  // ── خطط الاشتراك ────────────────────────────────────────────────────────────
  const plansCount = await db.collection("plans").countDocuments();
  if (plansCount === 0) {
    await db.collection("plans").insertMany([
      {
        nameAr: "المبتدئ", price: 15, yearlyPrice: 144,
        maxBranches: 1, maxUsers: 3, maxProducts: 500, maxInvoices: 1000, maxTerminals: 1,
        storage: "1 غيغابايت", apiAccess: false, color: "#64748B", active: true,
        features: ["نقطة بيع واحدة","إدارة المنتجات","تقارير أساسية","إدارة العملاء","دعم عبر البريد"],
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        nameAr: "الاحترافي", price: 35, yearlyPrice: 336,
        maxBranches: 3, maxUsers: 10, maxProducts: 2000, maxInvoices: 5000, maxTerminals: 5,
        storage: "5 غيغابايت", apiAccess: false, color: "#1D4ED8", active: true, badge: "الأكثر شيوعاً",
        features: ["كل مزايا المبتدئ","إدارة متعددة الفروع","تقارير متقدمة","إدارة المخزون","ماسح الباركود","دعم أولوية"],
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        nameAr: "المؤسسي", price: 75, yearlyPrice: 720,
        maxBranches: 99, maxUsers: 99, maxProducts: 99999, maxInvoices: 99999, maxTerminals: 99,
        storage: "50 غيغابايت", apiAccess: true, color: "#059669", active: true,
        features: ["كل مزايا الاحترافي","فروع غير محدودة","مستخدمون غير محدودون","وصول API","نسخ احتياطي يومي","مدير حساب مخصص"],
        createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    console.log("✅ Subscription plans created (3 plans)");
  } else {
    console.log(`ℹ️  Plans exist (${plansCount}) — skipped`);
  }

  // ── متجر تجريبي ────────────────────────────────────────────────────────────
  const demoEmail = "demo@store.com";
  const demoPassword = "demo123"; // كلمة المرور الواضحة للتجربة
  
  const storeExists = await db.collection("stores").findOne({ email: demoEmail });
  if (!storeExists) {
    console.log("🏪 Creating demo store...");
    
    const hashedPassword = await bcrypt.hash(demoPassword, 12);
    
    const demoStore = await db.collection("stores").insertOne({
      nameAr: "متجر تجريبي",
      nameEn: "Demo Store",
      category: "supermarket",
      owner: "المدير التجريبي",
      email: demoEmail,
      phone: "0791234567",
      city: "عمان",
      status: "active",
      plan: "الاحترافي",
      taxNo: "",
      vatRate: 0.16,
      currency: "JOD",
      language: "ar",
      expiresAt: new Date(Date.now() + 365 * 86400000), // سنة كاملة
      appName: "",
      primaryColor: "",
      logoUrl: "",
      iconUrl: "",
      splashLogoUrl: "",
      receiptLogoUrl: "",
      sidebarFeatures: {
        pos: true, products: true, inventory: true,
        sales: true, customers: true, suppliers: true,
        purchases: true, purchaseOrders: true, reports: true,
        expenses: true, users: true, settings: true,
        branches: false, promotions: true, returns: true,
        loyalty: false, sync: true,
      },
      openFoodFactsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection("users").insertOne({
      storeId: demoStore.insertedId,
      name: "المدير التجريبي",
      email: demoEmail,
      username: "demo",
      password: hashedPassword,
      role: "owner",
      status: "active",
      shift: "flexible",
      shiftStart: "",
      shiftEnd: "",
      branchName: "",
      phone: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("✅ Demo store created!");
    console.log("📧 Email:", demoEmail);
    console.log("🔑 Password:", demoPassword);
  } else {
    console.log("ℹ️  Demo store already exists — skipped");
  }

  // ── Database Indexes للأداء ──────────────────────────────────────────────────
  await db.collection("stores").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ storeId: 1, email: 1 });
  await db.collection("users").createIndex({ storeId: 1, role: 1 });
  await db.collection("users").createIndex({ storeId: 1, username: 1 }, { sparse: true });
  await db.collection("users").createIndex({ storeId: 1, phone: 1 }, { sparse: true });
  await db.collection("products").createIndex({ storeId: 1, barcode: 1 });
  await db.collection("products").createIndex({ storeId: 1, sku: 1 });
  await db.collection("products").createIndex({ storeId: 1, isActive: 1, category: 1 });
  await db.collection("sales").createIndex({ storeId: 1, createdAt: -1 });
  await db.collection("sales").createIndex({ storeId: 1, invoiceNo: 1 }, { unique: true, sparse: true });
  await db.collection("customers").createIndex({ storeId: 1, phone: 1 });
  await db.collection("auditlogs").createIndex({ storeId: 1, createdAt: -1 });
  console.log("✅ Database indexes created");

  console.log("\n🎉 Database seeded successfully!");
  console.log("📊 Collections ready: stores, users, plans, products, sales, customers...");
  console.log("\n🔑 Demo Store Login:");
  console.log("   Email: demo@store.com");
  console.log("   Password: demo123");
  console.log("\n🔑 Auth flow:");
  console.log("   1. Super Admin creates store → POST /api/stores");
  console.log("   2. System creates store + user in MongoDB");
  console.log("   3. Store owner logs in → POST /api/auth/login");
  console.log("   4. Works from ANY browser, device, location ✅");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
