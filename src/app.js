const express = require('express');
const bodyParser = require('body-parser');
const { OptimisticLockError } = require('sequelize')
const { UserError, ForbiddenError } = require('./errors')

const routes = require('./routes')

const app = express();

app.use(bodyParser.json());

app.use('/jobs', routes.jobs)
app.use('/contracts', routes.contracts)
app.use('/admin', routes.admin)
app.use('/balances', routes.balances)

app.use((err, req, res, next) => {
    // If it's an expected error, just send the message and end
    if (err instanceof UserError || err instanceof ForbiddenError) {
        res.status(err.status).json({ error: err.message })
        next()
        return
    }

    // If resource is locked, send 412
    if (err instanceof OptimisticLockError) {
        res.status(412).json({ error: err.message })
        next()
        return
    }

    //  If internal server error, log it to console and send message
    console.error("ERROR: ", err.message, err.stack)
    res.status(500).json({ error: err.message })
})

module.exports = app;
