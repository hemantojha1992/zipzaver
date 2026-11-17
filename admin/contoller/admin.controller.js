const AdminService = require('../services/admin.service');
const CustomMessages = require('../../utilities/customMessages');
const dbPool = require('../../shared/database');
function checkAdmin(req, res) {
    if (!req.user || Number(req.user.user_type) !== 1) {
        res.status(403).json({
            status: 0,
            message: 'Access denied. Only admin can perform this action.'
        });

        return false;
    }

    return true;
}
class AdminController {
    async login(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            let searchData = req.body;
            const result = await AdminService.login(connection,searchData);
            res.send(result);
        } catch (err) {
            res.status(500).json({ success: 0, message: err.message, details: err });
        } finally {
            if (connection) {
                connection.release();
            }   
        }
    } 
    async logout(req, res) {
        let result = {};
        let connection;
        try {
            connection = await dbPool.getConnection();
            const userId = req.user.user_id;
            // use auth servervice logout function
            let loutKey = await AdminService.logout(connection,userId);
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
        } finally {
            if (connection) {
                connection.release();
            }   
        }
    }

    // for drivers
    async getDrivers(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            // if (!this.checkAdmin(req, res)) return;
            const result = await AdminService.getDrivers(connection,req.query);
            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);
        } catch (error) {
            console.error('Admin getDrivers error:', error);
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }


    async getDriverDetails(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            // if (!this.checkAdmin(req, res)) return;
            const result = await AdminService.getDriverDetails(connection, req.params.id);
            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);
        } catch (error) {
            console.error('Admin getDriverDetails error:', error);
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }


    async verifyDocument(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            const result = await AdminService.verifyDocument(connection, req.body);
            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);
        } catch (error) {
            console.error('Admin verifyDocument error:', error);
            const errorMessages = {
                DRIVER_NOT_FOUND: {
                    status: 404,
                    message: 'Driver not found.'
                },
                VEHICLE_NOT_FOUND: {
                    status: 404,
                    message: 'Driver vehicle not found.'
                },
                INVALID_DOCUMENT: {
                    status: 400,
                    message: 'Invalid document.'
                }
            };
            const knownError = errorMessages[error.message];
            return res.status(knownError?.status || 500).json({
                status: 0,
                message: knownError?.message ||
                    'Something went wrong. Please try again later.',
                ...(knownError ? {} : { details: error.message })
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }
    // for drivers end

    // Vehicle listing
    async getVehicles(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            const result = await AdminService.getVehicles(connection, req.query);
            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);
        } catch (error) {
            console.error('Admin getVehicles error:', error);
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }

    // Vehicle details
    async getVehicleDetails(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            const result = await AdminService.getVehicleDetails(connection, req.params.id);

            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);

        } catch (error) {
            console.error('Admin getVehicleDetails error:', error);

            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }

    // Fare Settings - Get
    async getFareSettings(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            if (!checkAdmin(req, res)) return;

            const result = await AdminService.getFareSettings(connection,
                req.query.vehicle_type
            );

            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);

        } catch (error) {
            console.error('Admin getFareSettings error:', error);

            return res.status(500).json({
                status: 0,
                message: 'Unable to fetch fare settings.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }

    // Fare Settings - Update
    async updateFareSettings(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            if (!checkAdmin(req, res)) return;

            const result = await AdminService.updateFareSettings(connection, req.body);

            return res.status(
                result.status === 1 ? 200 : result.httpStatus || 400
            ).json(result);

        } catch (error) {
            console.error('Admin updateFareSettings error:', error);

            return res.status(500).json({
                status: 0,
                message: 'Unable to update fare settings.',
                details: error.message
            });
        }finally {
            if (connection) {
                connection.release();
            }   
        }
    }

}

module.exports = new AdminController(); 
