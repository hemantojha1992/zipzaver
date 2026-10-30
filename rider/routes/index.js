const express = require('express');

const RiderRoutes = require('../profile/routes');
const RideRoute = require('../ride/routes');
const AdminRoute = require('../admin/routes');


const router = express.Router();
router.use(RiderRoutes);
router.use('/ride',RideRoute);
router.use('/admin',AdminRoute);


module.exports = router;

