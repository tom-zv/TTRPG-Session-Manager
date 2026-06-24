import express from "express";
import userController from "./userController.js";
import { userAuth, requireGm } from "src/middleware/userAuth.js";

// Base route - api/users
const router = express.Router();

// GET /users - All users, for GM pickers
router.get("/", userAuth(), requireGm, userController.getUsers);
router.get("/me", userAuth(), userController.getMe);
router.get("/me/preferences", userAuth(), userController.getPreferences);
router.patch("/me/preferences", userAuth(), requireGm, userController.patchPreferences);

export default router;
