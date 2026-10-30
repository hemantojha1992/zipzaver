const express = require('express');
const router = express.Router();
const AdminController = require('../contoller/admin.controller');
const {  authSchema} = require('../services/admin.validation');
const validate = require('../../middleware/validate');

router.post('/login',validate(authSchema),AdminController.login);
router.post('/logout',AdminController.logout);
module.exports = router;