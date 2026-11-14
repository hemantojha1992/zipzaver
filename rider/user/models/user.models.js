const dbPool = require('../../database/db');
class rideModel {
    static async generateUniqueReferenceId() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const date =
            pad(now.getDate()) +
            pad(now.getMonth() + 1) +
            String(now.getFullYear()).slice(-2);
        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
        const random =
            Math.floor(Math.random() * 90 + 10).toString() +
            Math.floor(Math.random() * 90 + 10).toString();
        return `${date}-${time}-${random}`;
    }
    static async createRide(connection,rider_id, rideData, fareData) {

        const {
            pickup_address,
            pickup_latitude,
            pickup_longitude,
            drop_address,
            drop_latitude,
            drop_longitude,
            vehicle_type,
            payment_method
        } = rideData;

        const rideReference = await this.generateUniqueReferenceId();

        const sql = `
            INSERT INTO rides (
                ride_reference,
                rider_id,
                pickup_address,
                pickup_latitude,
                pickup_longitude,
                drop_address,
                drop_latitude,
                drop_longitude,
                distance_km,
                estimated_fare,
                vehicle_type,
                payment_method,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        const params = [
            rideReference,
            Number(rider_id),
            pickup_address,
            Number(pickup_latitude),
            Number(pickup_longitude),
            drop_address,
            Number(drop_latitude),
            Number(drop_longitude),
            fareData.trip_distance_km,
            fareData.total_fare,
            vehicle_type,
            payment_method || 'cash'
        ];

        const [result] = await connection.execute(sql, params);

        return {
            ride_id: result.insertId,
            ride_reference: rideReference
        };
    }


}

module.exports = rideModel;