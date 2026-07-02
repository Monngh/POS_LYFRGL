import { Router } from "express";
import {
  addCategoryProducts,
  createCategory,
  deleteCategory,
  getCategoriesFlat,
  getCategoryDetail,
  getCategoryProducts,
  getCategoryTree,
  getUncategorizedProducts,
  reassignCategoryProducts,
  removeCategoryProduct,
  replaceCategoryProducts,
  updateCategory,
  updateCategoryStatus,
} from "../controllers/adminCategory.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN"]));

router.get("/", getCategoryTree);
router.get("/flat", getCategoriesFlat);
router.get("/products/uncategorized", getUncategorizedProducts);

router.post("/", createCategory);
router.get("/:id", getCategoryDetail);
router.put("/:id", updateCategory);
router.patch("/:id/status", updateCategoryStatus);
router.delete("/:id", deleteCategory);

router.get("/:id/products", getCategoryProducts);
router.put("/:id/products", replaceCategoryProducts);
router.post("/:id/products", addCategoryProducts);
router.delete("/:id/products/:productId", removeCategoryProduct);
router.post("/:id/reassign-products", reassignCategoryProducts);

export default router;
