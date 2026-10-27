const AuthModel = require('../models/auth.models');
const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthService = require('../services/auth.service');

const JWT_secret_key = process.env.JWT_SECRET;

class AuthController {

    async login(req, res) {
        try {
            let searchData = req.body;
            const result = await AuthService.login(searchData);
            res.send(result);
        } catch (err) {
            res.status(500).json({ success: 0, message: err.message, details: err });
        }
    }

    static async getUser(req, res) {
        let email = req.body.email;
        let password = req.body.password;
        let deviceType = req.body.devicetype;
        let result = {};
        try {
            const selectata = await UserModel.selectUser(email, password);
            const numOfUsersFound = Array.isArray(selectata) ? selectata.length : 0;
            if (numOfUsersFound < 1) {
                result.status = 0;
                result.errors = CustomMessages.invalidCredErr();
                result.message = CustomMessages.invalidCredErr('msg');
                res.status(200).json(result);
            } else {
                const token = jwt.sign(selectata[0], JWT_secret_key);
                console.log(token)
                // req.session.token = token;
                result.status = 1;
                result.token = token;
                result.Userdata = selectata[0];
                result.data = selectata[0];
                // global.Authtoken = token;
                // await UserModel.updateUser(selectata[0].user_id, global.Authtoken);
                // req.session.deviceType = deviceType;
                // result.devicetype = deviceType;
                result.message = CustomMessages.login();
                res.json(result).status(200);
            }
        } catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }
    // write logout function with dbpol query remove token from db user table 
    async logout(req, res) {
        let result = {};
        try {
            const userId = req.user.user_id;
            // use auth servervice logout function
            let loutKey = await AuthService.logout(userId);
            if (loutKey.status === 0) {
                result.status = 0;
                result.errors = loutKey.details;
                result.message = CustomMessages.serverMsg();
                return res.json(result).status(500);
            }
            // destroy jwt token
            //jwt.destroy(req.user);
            // await UserModel.updateUser(userId, null);
            result.status = 1;
            result.doLogout = 1;
            result.message = CustomMessages.logout();
            res.json(result).status(200);
        }
        catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }
    static async logoutUser(req, res) {
        let result = {};
        try {
            req.session.destroy((err) => {
                if (err) {
                    result.status = 0;
                    result.errors = error.message;
                    result.message = CustomMessages.serverMsg();
                    res.json(result).status(500);
                } else {
                    result.status = 1;
                    result.message = CustomMessages.logout();
                    res.json(result).status(200);
                }
            });
        }
        catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }

    async sendOtp(req, res) {
        try {
            const { mobile ,user_type} = req.body;
            const result = await AuthService.sendOtp(mobile, user_type);
            return res.status(result.status === 1 ? 200 : 400).json(result);

        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

    async verifyOtp(req, res) {
        try {
            const { mobile, otp, device_id, device_type, fcm_token } = req.body; 
            const device = { device_id, device_type, fcm_token };
            const result = await AuthService.verifyOtp(mobile, otp,device);
            return res.status(result.status === 1 ? 200 : 400).json(result);
        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

    async resendOtp(req, res) {
        try {
            const { mobile } = req.body;

            const result = await AuthService.resendOtp(mobile);

            return res.status(result.status === 1 ? 200 : 400).json(result);

        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }
    async updateProfile(req, res) {
        try {
            if (!req.user || !req.user.user_id) {
                return res.status(401).json({
                    status: 0,
                    message: 'Unauthorized. Please login again.'
                });
            }

            const userId = req.user.user_id;
            const userType = req.user.user_type;
            if (Number(userType) !== 3) {
                return res.status(403).json({
                    status: 0,
                    message: 'Only drivers can update this profile.'
                });
            }

            const files = req.files || {};

            const getFile = (field) => files[field]?.[0] || null;

            // Required DL and RC documents
            const dlFront = getFile('dl_front');
            const dlBack = getFile('dl_back');
            const rcFront = getFile('rc_front');
            const rcBack = getFile('rc_back');

            if (!dlFront || !dlBack || !rcFront || !rcBack) {
                return res.status(400).json({
                    status: 0,
                    message: 'DL front, DL back, RC front and RC back images are required.',
                    required_files: [
                        'dl_front',
                        'dl_back',
                        'rc_front',
                        'rc_back'
                    ]
                });
            }

            // All remaining fields are optional
            const {
                first_name,
                last_name,
                email,
                aadhaar_number,
                dl_number,
                pan,
                vehicle_type,
                vehicle_number,
                brand,
                model,
                color,
                fuel_type
            } = req.body;

            const profileData = {
                first_name,
                last_name,
                email,
                aadhaar_number,
                dl_number,
                pan,
                vehicle_type,
                vehicle_number,
                brand,
                model,
                color,
                fuel_type
            };

            // Remove undefined values so omitted fields remain unchanged
            Object.keys(profileData).forEach((key) => {
                if (profileData[key] === undefined) {
                    delete profileData[key];
                }
            });

            const uploadedFiles = {
                profileImage: getFile('profile_image'),
                aadhaarFront: getFile('aadhar_front'),
                aadhaarBack: getFile('aadhar_back'),
                dlFront,
                dlBack,
                panImage: getFile('pan_image'),
                vehiclePhoto: getFile('vehicle_photo'),
                rcFront,
                rcBack
            };

            const result = await AuthService.updateProfile(
                userId,
                userType,
                profileData,
                uploadedFiles
            );

            return res.status(
                result.status === 1
                    ? 200
                    : result.httpStatus || 400
            ).json(result);

        } catch (error) {
            console.error('Update Profile Error:', error);

            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

    async getSettings(req, res) {
        try {
            const result = await AuthService.getSettings();

            return res
                .status(result.status === 1 ? 200 : 400)
                .json(result);

        } catch (error) {
            return res.status(500).json({
                status: 0,
                message: 'Something went wrong. Please try again later.',
                details: error.message
            });
        }
    }

    


}
module.exports = new AuthController(); 