import express from "express";
import authController from "./authController.js";
import { AuthRequest, userAuth } from "src/middleware/userAuth.js";
import { userSessionToDTO } from "src/utils/format-transformers/users-transformer.js";
import { ValidationError } from "../HttpErrors.js";
import { trimBodyStrings } from "src/middleware/trimBodyStrings.js";

/**  TODO: 
 *   - add input format verification  
*/
 
// Base route - api/auth
const router = express.Router();

router.get("/user-session", userAuth(), (req,res) => {
    // userAuth handles token verification and populates req.userSession
    const authReq = req as AuthRequest;
    
    if(!authReq.userSession) {
        throw new ValidationError("No user session found");
    }
    res.json(userSessionToDTO(authReq.userSession))
    }
);

router.post("/login", trimBodyStrings, authController.login);
router.post("/logout", authController.logout);
router.post("/register", trimBodyStrings, authController.registerUser);

export default router;