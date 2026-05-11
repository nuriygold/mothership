import { Router, type IRouter } from "express";
import healthRouter from "./health";
import opsRouter from "./ops";
import v2Router from "./v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(opsRouter);
router.use(v2Router);

export default router;