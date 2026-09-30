const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthModel = require('../models/auth.models');

const crypto = require('crypto');
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRATION || 5);
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);


class AuthService {
    async login(searchData) {
        const { email, password } = searchData;

        try {
            const users = await AuthModel.getUser(email, password);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: CustomMessages.invalidCredErr('msg'),
                    details: CustomMessages.invalidCredErr(),
                };
            }

            let user = users[0];
            let privileges = user.privileges;
            let privilegesArray = [];
            if (privileges && privileges.length > 0) {
                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges.split(',').map(p => p.trim());
            }

            
            const token = jwt.sign({user_id: user.user_id,user_type:user.user_type, uuid: user.uuid, privileges: privilegesArray }
                , process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION, algorithm: process.env.JWT_ALGORITHM, });
            try {
                let updateduser  = await AuthModel.updateToken(user.user_id, token);
                user = (Array.isArray(updateduser) || updateduser.length > 0)?updateduser:user;
                user.map(user => {
                    user.privileges = privilegesArray;
                    return user;
                });        
            } catch (err) {
                return {
                    status: 0,
                    message: 'Login Failed',
                    details: err.message,
                };
            }
            return {
                status: 1,
                message: CustomMessages.login(),
                token,
                data: user,
            }
        } catch (error) {
            return {
                status: 0,
                message: 'Something went our end please try after some time',
                details: error.message,
            };
        }
    }
    
    async logout(userId) {
        try {
            await AuthModel.updateToken(userId, null);
            return {
                status: 1,
                message: 'Logout successful',
            };
        } catch (error) {
            return {
                status: 0,
                message: 'Logout failed',
                details: error.message,
            };
        }
    }

     /**
     * Generate random 6 digit OTP
     */
    generateOtp() {
        return crypto.randomInt(100000, 1000000).toString();
    }
    /**
     * Hash OTP before storing
     */
    hashOtp(otp) {
        return crypto
            .createHash('sha256')
            .update(otp)
            .digest('hex');
    }

    /**
     * Send OTP
     */
   async sendOtp(mobile) {

    try {

        // -----------------------------------
        // 1. Validate mobile
        // -----------------------------------

        if (!mobile) {
            return {
                status: 0,
                message: 'Mobile number is required'
            };
        }

        mobile = mobile.toString().trim();

        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return {
                status: 0,
                message: 'Please enter a valid mobile number'
            };
        }


        // -----------------------------------
        // 2. Find user
        // -----------------------------------

        let users = await AuthModel.getUserByMobile(mobile);

        let user;


        // -----------------------------------
        // 3. User does not exist
        // -----------------------------------

        if (!Array.isArray(users) || users.length === 0) {

            // Create new user
            const userResult = await AuthModel.createUser({
                user_type: 2,
                mobile: mobile,
                status: 1
            });

            if (!userResult || !userResult.insertId) {
                return {
                    status: 0,
                    message: 'Unable to create user'
                };
            }


            // Get newly created user
            const newUsers = await AuthModel.getUserById(
                userResult.insertId
            );

            if (!Array.isArray(newUsers) || newUsers.length === 0) {
                return {
                    status: 0,
                    message: 'Unable to create user'
                };
            }

            user = newUsers[0];

        } else {

            // Existing user
            user = users[0];
        }


        // -----------------------------------
        // 4. Check account status
        // -----------------------------------

        if (user.status === 0) {
            return {
                status: 0,
                message: 'Your account is inactive'
            };
        }

        if (user.status === 2) {
            return {
                status: 0,
                message: 'Your account is blocked'
            };
        }


        // -----------------------------------
        // 5. Generate OTP
        // -----------------------------------

        const otp = this.generateOtp();

        const otpHash = this.hashOtp(otp);


        // -----------------------------------
        // 6. OTP expiry
        // -----------------------------------

        const expiresAt = new Date(
            Date.now() +
            OTP_EXPIRY_MINUTES * 60 * 1000
        );


        // -----------------------------------
        // 7. Expire previous OTP
        // -----------------------------------

        await AuthModel.expirePreviousOtps(
            mobile,
            'LOGIN'
        );


        // -----------------------------------
        // 8. Create new OTP
        // -----------------------------------

        await AuthModel.createOtp({
            user_id: user.id,
            mobile: mobile,
            otp_type: 'LOGIN',
            otp_hash: otpHash,
            attempts: 0,
            max_attempts: MAX_OTP_ATTEMPTS,
            expires_at: expiresAt
        });


        // -----------------------------------
        // 9. Send SMS
        // -----------------------------------

        /*
        await SmsService.sendOtp(
            mobile,
            otp
        );
        */


        // Development only
        console.log(`OTP for ${mobile}: ${otp}`);


        // -----------------------------------
        // 10. Response
        // -----------------------------------

        return {
            status: 1,
            message: 'OTP sent successfully'
        };


    } catch (error) {

        console.error('sendOtp error:', error);

        return {
            status: 0,
            message: 'Unable to send OTP',
            details: error.message || 'Unknown error'
        };
    }
}


    /**
     * Verify OTP and Login
     */
    async verifyOtp(mobile, otp) {

        try {

            if (!mobile || !otp) {
                return {
                    status: 0,
                    message: 'Mobile number and OTP are required'
                };
            }


            mobile = mobile.toString().trim();
            otp = otp.toString().trim();


            if (!/^[6-9]\d{9}$/.test(mobile)) {
                return {
                    status: 0,
                    message: 'Please enter a valid mobile number'
                };
            }


            if (!/^\d{6}$/.test(otp)) {
                return {
                    status: 0,
                    message: 'OTP must be 6 digits'
                };
            }


            // Find user
            const users = await AuthModel.getUserByMobile(mobile);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: 'User not found'
                };
            }

            const user = users[0];


            // Check user status
            if (user.status === 0) {
                return {
                    status: 0,
                    message: 'Your account is inactive'
                };
            }

            if (user.status === 2) {
                return {
                    status: 0,
                    message: 'Your account is blocked'
                };
            }


            // Get latest pending OTP
            const otpRecord = await AuthModel.getLatestPendingOtp(
                mobile,
                'LOGIN'
            );


            if (!otpRecord) {
                return {
                    status: 0,
                    message: 'OTP expired or not found'
                };
            }


            // Check expiry
            if (new Date(otpRecord.expires_at) < new Date()) {

                await AuthModel.markOtpExpired(otpRecord.id);

                return {
                    status: 0,
                    message: 'OTP has expired'
                };
            }


            // Check attempts
            if (otpRecord.attempts >= otpRecord.max_attempts) {

                await AuthModel.markOtpBlocked(otpRecord.id);

                return {
                    status: 0,
                    message: 'Maximum OTP attempts exceeded'
                };
            }


            // Hash entered OTP
            const otpHash = this.hashOtp(otp);


            // Compare OTP
            if (otpHash !== otpRecord.otp_hash) {

                await AuthModel.incrementOtpAttempt(
                    otpRecord.id
                );

                const remainingAttempts =
                    otpRecord.max_attempts -
                    (otpRecord.attempts + 1);


                if (remainingAttempts <= 0) {

                    await AuthModel.markOtpBlocked(
                        otpRecord.id
                    );

                    return {
                        status: 0,
                        message: 'Maximum OTP attempts exceeded'
                    };
                }


                return {
                    status: 0,
                    message: 'Invalid OTP',
                    remaining_attempts: remainingAttempts
                };
            }


            // OTP verified
            await AuthModel.markOtpVerified(
                otpRecord.id
            );


            // Update last login
            await AuthModel.updateLastLogin(
                user.id
            );


            /*
             * Existing privileges logic
             *
             * Agar aapke users query mein privileges
             * already aa rahe hain to yahan use kar sakte hain.
             */

            let privileges = user.privileges;

            let privilegesArray = [];

            if (privileges && privileges.length > 0) {

                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges
                        .split(',')
                        .map(p => p.trim());
            }


            // JWT
            const tokenPayload = {
                user_id: user.id,
                user_type: user.user_type,
                privileges: privilegesArray
            };


            // Agar actual users table mein uuid column hai
            if (user.uuid) {
                tokenPayload.uuid = user.uuid;
            }


            const token = jwt.sign(
                tokenPayload,
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRATION,
                    algorithm: process.env.JWT_ALGORITHM
                }
            );


            // Save token if your table has token column
            /*
            await AuthModel.updateToken(user.id, token);
            */


            // Password ko response mein kabhi mat bhejna
            delete user.password_hash;


            return {
                status: 1,
                message: 'Login successful',
                token,
                data: {
                    ...user,
                    privileges: privilegesArray
                }
            };

        } catch (error) {

            return {
                status: 0,
                message: 'Login failed',
                details: error.message
            };
        }
    }

    /**
     * Resend OTP
     */
    async resendOtp(mobile) {

        return await this.sendOtp(mobile);
    }
}
module.exports = new AuthService();