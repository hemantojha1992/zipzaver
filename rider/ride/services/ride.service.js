const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const RideModel = require('../models/ride.models');
const h3 = require('h3-js');
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

    // Get Nearby Drivers By Pickup And Drop Latitude Longitude
    async getNearbyDriverByLatLong(rideData) {

        const pickupLat = Number(rideData.pickup_latitude);
        const pickupLng = Number(rideData.pickup_longitude);

        const dropLat = Number(rideData.drop_latitude);
        const dropLng = Number(rideData.drop_longitude);

        // Validate coordinates
        const isValidCoordinate = (lat, lng) => {
            return (
                Number.isFinite(lat) &&
                Number.isFinite(lng) &&
                lat >= -90 &&
                lat <= 90 &&
                lng >= -180 &&
                lng <= 180
            );
        };

        if (
            !isValidCoordinate(pickupLat, pickupLng) ||
            !isValidCoordinate(dropLat, dropLng)
        ) {
            return {
                status: 0,
                message: 'Valid pickup and drop coordinates are required',
                httpStatus: 400
            };
        }

        // Check same location
        if (
            pickupLat === dropLat &&
            pickupLng === dropLng
        ) {
            return {
                status: 0,
                message: 'Pickup and drop locations cannot be the same',
                httpStatus: 400
            };
        }

        const radiusKm = Number(rideData.radius_km || 5);

        if (
            !Number.isFinite(radiusKm) ||
            radiusKm <= 0 ||
            radiusKm > 50
        ) {
            return {
                status: 0,
                message: 'Invalid search radius',
                httpStatus: 400
            };
        }

        // H3 Grid Configuration
        const resolution = 9;

        const pickupCell = h3.latLngToCell(
            pickupLat,
            pickupLng,
            resolution
        );

        const averageEdgeKm = h3.getHexagonEdgeLengthAvg(
            resolution,
            'km'
        );

        const gridRadius = Math.ceil(
            radiusKm / (averageEdgeKm * 1.5)
        );

        const h3Cells = h3.gridDisk(
            pickupCell,
            gridRadius
        );

        // Get nearby drivers and settings from database
        const [drivers, settings] = await Promise.all([
            RideModel.getNearbyDrivers(h3Cells),
            RideModel.getSettings()
        ]);

        // Calculate straight-line distance
        const getDistanceKm = (
            lat1,
            lng1,
            lat2,
            lng2
        ) => {
            const toRad = value => value * Math.PI / 180;

            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);

            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) *
                Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) ** 2;

            return 6371 * 2 * Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );
        };

        const tripDistanceKm = getDistanceKm(
            pickupLat,
            pickupLng,
            dropLat,
            dropLng
        );

        // Fare Settings
        const baseFare = Number(settings.base_fare ?? 20);

        const includedKm = Number(
            settings.base_fare_max_km ?? 3
        );

        const perKmCharge = Number(
            settings.per_km_charge ?? 6
        );

        const nightPercentage = Number(
            settings.night_fare_percentage ?? 15
        );

        const extraKm = Math.max(
            0,
            tripDistanceKm - includedKm
        );

        const distanceFare = baseFare + (
            extraKm * perKmCharge
        );

        // Night Fare
        const hour = Number(
            new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                hourCycle: 'h23'
            }).format(new Date())
        );

        const isNight = hour >= 22 || hour < 6;

        const nightCharge = isNight
            ? distanceFare * nightPercentage / 100
            : 0;

        const totalFare = distanceFare + nightCharge;

        const fare = {
            base_fare: baseFare,
            trip_distance_km: Number(
                tripDistanceKm.toFixed(2)
            ),
            distance_fare: Number(
                distanceFare.toFixed(2)
            ),
            night_charge: Number(
                nightCharge.toFixed(2)
            ),
            total_fare: Number(
                totalFare.toFixed(2)
            )
        };

        // Nearby Drivers
        const nearbyDrivers = drivers
            .map(driver => {

                const driverLat = Number(driver.latitude);
                const driverLng = Number(driver.longitude);

                const distanceToPickup = getDistanceKm(
                    pickupLat,
                    pickupLng,
                    driverLat,
                    driverLng
                );

                return {
                    ...driver,
                    distance_to_pickup_km: Number(
                        distanceToPickup.toFixed(2)
                    ),
                    estimated_fare: fare
                };
            })
            .filter(driver =>
                driver.distance_to_pickup_km <= radiusKm
            )
            .sort((a, b) =>
                a.distance_to_pickup_km -
                b.distance_to_pickup_km
            );

        return {
            status: 1,
            message: 'Nearby drivers fetched successfully',
            data: {
                trip_distance_km: Number(
                    tripDistanceKm.toFixed(2)
                ),
                fare,
                nearby_drivers: nearbyDrivers
            },
            httpStatus: 200
        };
    }

    async updateDriverLocation(driverId, latitude, longitude) {

        if (!driverId) {
            return {
                status: 0,
                message: 'Driver authentication required',
                httpStatus: 401
            };
        }

        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 || lat > 90 ||
            lng < -180 || lng > 180
        ) {
            return {
                status: 0,
                message: 'Invalid latitude or longitude',
                httpStatus: 400
            };
        }

        const h3Index = h3.latLngToCell(lat, lng, 9);
        const updated = await RideModel.updateDriverLocation(driverId,lat,lng,h3Index);
        if (!updated) {
            return {
                status: 0,
                message: 'Active driver not found',
                httpStatus: 404
            };
        }
        return {
            status: 1,
            message: 'Driver location updated successfully',
            data: {
                latitude: lat,
                longitude: lng,
                h3_index: h3Index
            },
            httpStatus: 200
        };
    }

    

    
}


          
module.exports = new RideService();