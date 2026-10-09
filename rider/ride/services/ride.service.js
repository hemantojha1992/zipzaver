const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const RideModel = require('../models/ride.models');

const crypto = require('crypto');
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRATION || 5);
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);


class RideService {
    
    async bookRide (riderId, rideData){
        if (!riderId) {
            return {
                status: 0,
                message: 'Authenticated rider ID is missing',
                httpStatus: 401
            };
        }

        const sameLocation =
            Number(rideData.pickup_latitude) === Number(rideData.drop_latitude) &&
            Number(rideData.pickup_longitude) === Number(rideData.drop_longitude);

        if (sameLocation) {
            return {
                status: 0,
                message: 'Pickup and drop locations cannot be the same',
                httpStatus: 400
            };
        }

        const rideResult = await RideModel.createRide(riderId, rideData);

        const ride = await RideModel.getRideById( rideResult.ride_id, riderId);

        return {
            status: 1,
            message: 'Ride booked successfully',
            data: ride,
            httpStatus: 201
        };
    }
}


          
module.exports = new RideService();