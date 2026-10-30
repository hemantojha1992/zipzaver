const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const RideModel = require('../models/ride.models');
const h3 = require('h3-js');
const admin = require('../../../server/firebase');

const crypto = require('crypto');
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRATION || 5);
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const VEHICLE_TYPES = (process.env.VEHICLE_TYPES || 'bike,auto,car')
    .split(',')
    .map(type => type.trim().toLowerCase())
    .filter(Boolean);

class RideService {
    
    async bookRide(riderId, rideData) {
        if (!riderId) {
            return {
                status: 0,
                message: 'Authenticated rider ID is missing',
                httpStatus: 401
            };
        }

        // Fare and nearby drivers calculate again on booking
        const nearbyResult = await this.getNearbyDriverByLatLong(rideData);

        if (nearbyResult.status !== 1) {
            return nearbyResult;
        }

        const {
            fare,
            nearby_drivers
        } = nearbyResult.data;

        // Create ride with fare
        const rideResult = await RideModel.createRide(
            riderId,
            rideData,
            fare
        );

        // Save eligible drivers in queue
        if (nearby_drivers.length) {

            await RideModel.createDriverQueue(
                rideResult.ride_id,
                nearby_drivers
            );

            // Send request to first available driver
            await this.sendRideRequestToNextDriver(
                rideResult.ride_id
            );
        }

        const ride = await RideModel.getRideById(
            rideResult.ride_id,
            riderId
        );

        return {
            status: 1,
            message: nearby_drivers.length
                ? 'Ride booked. Driver request initiated'
                : 'Ride booked. No nearby drivers available',
            data: {
                ride,
                fare,
                total_drivers: nearby_drivers.length
            },
            httpStatus: 201
        };
    }
    async sendFirebaseRideNotification(request) {
        try {
            const message = {
                token: request.fcm_token,
                notification: {
                    title: 'New Ride Request',
                    body: `Pickup: ${request.pickup_address}`
                },
                data: {
                    type: 'RIDE_REQUEST',
                    request_id: String(request.request_id),
                    ride_id: String(request.ride_id),
                    pickup_address: String(request.pickup_address),
                    drop_address: String(request.drop_address),
                    fare: String(request.estimated_fare || 0),
                    expires_in: '30'
                },

                android: {
                    priority: 'high',
                    ttl: 30000,
                    notification: {
                        channelId: 'ride_requests',
                        sound: 'ride_request'
                    }
                }
            };

            const response = await admin.messaging().send(message);

            return {
                success: true,
                message_id: response
            };

        } catch (error) {

            console.error('Firebase notification error:', error.message);

            return {
                success: false,
                message: error.message
            };
        }
    }
    async sendRideRequestToNextDriver(rideId) {
        while (true) {
            const request = await RideModel.getNextDriverRequest(rideId);
            if (!request) {
                return {
                    status: 0,
                    message: 'No more available drivers'
                };
            }

            const notification = await this.sendFirebaseRideNotification(
                request
            );

            if (notification.success) {

                return {
                    status: 1,
                    message: 'Ride request sent successfully',
                    data: {
                        request_id: request.request_id,
                        driver_id: request.driver_id,
                        expires_in: 30
                    }
                };
            }

            // If Firebase fails, try next driver
            await RideModel.expireRideRequest(request.request_id);
        }
    }
    async acceptRideRequest(requestId, driverId) {
        if (!requestId || !driverId) {
            return {
                status: 0,
                message: 'Request ID and driver ID are required',
                httpStatus: 400
            };
        }
        const result = await RideModel.acceptRideRequest( requestId, driverId);
        if (!result.success) {
            return {
                status: 0,
                message: result.message,
                httpStatus: 400
            };
        }
        return {
            status: 1,
            message: 'Ride accepted successfully',
            data: {
                ride_id: result.ride_id
            },
            httpStatus: 200
        };
    }
    async rejectRideRequest(requestId, driverId) {

        const rideId = await RideModel.getRideIdFromRequest(
            requestId,
            driverId
        );

        if (!rideId) {
            return {
                status: 0,
                message: 'Ride request not found',
                httpStatus: 404
            };
        }

        const rejected = await RideModel.rejectRideRequest(
            requestId,
            driverId
        );

        if (!rejected) {
            return {
                status: 0,
                message: 'Request expired or already processed',
                httpStatus: 400
            };
        }

        const nextRequest = await this.sendRideRequestToNextDriver(rideId);

        return {
            status: 1,
            message: 'Ride request rejected successfully',
            next_driver_request: nextRequest,
            httpStatus: 200
        };
    }
    async processExpiredRideRequests() {
        const rideIds = await RideModel.getExpiredRideIds();
        for (const rideId of rideIds) {

            try {
                await this.sendRideRequestToNextDriver(rideId);
            } catch (error) {
                console.error(
                    `Failed to process expired ride ${rideId}:`,
                    error.message
                );
            }
        }
    }

    // Get Nearby Drivers By Pickup And Drop Latitude Longitude
    async getNearbyDriverByLatLong(rideData) {

        const pickupLat = Number(rideData.pickup_latitude);
        const pickupLng = Number(rideData.pickup_longitude);

        const dropLat = Number(rideData.drop_latitude);
        const dropLng = Number(rideData.drop_longitude);

        const vehicleType = String(rideData.vehicle_type || '').trim().toLowerCase();

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

        // Validate vehicle type
        if (typeof vehicleType !== 'string' || !VEHICLE_TYPES.includes(vehicleType.trim().toLowerCase())) {
            return {
                status: 0,
                message: 'Invalid vehicle type',
                allowed_vehicle_types: VEHICLE_TYPES,
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

        const radiusKm = Number(rideData.radius_km ?? 5);

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

        // Get vehicle-wise drivers and settings
        const [drivers, settings] = await Promise.all([
            RideModel.getNearbyDrivers(h3Cells, vehicleType),
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

        // Vehicle-wise fare settings
        const baseFare = Number(
            settings[`${vehicleType}_base_fare`]
        );

        const includedKm = Number(
            settings[`${vehicleType}_base_fare_max_km`]
        );

        const perKmCharge = Number(
            settings[`${vehicleType}_per_km_charge`]
        );

        const nightPercentage = Number(
            settings[`${vehicleType}_night_fare_percentage`]
        );

        // Check settings availability
        if (
            !Number.isFinite(baseFare) ||
            !Number.isFinite(includedKm) ||
            !Number.isFinite(perKmCharge) ||
            !Number.isFinite(nightPercentage)
        ) {
            return {
                status: 0,
                message: `Fare settings not configured for ${vehicleType}`,
                httpStatus: 400
            };
        }

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
            vehicle_type: vehicleType,
            base_fare: baseFare,
            included_km: includedKm,
            per_km_charge: perKmCharge,
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

        // Calculate nearby driver distances
        const nearbyDrivers = drivers
            .map(driver => {

                const driverLat = Number(driver.latitude);
                const driverLng = Number(driver.longitude);

                if (
                    !Number.isFinite(driverLat) ||
                    !Number.isFinite(driverLng)
                ) {
                    return null;
                }

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
                driver &&
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
                vehicle_type: vehicleType,
                trip_distance_km: Number(
                    tripDistanceKm.toFixed(2)
                ),
                fare,
                total_drivers: nearbyDrivers.length,
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