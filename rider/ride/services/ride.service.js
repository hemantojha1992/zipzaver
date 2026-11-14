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

        const isValidCoordinate = (lat, lng) => (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180
        );

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

        if (!VEHICLE_TYPES.includes(vehicleType)) {
            return {
                status: 0,
                message: 'Invalid vehicle type',
                allowed_vehicle_types: VEHICLE_TYPES,
                httpStatus: 400
            };
        }

        if (pickupLat === dropLat && pickupLng === dropLng) {
            return {
                status: 0,
                message: 'Pickup and drop locations cannot be the same',
                httpStatus: 400
            };
        }

        const radiusKm = Number(rideData.radius_km ?? 5);
        if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
            return {
                status: 0,
                message: 'Invalid search radius',
                httpStatus: 400
            };
        }

        // H3 is only used to find candidate drivers. It is not used as distance.
        const resolution = 9;
        const pickupCell = h3.latLngToCell(pickupLat, pickupLng, resolution);
        const averageEdgeKm = h3.getHexagonEdgeLengthAvg(resolution, 'km');
        const gridRadius = Math.ceil(radiusKm / (averageEdgeKm * 1.5));
        const h3Cells = h3.gridDisk(pickupCell, gridRadius);

        const [drivers, settings] = await Promise.all([
            RideModel.getNearbyDrivers(h3Cells, vehicleType),
            RideModel.getSettings()
        ]);

        // Haversine: straight-line distance, used only for initial candidate filtering.
        const getDistanceKm = (lat1, lng1, lat2, lng2) => {
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

        // Existing vehicle-wise fare calculation is intentionally preserved.
        const baseFare = Number(settings[`${vehicleType}_base_fare`]);
        const includedKm = Number(settings[`${vehicleType}_base_fare_max_km`]);
        const perKmCharge = Number(settings[`${vehicleType}_per_km_charge`]);
        const nightPercentage = Number(settings[`${vehicleType}_night_fare_percentage`]);

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

        const extraKm = Math.max(0, tripDistanceKm - includedKm);
        const distanceFare = baseFare + (extraKm * perKmCharge);

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
            trip_distance_km: Number(tripDistanceKm.toFixed(2)),
            distance_fare: Number(distanceFare.toFixed(2)),
            night_charge: Number(nightCharge.toFixed(2)),
            total_fare: Number(totalFare.toFixed(2))
        };

        // First filter by GPS radius. The road route is then calculated only
        // for this smaller candidate list to reduce routing calls.
        const gpsCandidates = drivers
            .map(driver => {
                const driverLat = Number(driver.latitude);
                const driverLng = Number(driver.longitude);

                if (!isValidCoordinate(driverLat, driverLng)) {
                    return null;
                }

                const gpsDistanceKm = getDistanceKm(
                    pickupLat,
                    pickupLng,
                    driverLat,
                    driverLng
                );

                if (gpsDistanceKm > radiusKm) {
                    return null;
                }

                return {
                    ...driver,
                    distance_to_pickup_km: Number(gpsDistanceKm.toFixed(2)),
                    estimated_fare: fare
                };
            })
            .filter(Boolean)
            .sort((a, b) =>
                a.distance_to_pickup_km - b.distance_to_pickup_km
            );

        if (!gpsCandidates.length) {
            return {
                status: 1,
                message: 'Nearby drivers fetched successfully',
                data: {
                    vehicle_type: vehicleType,
                    trip_distance_km: Number(tripDistanceKm.toFixed(2)),
                    fare,
                    total_drivers: 0,
                    nearby_drivers: []
                },
                httpStatus: 200
            };
        }

        // OSRM Table API returns road distance and estimated driving duration
        // from every candidate driver to the pickup in one request per batch.
        // Keep batches small so the URL and routing workload stay manageable.
        const osrmBaseUrl = String(
            process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'
        ).replace(/\/+$/, '');
        const configuredBatchSize = Number(process.env.OSRM_BATCH_SIZE || 15);
        const batchSize = Number.isFinite(configuredBatchSize)
            ? Math.max(1, Math.min(Math.floor(configuredBatchSize), 50))
            : 15;

        const configuredTimeout = Number(process.env.OSRM_TIMEOUT_MS || 10000);
        const routingTimeoutMs = Number.isFinite(configuredTimeout)
            ? Math.max(1000, configuredTimeout)
            : 10000;

        const routedDrivers = [];

        for (let offset = 0; offset < gpsCandidates.length; offset += batchSize) {
            const batch = gpsCandidates.slice(offset, offset + batchSize);
            const coordinates = [
                ...batch.map(driver =>
                    `${Number(driver.longitude)},${Number(driver.latitude)}`
                ),
                `${pickupLng},${pickupLat}`
            ].join(';');

            const sourceIndexes = batch.map((_, index) => index).join(';');
            const destinationIndex = batch.length;
            const url =
                `${osrmBaseUrl}/table/v1/driving/${coordinates}` +
                `?sources=${sourceIndexes}` +
                `&destinations=${destinationIndex}` +
                '&annotations=distance,duration';

            let response;
            let routingData;

            try {
                const controller = new AbortController();
                const timeout = setTimeout(
                    () => controller.abort(),
                    routingTimeoutMs
                );

                try {
                    response = await fetch(url, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: { Accept: 'application/json' }
                    });
                } finally {
                    clearTimeout(timeout);
                }

                if (!response.ok) {
                    throw new Error(`Routing service returned HTTP ${response.status}`);
                }

                routingData = await response.json();

                if (
                    routingData.code !== 'Ok' ||
                    !Array.isArray(routingData.distances) ||
                    !Array.isArray(routingData.durations)
                ) {
                    throw new Error(
                        routingData.message || 'Invalid response from routing service'
                    );
                }
            } catch (error) {
                console.error('Road distance calculation failed:', error.message);

                return {
                    status: 0,
                    message: 'Unable to calculate actual road distance for nearby drivers. Please try again.',
                    details: error.name === 'AbortError'
                        ? 'Routing service timed out'
                        : error.message,
                    httpStatus: 503
                };
            }

            batch.forEach((driver, index) => {
                const distanceMeters = routingData.distances[index]?.[0];
                const durationSeconds = routingData.durations[index]?.[0];

                // Do not fall back to GPS distance: a missing road route may
                // indicate a river, divided highway, disconnected road, etc.
                if (
                    !Number.isFinite(distanceMeters) ||
                    !Number.isFinite(durationSeconds)
                ) {
                    return;
                }

                const roadDistanceKm = distanceMeters / 1000;
                const pickupEtaMinutes = durationSeconds / 60;

                routedDrivers.push({
                    ...driver,
                    road_distance_to_pickup_km: Number(roadDistanceKm.toFixed(2)),
                    estimated_pickup_time_minutes: Number(pickupEtaMinutes.toFixed(1))
                });
            });
        }

        // Road distance is the primary ranking (less driving/fuel for pickup).
        // ETA is the tie-breaker; GPS distance is the final tie-breaker.
        const nearbyDrivers = routedDrivers.sort((a, b) =>
            a.road_distance_to_pickup_km - b.road_distance_to_pickup_km ||
            a.estimated_pickup_time_minutes - b.estimated_pickup_time_minutes ||
            a.distance_to_pickup_km - b.distance_to_pickup_km
        );

        return {
            status: 1,
            message: 'Nearby drivers fetched successfully',
            data: {
                vehicle_type: vehicleType,
                trip_distance_km: Number(tripDistanceKm.toFixed(2)),
                fare,
                total_drivers: nearbyDrivers.length,
                nearby_drivers: nearbyDrivers
            },
            httpStatus: 200
        };
    }

    async updateDriverLocation(connection,driverId, latitude, longitude) {

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

        const result = await RideModel.updateDriverLocation(
            connection,
            driverId,
            lat,
            lng,
            h3Index
        );

        // Return model response directly if unsuccessful
        if (result.status !== 1) {
            return {
                ...result,
                httpStatus: result.httpStatus || 403
            };
        }

        return {
            status: 1,
            message: result.message,
            data: {
                latitude: lat,
                longitude: lng,
                h3_index: h3Index
            },
            httpStatus: 200
        };
    }
    async changeOnlineStatus(driverId, data) {

        const isOnline = Number(data.is_online);

        if (![0, 1].includes(isOnline)) {
            return {
                status: 0,
                message: 'Invalid online status. Use 1 for online and 0 for offline.',
                httpStatus: 400
            };
        }

        let latitude = null;
        let longitude = null;

        if (isOnline === 1) {

            latitude = Number(data.latitude);
            longitude = Number(data.longitude);

            if (
                data.latitude === undefined ||
                data.longitude === undefined ||
                data.latitude === null ||
                data.longitude === null ||
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                return {
                    status: 0,
                    message: 'Valid latitude and longitude are required to go online.',
                    httpStatus: 400
                };
            }

            // Optional location fields validation
            // for (const field of ['accuracy_m', 'speed_kmh', 'heading']) {
            //     if (
            //         data[field] !== undefined &&
            //         data[field] !== null &&
            //         (!Number.isFinite(Number(data[field])) ||
            //             Number(data[field]) < 0)
            //     ) {
            //         return {
            //             status: 0,
            //             message: `Invalid ${field}.`,
            //             httpStatus: 400
            //         };
            //     }
            // }

            // if (
            //     data.heading !== undefined &&
            //     data.heading !== null &&
            //     Number(data.heading) > 360
            // ) {
            //     return {
            //         status: 0,
            //         message: 'Heading must be between 0 and 360.',
            //         httpStatus: 400
            //     };
            // }
        }
        const driver = await RideModel.getDriverById(driverId);

        if (!driver) {
            return {
                status: 0,
                message: 'Driver not found.',
                httpStatus: 404
            };
        }

        if (Number(driver.status) !== 1) {
            return {
                status: 0,
                message: 'Your account is not active. Please contact admin.',
                httpStatus: 403
            };
        }

        await RideModel.updateOnlineStatus(driverId, {
            is_online: isOnline,
            latitude,
            longitude,
            accuracy_m: data.accuracy_m ?? null,
            speed_kmh: data.speed_kmh ?? null,
            heading: data.heading ?? null
        });

        return {
            status: 1,
            message: isOnline === 1
                ? 'Driver is now online successfully.'
                : 'Driver is now offline successfully.',
            data: {
                is_online: isOnline,
                ...(isOnline === 1 && {
                    latitude,
                    longitude
                })
            },
            httpStatus: 200
        };
    }

    

    
}


          
module.exports = new RideService();