const express = require("express");
const router = express.Router();
const { registerUser, verifyOtp, loginUser,addAddress, deleteAddressById,editaddress, updateAddressById , resendOtp,forgotPassword ,resetPassword,verifyForgotPasswordOtp} = require("../controllers/userControllers");
const bruteForcePrevent = require("../middlewares/bruteforcePrevent");
const {verifyToken} = require("../middlewares/auth");

// Routes
router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", loginUser);
router.post("/address",addAddress)
router.put("/address/:addressId",updateAddressById)
router.delete("/delete/:addressId ",deleteAddressById)

router.post("/forgot-password",forgotPassword)
router.post("/forgot-password/verify-otp", verifyForgotPasswordOtp);
router.post("/reset-password",resetPassword)



module.exports = router;
