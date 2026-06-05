import { Router } from "express";
import {
  deletePromotionProduct,
  getPromotionDetail,
  listActiveProducts,
  listPromotionTypes,
  listPromotions,
  patchPromotionStatus,
  postPromotion,
  postPromotionProducts,
  putPromotion,
  putPromotionProducts,
} from "../controllers/adminPromotion.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN", "GERENTE"]));

router.get("/promotion-types", listPromotionTypes);
router.get("/products/active", listActiveProducts);

router.get("/promotions", listPromotions);
router.post("/promotions", postPromotion);
router.get("/promotions/:id", getPromotionDetail);
router.put("/promotions/:id", putPromotion);
router.patch("/promotions/:id/status", patchPromotionStatus);
router.post("/promotions/:id/products", postPromotionProducts);
router.put("/promotions/:id/products", putPromotionProducts);
router.delete("/promotions/:id/products/:productId", deletePromotionProduct);

export default router;
