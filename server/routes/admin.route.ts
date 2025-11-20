import express from "express";
import {
  adminLogin,
  getDriversForReview,
  updateDriverReviewStatus,
  updateDriverWalletBalance,
  getDriverWalletHistory,
  deleteDriver,
} from "../controllers/admin.controller";
import { isAuthenticatedAdmin } from "../middleware/isAuthenticated";

const adminRouter = express.Router();

adminRouter.post("/login", adminLogin);
adminRouter.get("/drivers", isAuthenticatedAdmin, getDriversForReview);
adminRouter.patch(
  "/drivers/:driverId",
  isAuthenticatedAdmin,
  updateDriverReviewStatus
);
adminRouter.patch(
  "/drivers/:driverId/wallet",
  isAuthenticatedAdmin,
  updateDriverWalletBalance
);
adminRouter.get(
  "/drivers/:driverId/wallet/history",
  isAuthenticatedAdmin,
  getDriverWalletHistory
);
adminRouter.delete(
  "/drivers/:driverId",
  isAuthenticatedAdmin,
  deleteDriver
);

export default adminRouter;

