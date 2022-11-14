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

module.exports = {
    UserError,
    ForbiddenError,
}