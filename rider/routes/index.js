const express = require('express');

const RiderRoutes = require('../profile/routes');
const RideRoute = require('../ride/routes');
const UserRoute = require('../user/routes');


const router = express.Router();
router.use(RiderRoutes);
router.use('/ride',RideRoute);
router.use('/user',UserRoute);


module.exports = router;

