const jwt = require('jsonwebtoken');
const AdminModel = require('../models/admin.models');
const CustomMessages = require('../../utilities/customMessages');

class AdminService {
    
    async login(connection,searchData) {
            const { email, password } = searchData;
    
            try {
                const users = await AdminModel.getUser(connection, email, password);
    
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
    
                
                const token = jwt.sign({user_id: user.id,user_type:user.user_type,email: user.email}
                    , process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION, algorithm: process.env.JWT_ALGORITHM, });
                try {
                    let updateduser  = await AdminModel.updateToken(connection, user.id, token);
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
    
    async logout(connection, userId) {
        try {
            await AdminModel.updateToken(connection, userId, null);
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

    // for drivers
    getFileUrl(fileName, directory) {
        if (!fileName) return null;
        const baseUrl = process.env.APP_BASE_URL;
        if (!baseUrl) {
            return null;
        }
        return `${baseUrl.replace(/\/$/, '')}/uploads/${directory}/${encodeURIComponent(fileName)}`;
    }
    getDriverDocumentUrls(user, vehicle) {
        return {
            profile_image: this.getFileUrl(
                user.profile_image,
                'driver_doc/profile_image'
            ),

            aadhar_front: this.getFileUrl(
                user.aadhar_front,
                'driver_doc/aadhar'
            ),

            aadhar_back: this.getFileUrl(
                user.aadhar_back,
                'driver_doc/aadhar'
            ),

            pan_image: this.getFileUrl(
                user.pan_image,
                'driver_doc/pan'
            ),

            dl_front: this.getFileUrl(
                user.dl_front,
                'driver_doc/dl'
            ),

            dl_back: this.getFileUrl(
                user.dl_back,
                'driver_doc/dl'
            ),

            vehicle_photo: this.getFileUrl(
                vehicle?.vehicle_photo,
                'vehicles/vehicle_photo'
            ),

            rc_front: this.getFileUrl(
                vehicle?.rc_front,
                'vehicles/rc'
            ),

            rc_back: this.getFileUrl(
                vehicle?.rc_back,
                'vehicles/rc'
            )
        };
    }
    async getDrivers(connection,query) {
        const page = Math.max( 1,parseInt(query.page, 10) || 1);
        const limit = Math.min(100,Math.max(1, parseInt(query.limit, 10) || 10));
        const offset = (page - 1) * limit;
        const filters = {
            page,
            limit,
            offset,
            search: query.search
                ? String(query.search).trim()
                : '',
            status: query.status,
            documentStatus: query.document_status
        };

        if (
            filters.status !== undefined &&
            filters.status !== '' &&
            !['1', '2', '0'].includes(String(filters.status))
        ) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid driver status filter.'
            };
        }

        if (
            filters.documentStatus !== undefined &&
            filters.documentStatus !== '' &&
            !['0', '1', '2'].includes(String(filters.documentStatus))
        ) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid document status filter.'
            };
        }

        const [drivers, total] = await Promise.all([
            AdminModel.getDrivers(connection,filters),
            AdminModel.countDrivers(connection,filters)
        ]);

        const data = drivers.map(driver => {
            const documentStatuses = {
                aadhar: Number(driver.aadhar_status),
                pan: Number(driver.pan_status),
                dl: Number(driver.dl_status),
                rc: driver.rc_status === null
                    ? null
                    : Number(driver.rc_status)
            };
            return {
                ...driver,
                document_status: documentStatuses,
                documents: {
                    aadhar: documentStatuses.aadhar,
                    pan: documentStatuses.pan,
                    dl: documentStatuses.dl,
                    rc: documentStatuses.rc
                }
            };
        });

        return {
            status: 1,
            message: 'Drivers fetched successfully.',
            data: {
                drivers: data,
                pagination: {
                    current_page: page,
                    per_page: limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        };
    }
    async getDriverDetails(connection, driverId) {
        if (!/^\d+$/.test(String(driverId))) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid driver ID.'
            };
        }
        const user = await AdminModel.getDriverDetails(connection, driverId);
        if (!user) {
            return {
                status: 0,
                httpStatus: 404,
                message: 'Driver not found.'
            };
        }
        const vehicle = await AdminModel.getDriverVehicle(connection, driverId);
        const documentUrls = this.getDriverDocumentUrls(
            user,
            vehicle
        );

        return {
            status: 1,
            message: 'Driver details fetched successfully.',
            data: {
                driver: user,
                vehicle,
                document_urls: documentUrls
            }
        };
    }
    async verifyDocument(connection, data) {

        const driverId = data.driver_id;
        const document = String(data.document || '').toLowerCase();
        const action = String(data.action || '').toLowerCase();

        if (!/^\d+$/.test(String(driverId))) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Valid driver_id is required.'
            };
        }

        if (!['aadhar', 'pan', 'dl', 'rc'].includes(document)) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid document. Allowed: aadhar, pan, dl, rc.'
            };
        }

        if (!['approve', 'reject'].includes(action)) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Action must be approve or reject.'
            };
        }

        const rejectionReason = data.rejection_reason
            ? String(data.rejection_reason).trim()
            : null;

        if (action === 'reject' && !rejectionReason) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Rejection reason is required.'
            };
        }

        if (rejectionReason && rejectionReason.length > 500) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Rejection reason cannot exceed 500 characters.'
            };
        }

        const result = await AdminModel.verifyDriverDocument(connection, {
            driverId,
            document,
            action,
            rejectionReason
        });

        return {
            status: 1,
            message: action === 'approve'
                ? `${document.toUpperCase()} document approved successfully.`
                : `${document.toUpperCase()} document rejected successfully.`,
            data: {
                driver_id: Number(driverId),
                document,
                document_status: result.document_status,
                driver_status: result.driver_status,
                driver_status_text: result.driver_status === 1
                    ? 'Active'
                    : 'Pending'
            }
        };
    }
    // for drivers end

    async getVehicles(connection, query) {
        const page = Math.max(1, parseInt(query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
        const offset = (page - 1) * limit;

        const filters = {
            page,
            limit,
            offset,
            search: query.search ? String(query.search).trim() : '',
            status: query.status,
            rcStatus: query.rc_status,
            vehicleType: query.vehicle_type
                ? String(query.vehicle_type).trim()
                : ''
        };

        if (
            filters.status !== undefined &&
            filters.status !== '' &&
            !['0', '1', '2', '3'].includes(String(filters.status))
        ) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid vehicle status filter.'
            };
        }

        if (
            filters.rcStatus !== undefined &&
            filters.rcStatus !== '' &&
            !['0', '1', '2'].includes(String(filters.rcStatus))
        ) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid RC status filter.'
            };
        }

        const [vehicles, total] = await Promise.all([
            AdminModel.getVehicles(connection, filters),
            AdminModel.countVehicles(connection, filters)
        ]);

        const data = vehicles.map(vehicle => ({
            ...vehicle,
            vehicle_photo_url: this.getFileUrl(
                vehicle.vehicle_photo,
                'vehicles/vehicle_photo'
            ),
            rc_front_url: this.getFileUrl(
                vehicle.rc_front,
                'vehicles/rc'
            ),
            rc_back_url: this.getFileUrl(
                vehicle.rc_back,
                'vehicles/rc'
            )
        }));

        return {
            status: 1,
            message: 'Vehicles fetched successfully.',
            data: {
                vehicles: data,
                pagination: {
                    current_page: page,
                    per_page: limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        };
    }

    async getVehicleDetails(connection, vehicleId) {
        if (!/^\d+$/.test(String(vehicleId))) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid vehicle ID.'
            };
        }

        const vehicle = await AdminModel.getVehicleDetails(connection, vehicleId);

        if (!vehicle) {
            return {
                status: 0,
                httpStatus: 404,
                message: 'Vehicle not found.'
            };
        }

        const documentUrls = {
            vehicle_photo: this.getFileUrl(
                vehicle.vehicle_photo,
                'vehicles/vehicle_photo'
            ),
            rc_front: this.getFileUrl(
                vehicle.rc_front,
                'vehicles/rc'
            ),
            rc_back: this.getFileUrl(
                vehicle.rc_back,
                'vehicles/rc'
            )
        };

        return {
            status: 1,
            message: 'Vehicle details fetched successfully.',
            data: {
                vehicle,
                driver: {
                    id: vehicle.user_id,
                    first_name: vehicle.first_name,
                    last_name: vehicle.last_name,
                    mobile: vehicle.mobile,
                    email: vehicle.email,
                    profile_image: vehicle.profile_image,
                    driver_status: vehicle.driver_status,
                    is_online: vehicle.is_online
                },
                document_urls: documentUrls
            }
        };
    }

    // Allowed vehicle types
    getAllowedVehicleTypes() {
        return (process.env.VEHICLE_TYPES || 'bike,auto,car')
            .split(',')
            .map(type => type.trim().toLowerCase())
            .filter(Boolean);
    }

    // Fare Settings - Get
    async getFareSettings(connection, vehicleType) {

        const type = String(vehicleType || '').trim().toLowerCase();
        const allowedTypes = this.getAllowedVehicleTypes();

        if (!allowedTypes.includes(type)) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid vehicle type.'
            };
        }

        const settings = await AdminModel.getFareSettings(connection, type);

        return {
            status: 1,
            message: 'Fare settings fetched successfully.',
            data: settings
        };
    }


    // Fare Settings - Update
    async updateFareSettings(connection,data) {

        const type = String(data.vehicle_type || '')
            .trim()
            .toLowerCase();

        const allowedTypes = this.getAllowedVehicleTypes();

        if (!allowedTypes.includes(type)) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Invalid vehicle type.'
            };
        }

        const fares = data.fares;

        if (!fares || typeof fares !== 'object' || Array.isArray(fares)) {
            return {
                status: 0,
                httpStatus: 400,
                message: 'Fare details are required.'
            };
        }

        const fields = [
            'base_fare',
            'base_fare_max_km',
            'per_km_charge',
            'night_fare_percentage'
        ];

        const validatedFares = {};

        for (const field of fields) {

            if (
                fares[field] === undefined ||
                fares[field] === null ||
                String(fares[field]).trim() === ''
            ) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: `${field} is required.`
                };
            }

            const value = Number(fares[field]);

            if (!Number.isFinite(value) || value < 0) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: `${field} must be a valid non-negative number.`
                };
            }

            validatedFares[field] = value;
        }

        await AdminModel.updateFareSettings(connection,type, validatedFares);

        return {
            status: 1,
            message: `${type.toUpperCase()} fare settings updated successfully.`,
            data: {
                vehicle_type: type,
                ...validatedFares
            }
        };
    }

    
}


          
module.exports = new AdminService();