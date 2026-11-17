const CustomMessages = require('../../../utilities/customMessages');
const UserModel = require('../models/user.models');
const RideService = require('../../ride/services/ride.service');
const RideModel = require('../../ride/models/ride.models');

class UserService {
    
    async bookRide(connection, riderId, rideData) {
        if (!riderId) {
            return {
                status: 0,
                message: 'Authenticated rider ID is missing',
                httpStatus: 401
            };
        }

        // 1. Calculate fare + find nearby drivers
        const nearbyResult = await RideService.getNearbyDriverByLatLong(rideData);

        if (nearbyResult.status !== 1) {
            return nearbyResult;
        }

        const {
            fare,
            nearby_drivers
        } = nearbyResult.data;

        // 2. No driver available -> DO NOT CREATE RIDE
        if (!nearby_drivers || nearby_drivers.length === 0) {
            return {
                status: 0,
                message: 'No nearby drivers available',
                httpStatus: 404
            };
        }

        // 3. Driver available -> create ride
        const rideResult = await UserModel.createRide(
            connection,
            riderId,
            rideData,
            fare
        );

        if (!rideResult || !rideResult.ride_id) {
            return {
                status: 0,
                message: 'Unable to create ride',
                httpStatus: 500
            };
        }

        // 4. Save eligible drivers in queue
        await RideModel.createDriverQueue(
            rideResult.ride_id,
            nearby_drivers
        );

        // 5. Send request to first available driver
        await RideService.sendRideRequestToNextDriver(
            rideResult.ride_id
        );

        // 6. Get created ride
        const ride = await RideModel.getRideById(
            rideResult.ride_id,
            riderId
        );

        return {
            status: 1,
            message: 'Ride booked. Driver request initiated',
            data: {
                ride,
                fare,
                total_drivers: nearby_drivers.length
            },
            httpStatus: 201
        };
    }

    

    
}


          
module.exports = new UserService();