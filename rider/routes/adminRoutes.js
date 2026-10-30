const express = require('express');
const AdminController = require('../controllers/admin/AdminController');
const router = express.Router();
const AdminControllerInstance = new AdminController();

module.exports = router;

