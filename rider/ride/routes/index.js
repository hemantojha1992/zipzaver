const express = require('express');
const router = express.Router();
const RideController = require('../contoller/ride.controller');
const { AirPortSearchValidation,  } = require('../services/ride.request.validation');
const { searchSchema, bookSchema } = require('../services/ride.validation');


router.get('/airports',AirPortSearchValidation,RideController.GetAirports);

router.post('/test', (req,res)=>{
  res.json(req.body);
});
module.exports = router;