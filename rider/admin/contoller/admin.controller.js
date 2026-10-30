

const AdminService = require('../services/admin.service');
const CustomMessages = require('../../utilities/customMessages');

class AdminController {
    async login(req, res) {
            try {
                let searchData = req.body;
                const result = await AdminService.login(searchData);
                res.send(result);
            } catch (err) {
                res.status(500).json({ success: 0, message: err.message, details: err });
            }
        } 
        async logout(req, res) {
            let result = {};
            try {
                const userId = req.user.user_id;
                // use auth servervice logout function
                let loutKey = await AdminService.logout(userId);
                if (loutKey.status === 0) {
                    result.status = 0;
                    result.errors = loutKey.details;
                    result.message = CustomMessages.serverMsg();
                    return res.json(result).status(500);
                }
                result.status = 1;
                result.doLogout = 1;
                result.message = CustomMessages.logout();
                res.json(result).status(200);
            }
            catch (error) {
                result.status = 0;
                result.errors = error.message;
                result.message = CustomMessages.serverMsg();
                res.json(result).status(404);
            }
        }

}

module.exports = new AdminController(); 
