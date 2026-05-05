import { Router, type IRouter } from "express";
import healthRouter from "./health";
import opsRouter from "./ops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(opsRouter);

export default router;
