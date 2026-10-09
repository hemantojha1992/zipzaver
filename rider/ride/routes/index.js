const express = require('express');
const router = express.Router();
const RideController = require('../contoller/ride.controller');
const {  bookSchema } = require('../services/ride.validation');

router.post('/book-ride', bookSchema, RideController.bookRide);

router.post('/test', (req,res)=>{
  res.json(req.body);
});
module.exports = router;