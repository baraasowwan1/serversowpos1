/**
 * Store Settings Routes — إعدادات المتجر
 */
import { Router, Response } from "express";
import { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

type AnyMongooseModel = Model<any>;

const settingsSchema = new Schema({
  storeId:      { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
  storeName:    { type: String, default: "" },
  phone:        { type: String, default: "" },
  address:      { type: String, default: "" },
  language:     { type: String, default: "ar" },
  receiptLang:  { type: String, default: "both" },
  currency:     { type: String, default: "JOD" },
  taxRate:      { type: Number, default: 16 },
  paperSize:    { type: String, default: "80mm" },
  printCopies:  { type: String, default: "1" },
  printLogo:    { type: Boolean, default: true },
  printTax:     { type: Boolean, default: true },
  printPhone:   { type: Boolean, default: true },
  printBarcode: { type: Boolean, default: false },
}, { timestamps: true });

const SettingsModel: AnyMongooseModel =
  mongoose.models["Setting"] || mongoose.model("Setting", settingsSchema);

// جلب إعدادات المتجر
router.get("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  let settings = await SettingsModel.findOne({ storeId: scope.storeId });
  if (!settings) {
    settings = await SettingsModel.create({ storeId: scope.storeId });
  }
  res.json(settings);
});

// تحديث إعدادات المتجر
router.put("/", async (req: AuthRequest, res: Response) => {
  const scope = scopeToStore(req);
  const allowed = [
    "storeName","phone","address","language","receiptLang","currency",
    "taxRate","paperSize","printCopies","printLogo","printTax","printPhone","printBarcode"
  ];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );
  const settings = await SettingsModel.findOneAndUpdate(
    { storeId: scope.storeId },
    { $set: updates },
    { new: true, upsert: true }
  );
  res.json(settings);
});

export default router;
