const express = require('express');
const router = express.Router();
const UserController = require('../contoller/user.controller');
const authMiddleware = require('../../middleware/authMiddleware');
const {  bookSchema} = require('../services/user.validation');

router.post('/book-ride',authMiddleware, bookSchema, UserController.bookRide);

router.post('/test', (req,res)=>{
  res.json(req.body);
});
module.exports = router;