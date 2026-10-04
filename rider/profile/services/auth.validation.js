const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const authSchema = Joi.object({
    email: Joi.string()
        .required()
        .email({ tlds: { allow: false } })
        .messages({
            'string.base': CustomMessages.emailIsEmail(),
            'string.email': CustomMessages.emailIsEmail(),
            'string.empty': CustomMessages.emailNotEmpty(),
            'any.required': CustomMessages.emailNotEmpty(),
        }),
    password: Joi.string().required().messages({
        'string.empty': CustomMessages.passwordIsRequired(),
        'any.required': CustomMessages.passwordIsRequired(),
    }),
})
const sendOtpSchema = Joi.object({
    mobile: Joi.string()
        .trim()
        .required()
        .pattern(/^[6-9]\d{9}$/)
        .messages({
            'string.base': 'Mobile number must be a string',
            'string.empty': 'Mobile number is required',
            'any.required': 'Mobile number is required',
            'string.pattern.base': 'Please enter a valid mobile number',
        }),

    user_type: Joi.number()
        .integer()
        .required()
        .valid(1, 2, 3)
        .messages({
            'number.base': 'User type must be a number',
            'number.integer': 'User type must be an integer',
            'any.required': 'User type is required',
            'any.only': 'Invalid user type',
        }),
});

const verifyOtpSchema = Joi.object({
    mobile: Joi.string()
        .trim()
        .required()
        .pattern(/^[6-9]\d{9}$/)
        .messages({
            'string.base': 'Mobile number must be a string',
            'string.empty': 'Mobile number is required',
            'any.required': 'Mobile number is required',
            'string.pattern.base': 'Please enter a valid mobile number',
        }),

    otp: Joi.string()
        .trim()
        .required()
        .pattern(/^\d{6}$/)
        .messages({
            'string.base': 'OTP must be a string',
            'string.empty': 'OTP is required',
            'any.required': 'OTP is required',
            'string.pattern.base': 'OTP must be 6 digits',
        }),

    device_id: Joi.string()
        .trim()
        .allow('', null)
        .optional(),

    device_type: Joi.string()
        .trim()
        .lowercase()
        .valid('android', 'ios', 'web')
        .optional()
        .messages({
            'any.only': 'Device type must be android, ios or web',
        }),

    fcm_token: Joi.string()
        .trim()
        .allow('', null)
        .optional(),
});

const updateProfileSchema = Joi.object({
    first_name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.base': 'First name must be a string',
            'string.empty': 'First name is required',
            'string.min': 'First name must be at least 2 characters',
            'string.max': 'First name cannot exceed 100 characters',
            'any.required': 'First name is required'
        }),

    last_name: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.base': 'Last name must be a string',
            'string.empty': 'Last name is required',
            'string.min': 'Last name is required',
            'string.max': 'Last name cannot exceed 100 characters',
            'any.required': 'Last name is required'
        }),

    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .optional()
        .allow('', null)
        .messages({
            'string.base': 'Email must be a string',
            'string.email': 'Please enter a valid email address'
        }),

    aadhaar_number: Joi.string()
        .trim()
        .pattern(/^\d{12}$/)
        .required()
        .messages({
            'string.base': 'Aadhaar number must be a string',
            'string.empty': 'Aadhaar number is required',
            'string.pattern.base': 'Please enter a valid 12 digit Aadhaar number',
            'any.required': 'Aadhaar number is required'
        })
});




module.exports = {
    authSchema,
    sendOtpSchema,
    verifyOtpSchema,
    updateProfileSchema

};
