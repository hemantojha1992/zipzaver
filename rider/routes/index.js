const express = require('express');

const RiderRoutes = require('../profile/routes');
const RideRoute = require('../ride/routes');


const router = express.Router();
router.use(RiderRoutes);
router.use('/ride',RideRoute);


module.exports = router;

