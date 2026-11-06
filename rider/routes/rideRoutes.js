const express = require('express');
const RideController = require('../controllers/Ride/RideController');
const router = express.Router();
const RideControllerInstance = new RideController();

module.exports = router;