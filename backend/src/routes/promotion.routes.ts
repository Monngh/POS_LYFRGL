import { Router } from "express";
import { PromotionController } from "../controllers/promotion.controller";

const router = Router();

router.get("/active", PromotionController.getActive);
router.post("/calculate", PromotionController.calculate);

export default router;
