
const CustomMessages = require("../../utilities/customMessages");
let dbPool = require('../../database/db');
const UserService = require('../services/user.service');

class UserController {
    
    async bookRide(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            
            const riderId = req.user?.user_id;
            const riderData = req.body;

            if (!riderId) {
                return res.status(401).json({
                    status: 0,
                    message: 'Unauthorized. Please login again.'
                });
            }
            const result = await UserService.bookRide(connection, riderId, riderData);

            return res.status(result.status === 1 ? 200 : 400).json(result);

        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

}

module.exports = new UserController(); 
