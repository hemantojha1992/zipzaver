const admin = require('../../server/firebase');

class FirebaseService {

    async sendRideRequest(fcmToken, rideData) {

        try {

            const message = {
                token: fcmToken,
                notification: {
                    title: 'New Ride Request',
                    body: `Pickup: ${rideData.pickup_address}`
                },

                data: {
                    type: 'RIDE_REQUEST',
                    request_id: String(rideData.request_id),
                    ride_id: String(rideData.ride_id),
                    pickup_address: String(rideData.pickup_address),
                    drop_address: String(rideData.drop_address),
                    fare: String(rideData.fare),
                    expires_in: '30'
                },

                android: {
                    priority: 'high',
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

            console.error('Ride FCM Error:', error.message);

            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = new FirebaseService();