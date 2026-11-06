const express = require('express');
const router = express.Router();
const AuthController = require('../controller/auth.controller');
const validate = require('../../middleware/validate');
const uploadFiles = require('../../../middleware/upload');
const { authSchema ,sendOtpSchema,verifyOtpSchema,updateProfileSchema} = require('../services/auth.validation');

// router.post('/login',validate(authSchema),AuthController.login);
// router.post('/logout',AuthController.logout);

router.get('/settings', AuthController.getSettings);
router.post('/send-otp',validate(sendOtpSchema),AuthController.sendOtp);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/resend-otp', AuthController.resendOtp);

const driverProfileUpload = uploadFiles({
    profile_image: 'driver_doc/profile_image',
    aadhar_front: 'driver_doc/aadhar',
    aadhar_back: 'driver_doc/aadhar',
    dl_front: 'driver_doc/dl',
    dl_back: 'driver_doc/dl',
    pan_image: 'driver_doc/pan',
    vehicle_photo: 'vehicles/vehicle_photo',
    rc_front: 'vehicles/rc',
    rc_back: 'vehicles/rc'
});

router.post(
    '/update-profile',
    driverProfileUpload.parse,
    validate(updateProfileSchema),
    driverProfileUpload.save,
    AuthController.updateProfile
);  
module.exports = router;