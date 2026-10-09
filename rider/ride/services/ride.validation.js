const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const bookSchema = (req, res, next) => {
    const schema = Joi.object({
        pickup_address: Joi.string().trim().max(255).required(),

        pickup_latitude: Joi.number().min(-90).max(90).required(),
        pickup_longitude: Joi.number().min(-180).max(180).required(),

        drop_address: Joi.string().trim().max(255).required(),

        drop_latitude: Joi.number().min(-90).max(90).required(),
        drop_longitude: Joi.number().min(-180).max(180).required(),

        vehicle_type: Joi.string()
            .trim()
            .valid('bike', 'auto', 'car')
            .required(),

        payment_method: Joi.string()
            .valid('cash', 'online')
            .default('cash')
    });

    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: 'Validation failed',
            errors: error.details.map(item => item.message)
        });
    }

    req.body = value;
    next();
};

module.exports = {
    bookSchema
};
