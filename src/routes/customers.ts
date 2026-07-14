import { Router, Response } from "express";
import { Customer } from "../models/index";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

router.get("/", requirePermission("customers:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const items = await Customer.find({ storeId: scope.storeId }).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب العملاء");
  }
});

router.post("/", requirePermission("customers:create"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const item = await Customer.create({ ...req.body, storeId: scope.storeId });
    res.status(201).json({ success: true, data: item });
  } catch {
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة العميل");
  }
});

router.put("/:id", requirePermission("customers:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const id = req.params["id"];
    const item = await Customer.findOneAndUpdate(
      { _id: id, storeId: scope.storeId },
      req.body,
      { new: true }
    );
    if (!item) return errRes(res, req, 404, "NOT_FOUND", "العميل غير موجود");
    res.json({ success: true, data: item });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل العميل");
  }
});

// تحصيل ذمة — خصم مبلغ من دين العميل
router.patch("/:id/collect-debt", requirePermission("customers:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const id = req.params["id"];
    const { amount } = req.body;
    if (!amount || amount <= 0) return errRes(res, req, 400, "INVALID_AMOUNT", "المبلغ غير صحيح");
    const cust = await Customer.findOne({ _id: id, storeId: scope.storeId });
    if (!cust) return errRes(res, req, 404, "NOT_FOUND", "العميل غير موجود");
    const newDebt = Math.max(0, (cust.debt || 0) - amount);
    const updated = await Customer.findOneAndUpdate(
      { _id: id, storeId: scope.storeId },
      { debt: newDebt },
      { new: true }
    );
    return res.json({ success: true, data: updated });
  } catch {
    return errRes(res, req, 500, "COLLECT_DEBT_ERROR", "خطأ في تحصيل الذمة");
  }
});

router.delete("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const id = req.params["id"];
    await Customer.findOneAndDelete({ _id: id, storeId: scope.storeId });
    res.json({ success: true, message: "تم حذف العميل" });
  } catch {
    return errRes(res, req, 500, "DELETE_ERROR", "خطأ في حذف العميل");
  }
});

export default router;
