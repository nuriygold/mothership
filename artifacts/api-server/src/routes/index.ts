import { Router, type IRouter } from "express";
import dispatchRouter from "./dispatch";
import healthRouter from "./health";
import opsRouter from "./ops";
import tellerRouter from "./teller";
import v2Router from "./v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dispatchRouter);
router.use(opsRouter);
router.use(tellerRouter);
router.use(v2Router);

export default router;
