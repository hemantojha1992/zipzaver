const express = require('express');
const router = express.Router();
const AdminController = require('../contoller/admin.controller');
const {  authSchema} = require('../services/admin.validation');
const validate = require('../middleware/validate');
//const validate = require('../middleware/validateMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login',validate(authSchema),AdminController.login);
router.post('/logout',AdminController.logout);

// drivers
// Driver listing
router.get('/drivers',authMiddleware,AdminController.getDrivers);
// Driver details with documents
router.get('/drivers/:id', authMiddleware,AdminController.getDriverDetails);

// Approve / Reject document
router.post('/drivers/verify-document',authMiddleware,AdminController.verifyDocument);

// Vehicles
router.get('/vehicles', authMiddleware, AdminController.getVehicles);
router.get('/vehicles/:id', authMiddleware, AdminController.getVehicleDetails);

// Fare Settings
router.get('/fare-settings', authMiddleware, AdminController.getFareSettings);
router.put('/fare-settings', authMiddleware, AdminController.updateFareSettings);

module.exports = router;

