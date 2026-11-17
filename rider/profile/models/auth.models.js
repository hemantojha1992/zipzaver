let dbPool = require('../../database/db');
const md5 = require('md5')
class AuthModel {
    async getUser(email, password) {
        try {
            const sql = 'SELECT u.*,GROUP_CONCAT(pl.privilege_key) AS privileges FROM user as u  LEFT JOIN privileges p ON p.user_id = u.user_id and p.user_type=u.user_type LEFT JOIN privilege_list as pl ON pl.origin=p.p_no WHERE email = ? AND password = ? GROUP BY u.user_id';
            const [result] = await dbPool.query(sql, [email, md5(password)]);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async getUserWithId(userId) {
        try {
            const sql = `SELECT * FROM user WHERE  user_id= '${userId}' `;
            const [result] = await dbPool.query(sql);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async updateToken(connection, userId, token) {
        try {
            const sql = 'UPDATE user SET token = ? WHERE  user_id=?';
            const result = await connection.query(sql, [token, userId]);
            const affectedRows = result[0] ? result[0].affectedRows : 0;
            if (result && affectedRows > 0) {
                return await this.getUserWithId(userId);
            } else {
                throw new Error('User not found or token not updated');
            }
        } catch (error) {
            throw new Error('Failed to update user token');
        }
    }

    //----------------------------

     async getUserByMobile(connection,mobile) {

        const sql = `
            SELECT
                id,
                user_type,
                first_name,
                last_name,
                mobile,
                email,
                password,
                profile_image,
                status,
                last_login_at,
                deleted_at,
                created_at,
                updated_at
            FROM users
            WHERE mobile = ?
            AND deleted_at IS NULL
            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [mobile]);

        return rows;
    }
    /**
     * Expire previous pending OTPs
     */
    async expirePreviousOtps(connection,mobile, otpType) {

        const sql = `
            UPDATE otps
            SET status = 'EXPIRED'
            WHERE mobile = ?
              AND otp_type = ?
              AND status = 'PENDING'
        `;

        const [result] = await connection.execute(sql, [
            mobile,
            otpType
        ]);

        return result;
    }


    /**
     * Create OTP
     */
    async createOtp(connection,data) {

        const sql = `
            INSERT INTO otps
            (
                user_id,
                order_id,
                mobile,
                otp_type,
                otp_hash,
                attempts,
                max_attempts,
                expires_at,
                verified_at,
                status,
                created_at
            )
            VALUES
            (
                ?,
                NULL,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NULL,
                'PENDING',
                NOW()
            )
        `;

        const [result] = await connection.execute(sql, [
            data.user_id,
            data.mobile,
            data.otp_type,
            data.otp_hash,
            data.attempts,
            data.max_attempts,
            data.expires_at
        ]);

        return result;
    }


    /**
     * Get latest pending OTP
     */
    async getLatestPendingOtp(connection,mobile, otpType) {

        const sql = `
            SELECT
                id,
                user_id,
                mobile,
                otp_type,
                otp_hash,
                attempts,
                max_attempts,
                expires_at,
                verified_at,
                status,
                created_at
            FROM otps
            WHERE mobile = ?
              AND otp_type = ?
              AND status = 'PENDING'
            ORDER BY id DESC
            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [
            mobile,
            otpType
        ]);

        return rows.length > 0 ? rows[0] : null;
    }


    /**
     * Increment wrong OTP attempts
     */
    async incrementOtpAttempt(connection,id) {

        const sql = `
            UPDATE otps
            SET attempts = attempts + 1
            WHERE id = ?
              AND status = 'PENDING'
        `;

        const [result] = await connection.execute(sql, [id]);

        return result;
    }

    /**
     * Mark OTP blocked
     */
    async markOtpBlocked(connection,id) {

        const sql = `
            UPDATE otps
            SET status = 'BLOCKED'
            WHERE id = ?
        `;

        const [result] = await connection.execute(sql, [id]);

        return result;
    }
    /**
     * Mark OTP expired
     */
    async markOtpExpired(connection,id) {
        const sql = `
            UPDATE otps
            SET status = 'EXPIRED'
            WHERE id = ?
        `;
        const [result] = await connection.execute(sql, [id]);
        return result;
    }
    /**
     * Mark OTP verified
     */ 

    
    async markOtpVerified(connection,id) {
        const sql = `
            UPDATE otps
            SET
                status = 'VERIFIED',
                verified_at = NOW()
            WHERE id = ?
              AND status = 'PENDING'
        `;
        const [result] = await connection.execute(sql, [id]);
        return result;
    }
    async saveUserDevice(connection, userId, device) { 
        const sql = ` INSERT INTO user_devices 
        ( user_id, device_id, fcm_token, device_type, status, last_used_at, created_at, updated_at ) 
         VALUES (?, ?, ?, ?, 1, NOW(), NOW(), NOW()) ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token), device_type = VALUES(device_type), status = 1, last_used_at = NOW(), updated_at = NOW() `; 
         const values = [ userId, device.device_id, device.fcm_token || null, device.device_type ]; 
         return connection.query(sql, values);
    }


    /**
     * Update last login
     */
    async updateLastLogin(connection,userId) {

        const sql = `
            UPDATE users
            SET last_login_at = NOW()
            WHERE id = ?
        `;

        const [result] = await connection.execute(sql, [userId]);

        return result;
    }

    async createUser(data) {
        const sql = `
            INSERT INTO users
            (
                user_type,
                mobile,
                status,
                created_at,
                updated_at
            )
            VALUES
            (
                ?,
                ?,
                ?,
                NOW(),
                NOW()
            )
        `;

        const [result] = await dbPool.execute(sql, [
            data.user_type,
            data.mobile,
            data.status
        ]);

        return result;
    }
    async getUserByIdOld(userId) {

        const sql = `
            SELECT
                id,
                user_type,
                first_name,
                last_name,
                mobile,
                email,
                password,
                profile_image,
                status,
                last_login_at,
                deleted_at,
                created_at,
                updated_at
            FROM users
            WHERE id = ?
            AND deleted_at IS NULL
            LIMIT 1
        `;

        const [rows] = await dbPool.execute(sql, [userId]);

        return rows;
    }
    async getUserByIdNew(userId) {

    const [rows] = await dbPool.query(
        `
        SELECT
            id,
            user_type,
            first_name,
            last_name,
            mobile,
            email,
            password,
            profile_image,
            status,
            last_login_at,
            deleted_at,
            created_at,
            updated_at
        FROM users
        WHERE id = ?
        AND deleted_at IS NULL
        LIMIT 1
        `,
        [userId]
    );

    return rows;
    }
    
    async getUserByEmailOld(email) {

        const [rows] = await dbPool.query(
            `
            SELECT
                id,
                email
            FROM users
            WHERE email = ?
            AND deleted_at IS NULL
            LIMIT 1
            `,
            [email]
        );

        return rows;
    }
    
    async updateUserOld(userId, data) {
        const allowedColumns = [
            'first_name',
            'last_name',
            'email',
            'profile_image',
            'aadhar_number',
            'aadhar_front',
            'aadhar_back',
            'dl_number',
            'dl_front',
            'dl_back',
            'pan',
            'pan_image'
        ];

        const fields = Object.keys(data).filter(
            (key) => allowedColumns.includes(key)
        );

        if (fields.length === 0) {
            return { affectedRows: 0 };
        }

        const setClause = fields.map((field) => `\`${field}\` = ?`).join(', ');
        const values = fields.map((field) => data[field]);

        const sql = `
            UPDATE users
            SET ${fields.length > 0 ? setClause + ', ' : ''}
                status = 3,
                updated_at = NOW()
            WHERE id = ?
            AND user_type = 3
            AND deleted_at IS NULL
        `;

        const [result] = await dbPool.execute(sql, [
            ...values,
            userId
        ]);

        return result;
    }

    async getVehicleByUserIdOld(userId) {
        const sql = `
            SELECT *
            FROM vehicles
            WHERE user_id = ?
            AND deleted_at IS NULL
            ORDER BY is_primary DESC, id DESC
            LIMIT 1
        `;

        const [rows] = await dbPool.execute(sql, [userId]);

        return rows[0] || null;
    }
    async createVehicleOLD(data) {
        const sql = `
            INSERT INTO vehicles (
                user_id,
                vehicle_type,
                vehicle_number,
                brand,
                model,
                color,
                fuel_type,
                vehicle_photo,
                rc_front,
                rc_back,
                is_primary,
                status,
                rejection_reason,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const values = [
            data.user_id,
            data.vehicle_type ?? null,
            data.vehicle_number ?? null,
            data.brand ?? null,
            data.model ?? null,
            data.color ?? null,
            data.fuel_type ?? null,
            data.vehicle_photo ?? null,
            data.rc_front ?? null,
            data.rc_back ?? null,
            data.is_primary ?? 1,
            data.status ?? 0,
            data.rejection_reason ?? null
        ];

        const [result] = await dbPool.execute(sql, values);

        return {
            id: result.insertId,
            user_id: data.user_id
        };
    }
    async updateVehicleOld(userId, data) {
        const allowedColumns = [
            'vehicle_type',
            'vehicle_number',
            'brand',
            'model',
            'color',
            'fuel_type',
            'vehicle_photo',
            'rc_front',
            'rc_back',
            'status',
            'rejection_reason'
        ];

        const fields = Object.keys(data).filter(
            (key) => allowedColumns.includes(key)
        );

        if (fields.length === 0) {
            return { affectedRows: 0 };
        }

        const setClause = fields.map((field) => `\`${field}\` = ?`).join(', ');
        const values = fields.map((field) => data[field]);

        const sql = `
            UPDATE vehicles
            SET ${setClause}, updated_at = NOW()
            WHERE user_id = ?
            AND deleted_at IS NULL
        `;

        const [result] = await dbPool.execute(sql, [
            ...values,
            userId
        ]);

        return result;
    }
    async getSettings(connection) {
        const [rows] = await connection.query(
            `SELECT setting_key, setting_value, setting_type
            FROM settings
            WHERE status = 1
            ORDER BY id ASC`
        );

        const settings = {};

        for (const row of rows) {
            let value = row.setting_value;

            if (row.setting_type === 'number') {
                value = Number(value);
            } else if (row.setting_type === 'boolean') {
                value = value === 'true' || value === '1';
            } else if (row.setting_type === 'json') {
                value = JSON.parse(value);
            }

            settings[row.setting_key] = value;
        }

        return settings;

    }

    // updated function with connection release
    
    async getUserById(userId, connection) {
        const sql = `
            SELECT *
            FROM users
            WHERE id = ?
            AND deleted_at IS NULL
            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [userId]);
        return rows;
    }

    async getUserByEmail(email, connection = dbPool) {
        const sql = `
            SELECT id, email
            FROM users
            WHERE email = ?
            AND deleted_at IS NULL
            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [email]);
        return rows;
    }

    async getVehicleByUserId(userId, connection = dbPool) {
        const sql = `
            SELECT *
            FROM vehicles
            WHERE user_id = ?
            AND deleted_at IS NULL
            ORDER BY is_primary DESC, id DESC
            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [userId]);
        return rows[0] || null;
    }

    async updateUser_bkp(userId, data, connection = dbPool) {
        const allowedColumns = [
            'first_name',
            'last_name',
            'email',
            'profile_image',
            'aadhar_number',
            'aadhar_front',
            'aadhar_back',
            'dl_number',
            'dl_front',
            'dl_back',
            'pan',
            'pan_image'
        ];

        const fields = Object.keys(data).filter(
            key => allowedColumns.includes(key)
        );

        if (fields.length === 0) {
            return { affectedRows: 0 };
        }

        const setClause = fields
            .map(field => `\`${field}\` = ?`)
            .join(', ');

        const values = fields.map(field => data[field]);

        const sql = `
            UPDATE users
            SET ${setClause},
                updated_at = NOW()
            WHERE id = ?
            AND user_type = 3
            AND deleted_at IS NULL
        `;

        const [result] = await connection.execute(sql, [
            ...values,
            userId
        ]);

        if (result.affectedRows === 0) {
            throw new Error('Driver profile was not updated.');
        }

        return result;
    }
    async updateUser(userId, data, connection = dbPool) {

        const allowedColumns = [
            'first_name',
            'last_name',
            'email',
            'profile_image',
            'aadhar_number',
            'aadhar_front',
            'aadhar_back',
            'aadhar_status',
            'aadhar_rejection_reason',
            'dl_number',
            'dl_front',
            'dl_back',
            'dl_status',
            'dl_rejection_reason',
            'pan',
            'pan_image',
            'pan_status',
            'pan_rejection_reason'
        ];

        const fields = Object.keys(data).filter(
            key => allowedColumns.includes(key)
        );

        if (fields.length === 0) {
            return { affectedRows: 0 };
        }

        const setClause = fields
            .map(field => `\`${field}\` = ?`)
            .join(', ');

        const values = fields.map(field => data[field]);

        const sql = `
            UPDATE users
            SET ${setClause},
                updated_at = NOW()
            WHERE id = ?
            AND user_type = 3
            AND deleted_at IS NULL
        `;

        const [result] = await connection.execute(sql, [
            ...values,
            userId
        ]);

        // affectedRows 0 ka matlab unchanged values bhi ho sakta hai.
        // Isliye ise error nahi banayenge.

        return result;
    }

    async createVehicle(data, connection = dbPool) {

        const sql = `
            INSERT INTO vehicles (
                user_id,
                vehicle_type,
                vehicle_number,
                brand,
                model,
                color,
                fuel_type,
                vehicle_photo,
                rc_front,
                rc_back,
                is_primary,
                status,
                rc_status,
                rejection_reason,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const values = [
            data.user_id,
            data.vehicle_type ?? null,
            data.vehicle_number ?? null,
            data.brand ?? null,
            data.model ?? null,
            data.color ?? null,
            data.fuel_type ?? null,
            data.vehicle_photo ?? null,
            data.rc_front ?? null,
            data.rc_back ?? null,
            data.is_primary ?? 1,
            data.status ?? 0,
            data.rc_status ?? 0,
            data.rejection_reason ?? null
        ];

        const [result] = await connection.execute(sql, values);

        return {
            id: result.insertId,
            user_id: data.user_id
        };
    }

    async updateVehicle(userId, data, connection = dbPool) {

        const allowedColumns = [
            'vehicle_type',
            'vehicle_number',
            'brand',
            'model',
            'color',
            'fuel_type',
            'vehicle_photo',
            'rc_front',
            'rc_back',
            'status',
            'rc_status',
            'rejection_reason'
        ];

        const fields = Object.keys(data).filter(
            key => allowedColumns.includes(key)
        );

        if (fields.length === 0) {
            return { affectedRows: 0 };
        }

        const setClause = fields
            .map(field => `\`${field}\` = ?`)
            .join(', ');

        const values = fields.map(field => data[field]);

        const sql = `
            UPDATE vehicles
            SET ${setClause},
                updated_at = NOW()
            WHERE user_id = ?
            AND deleted_at IS NULL
        `;

        const [result] = await connection.execute(sql, [
            ...values,
            userId
        ]);

        // Unchanged data par affectedRows 0 aa sakta hai.
        return result;
    }









   
}
module.exports = new AuthModel();