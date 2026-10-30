
const CustomMessages = require("../../utilities/customMessages");
let dbPool = require('../../database/db');
const RideService = require('../services/ride.service');
const batch = require('../../database/GroupUpdateInsert');
const { setCacheData, getCacheData } = require("../../../shared/redis/Redis");

class RideController {
    
    async acceptRideRequest(req, res) {

        try {

            const driverId = req.user?.user_id;
            const { request_id } = req.body;

            if (!driverId) {
                return res.status(401).json({
                    status: 0,
                    message: 'Unauthorized. Please login again.'
                });
            }

            const result = await RideService.acceptRideRequest(
                request_id,
                driverId
            );

            return res
                .status(result.httpStatus || 200)
                .json(result);

        } catch (error) {

            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }


    async rejectRideRequest(req, res) {

        try {

            const driverId = req.user?.user_id;
            const { request_id } = req.body;

            if (!driverId) {
                return res.status(401).json({
                    status: 0,
                    message: 'Unauthorized. Please login again.'
                });
            }

            const result = await RideService.rejectRideRequest(
                request_id,
                driverId
            );

            return res
                .status(result.httpStatus || 200)
                .json(result);

        } catch (error) {

            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }
    async bookRide(req, res) {
        try {
            
            const riderId = req.user?.user_id;
            const riderData = req.body;

            if (!riderId) {
                return res.status(401).json({
                    status: 0,
                    message: 'Unauthorized. Please login again.'
                });
            }
            const result = await RideService.bookRide(riderId,riderData );

            return res.status(result.status === 1 ? 200 : 400).json(result);

        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

    async getNearbyDriverByLatLong(req, res) {
        try {

            const result = await RideService.getNearbyDriverByLatLong(
                req.body
            );

            return res
                .status(result.httpStatus || 200)
                .json(result);

        } catch (error) {

            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });

        }
    }

    async updateLocation(req, res) {
        try {
            const { latitude, longitude } = req.body;
            const result = await RideService.updateDriverLocation(req.user.user_id,latitude,longitude);
            return res.status(result.httpStatus || 200).json(result);
        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

}

module.exports = new RideController(); 
