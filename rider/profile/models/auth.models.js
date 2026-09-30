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
    async updateToken(userId, token) {
        try {
            const sql = 'UPDATE user SET token = ? WHERE  user_id=?';
            const result = await dbPool.query(sql, [token, userId]);
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

     async getUserByMobile(mobile) {

        const sql = `
            SELECT
                id,
                user_type,
                name,
                mobile,
                email,
                password_hash,
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

        const [rows] = await dbPool.execute(sql, [mobile]);

        return rows;
    }
    /**
     * Expire previous pending OTPs
     */
    async expirePreviousOtps(mobile, otpType) {

        const sql = `
            UPDATE otps
            SET status = 'EXPIRED'
            WHERE mobile = ?
              AND otp_type = ?
              AND status = 'PENDING'
        `;

        const [result] = await dbPool.execute(sql, [
            mobile,
            otpType
        ]);

        return result;
    }


    /**
     * Create OTP
     */
    async createOtp(data) {

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

        const [result] = await dbPool.execute(sql, [
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
    async getLatestPendingOtp(mobile, otpType) {

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

        const [rows] = await dbPool.execute(sql, [
            mobile,
            otpType
        ]);

        return rows.length > 0 ? rows[0] : null;
    }


    /**
     * Increment wrong OTP attempts
     */
    async incrementOtpAttempt(id) {

        const sql = `
            UPDATE otps
            SET attempts = attempts + 1
            WHERE id = ?
              AND status = 'PENDING'
        `;

        const [result] = await dbPool.execute(sql, [id]);

        return result;
    }


    /**
     * Mark OTP blocked
     */
    async markOtpBlocked(id) {

        const sql = `
            UPDATE otps
            SET status = 'BLOCKED'
            WHERE id = ?
        `;

        const [result] = await dbPool.execute(sql, [id]);

        return result;
    }


    /**
     * Mark OTP expired
     */
    async markOtpExpired(id) {

        const sql = `
            UPDATE otps
            SET status = 'EXPIRED'
            WHERE id = ?
        `;

        const [result] = await dbPool.execute(sql, [id]);

        return result;
    }


    /**
     * Mark OTP verified
     */
    async markOtpVerified(id) {

        const sql = `
            UPDATE otps
            SET
                status = 'VERIFIED',
                verified_at = NOW()
            WHERE id = ?
              AND status = 'PENDING'
        `;

        const [result] = await dbPool.execute(sql, [id]);

        return result;
    }


    /**
     * Update last login
     */
    async updateLastLogin(userId) {

        const sql = `
            UPDATE users
            SET last_login_at = NOW()
            WHERE id = ?
        `;

        const [result] = await dbPool.execute(sql, [userId]);

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
    async getUserById(userId) {

        const sql = `
            SELECT
                id,
                user_type,
                name,
                mobile,
                email,
                password_hash,
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


   
}
module.exports = new AuthModel();