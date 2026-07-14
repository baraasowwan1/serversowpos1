import { Router, Response } from "express";
import mongoose from "mongoose";
import { authMiddleware, AuthRequest, scopeToStore } from "../middleware/auth";
import { requirePermission, ownerOnly } from "../middleware/roleGuard";

const router = Router();
router.use(authMiddleware);

const Expense = mongoose.model("Expense");

function errRes(res: Response, req: AuthRequest, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: req.requestId });
}

router.get("/", requirePermission("expenses:read"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const items = await Expense.find({ storeId: scope.storeId }).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch {
    return errRes(res, req, 500, "FETCH_ERROR", "خطأ في جلب المصروفات");
  }
});

router.post("/", requirePermission("expenses:create"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const item = await Expense.create({ ...req.body, storeId: scope.storeId });
    res.status(201).json({ success: true, data: item });
  } catch {
    return errRes(res, req, 500, "CREATE_ERROR", "خطأ في إضافة المصروف");
  }
});

router.put("/:id", requirePermission("expenses:update"), async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    const item = await Expense.findOneAndUpdate(
      { _id: req.params["id"], storeId: scope.storeId },
      req.body,
      { new: true }
    );
    if (!item) return errRes(res, req, 404, "NOT_FOUND", "المصروف غير موجود");
    res.json({ success: true, data: item });
  } catch {
    return errRes(res, req, 500, "UPDATE_ERROR", "خطأ في تعديل المصروف");
  }
});

router.delete("/:id", ownerOnly, async (req: AuthRequest, res: Response) => {
  try {
    const scope = scopeToStore(req);
    await Expense.findOneAndDelete({ _id: req.params["id"], storeId: scope.storeId });
    res.json({ success: true, message: "تم حذف المصروف" });
  } catch {
    return errRes(res, req, 500, "DELETE_ERROR", "خطأ في حذف المصروف");
  }
});

export default router;
