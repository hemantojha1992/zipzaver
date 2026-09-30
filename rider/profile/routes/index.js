const express = require('express');
const router = express.Router();
const AuthController = require('../controller/auth.controller');
const validate = require('../../middleware/validate');
const { authSchema ,sendOtpSchema,verifyOtpSchema} = require('../services/auth.validation');

router.post('/login',validate(authSchema),AuthController.login);
router.post('/logout',AuthController.logout);


router.post('/send-otp',validate(sendOtpSchema),AuthController.sendOtp);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/resend-otp', AuthController.resendOtp);

module.exports = router;