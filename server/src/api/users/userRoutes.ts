import express from "express";
import userController from "./userController.js";
import { userAuth } from "src/middleware/userAuth.js";

// Base route - api/users
const router = express.Router();

router.get("/me", userAuth(), userController.getMe);

export default router;