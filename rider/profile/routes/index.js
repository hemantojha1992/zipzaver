const express = require('express');
const router = express.Router();
const AuthController = require('../controller/auth.controller');
const validate = require('../../middleware/validate');
const upload = require('../../../middleware/upload');
const { authSchema ,sendOtpSchema,verifyOtpSchema,updateProfileSchema} = require('../services/auth.validation');

router.post('/login',validate(authSchema),AuthController.login);
router.post('/logout',AuthController.logout);


router.post('/send-otp',validate(sendOtpSchema),AuthController.sendOtp);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/resend-otp', AuthController.resendOtp);

//router.post('/update-profile', validate(updateProfileSchema), AuthController.updateProfile);
router.post(
    '/update-profile',
    upload.fields([
        { name: 'profile_image', maxCount: 1 },
        { name: 'aadhar_front', maxCount: 1 },
        { name: 'aadhar_back', maxCount: 1 },
        { name: 'dl_front', maxCount: 1 },
        { name: 'dl_back', maxCount: 1 },
        { name: 'pan_image', maxCount: 1 },
        { name: 'vehicle_photo', maxCount: 1 },
        { name: 'rc_front', maxCount: 1 },
        { name: 'rc_back', maxCount: 1 }
    ]),
    validate(updateProfileSchema),
    AuthController.updateProfile
);
module.exports = router;