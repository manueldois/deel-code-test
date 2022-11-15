const { validationResult } = require('express-validator');

class UserError extends Error {
    constructor(message = 'User error', status = 400) {
        super(message)
        this.status = status
    }
}

class ForbiddenError extends Error {
    constructor(message = 'Forbidden', status = 403) {
        super(message)
        this.status = status
    }
}

function validationErrorHandler(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next()
}

module.exports = {
    UserError,
    ForbiddenError,
    validationErrorHandler,
}