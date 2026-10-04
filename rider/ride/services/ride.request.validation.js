const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const AirPortSearchValidation = (req, res, next) => {
    const schema = Joi.object({
        term: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('From Airport'),
            'string.empty': CustomMessages.paramRequire('From Airport'),
            'any.required': CustomMessages.paramRequire('From Airport'),
        })

    });
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};


module.exports = {
    AirPortSearchValidation
};
