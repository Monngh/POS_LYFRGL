import { Router } from "express";
import { PromotionController } from "../controllers/promotion.controller";

const router = Router();

router.get("/active", PromotionController.getActive);
router.get("/search", PromotionController.search);
router.post("/calculate", PromotionController.calculate);


export default router;
