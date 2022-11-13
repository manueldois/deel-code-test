const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler')
const { Op } = require('sequelize')
const { sequelize, Job, Contract, Profile } = require('./model')
const { getProfile } = require('./middleware/getProfile')

const app = express();

app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

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

/**
 * Tests if passed input is a string in format YYYY-MM-DD
 * @param {any} date 
 */
function isValidDate(date) {
    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (!date) return false
    if (typeof date != 'string') return false
    if (date.length != 10) return false
    if (!dateRegex.test(date)) return false
    return true
}

app.get('/contracts/:id', getProfile, asyncHandler(async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params

    const contract = await Contract.findOne({ where: { id } })

    if (!contract) {
        throw new UserError('Contract not found', 404)
    }

    if (!(req.profile.id == contract.ClientId || req.profile.id == contract.ContractorId)) {
        throw new ForbiddenError('User can\'t access this contract')
    }

    res.json(contract)
}))

app.get('/contracts', getProfile, asyncHandler(async (req, res) => {
    const { Contract } = req.app.get('models')
    const userId = req.profile.id

    const contracts = await Contract.findAll(
        {
            where: {
                [Op.or]: {
                    ClientId: userId,
                    ContractorId: userId
                },
                status: {
                    [Op.in]: ['new', 'in_progress']
                }
            }
        }
    )

    res.json(contracts)
}))

app.get('/jobs/unpaid', getProfile, asyncHandler(async (req, res) => {
    const { Job, Contract } = req.app.get('models')
    const userId = req.profile.id

    const jobs = await Job.findAll(
        {
            where: {
                paid: {
                    [Op.not]: true
                },
            },
            include: {
                model: Contract,
                attributes: [],
                where: {
                    [Op.or]: {
                        ClientId: userId,
                        ContractorId: userId
                    }
                }
            }
        }
    )

    res.json(jobs)
}))

app.get('/admin/best-profession', asyncHandler(async (req, res) => {
    const { start, end } = req.query

    // I assumed that a date is only date, and not also time
    if (start && !isValidDate(start)) {
        throw new UserError('Start is not a valid date')
    }
    if (end && !isValidDate(end)) {
        throw new UserError('End is not a valid date')
    }

    // When passed '2020-08-15', sequelize was converting it to '2020-08-14 23:00:00.000 +00:00'
    // No idea why. Let's set time to 00:00:00Z
    const where = {
        paid: 1
    }

    if (start || end) {
        where.paymentDate = {}

        if (start) {
            where.paymentDate[Op.gte] = new Date(start).toISOString()
        }

        if (end) {
            where.paymentDate[Op.lt] = new Date(end).toISOString()
        }
    }

    const bestPayingProfession = await Job.findAll(
        {
            attributes: [
                [sequelize.fn('sum', sequelize.col('price')), 'sum'],
                [sequelize.col('Contract.Contractor.profession'), 'profession']
            ],
            where,
            include: {
                model: Contract,
                attributes: [],
                include: {
                    model: Profile,
                    as: 'Contractor',
                    attributes: [],
                }
            },
            group: 'Contract.Contractor.profession',
            order: [
                [sequelize.fn('sum', sequelize.col('price')), 'DESC']
            ],
            limit: 1,
            plain: true,
            raw: true,
        }
    )

    res.json(bestPayingProfession)
}))

app.get('/admin/best-clients', asyncHandler(async (req, res) => {
    const { start, end } = req.query
    const limit = parseInt(req.query.limit) || 2

    if (start && !isValidDate(start)) {
        throw new UserError('Start is not a valid date')
    }
    if (end && !isValidDate(end)) {
        throw new UserError('End is not a valid date')
    }

    const where = {
        paid: 1
    }

    if (start || end) {
        where.paymentDate = {}

        if (start) {
            where.paymentDate[Op.gte] = new Date(start).toISOString()
        }

        if (end) {
            where.paymentDate[Op.lt] = new Date(end).toISOString()
        }
    }

    const bestPayingClients = await Job.findAll(
        {
            attributes: [
                [sequelize.fn('sum', sequelize.col('price')), 'paid'],
                // Apparently, sqlite does not support CONCAT, only the || operator,
                // But sequelize queries for CONCAT, which errors
                // Just add them in JS
                // [sequelize.fn('concat', sequelize.col('firstName'), ' ', sequelize.col('lastName')), 'fullName'],
            ],
            where,
            include: {
                model: Contract,
                attributes: [],
                include: {
                    model: Profile,
                    as: 'Client',
                    attributes: [
                        'id',
                        'firstName',
                        'lastName'
                    ],
                }
            },
            group: [
                'Contract.Client.id',
                'Contract.Client.firstName',
                'Contract.Client.lastName',
            ],
            order: [
                [sequelize.fn('sum', sequelize.col('price')), 'DESC'],
                [sequelize.col('Contract.Client.id'), 'DESC']
            ],
            limit,
            raw: true,
        }
    )

    const response = bestPayingClients.map(
        c => ({
            paid: c.paid,
            ClientId: c['Contract.Client.id'],
            fullName: c['Contract.Client.firstName'] + ' ' + c['Contract.Client.lastName']
        })
    )

    res.json(response)
}))

app.post('/jobs/:id/pay', getProfile, asyncHandler(async (req, res) => {
    const { Job, Contract, Profile } = req.app.get('models')
    const userId = req.profile.id
    const jobId = parseInt(req.params.id)

    if (!isFinite(jobId)) {
        throw new UserError('Missing JobId')
    }

    const job = await Job.findOne(
        {
            attributes: [
                'paid',
                'price',
                'id',
            ],
            where: {
                id: jobId
            },
            include: {
                model: Contract,
                attributes: [
                    'ContractorId',
                    'ClientId',
                ],
                include: [
                    {
                        model: Profile,
                        as: 'Contractor',
                        attributes: [
                            'id',
                            'balance'
                        ]
                    },
                    {
                        model: Profile,
                        as: 'Client',
                        attributes: [
                            'id',
                            'balance'
                        ]
                    }
                ]
            }
        }
    )

    if (!job) {
        throw new UserError('Job with id ' + jobId + ' not found', 404)
    }

    const contractor = job.Contract.Contractor
    const client = job.Contract.Client
    const price = job.price

    if (contractor.id != userId) {
        throw new ForbiddenError('User forbidden to access job with id ' + jobId)
    }

    if (job.paid == true) {
        throw new UserError('Job already paid for')
    }

    if (price > contractor.balance) {
        throw new UserError('Insufficient funds to pay for job')
    }

    // If any of these steps fails we want to rollback everything
    // so wrap it in a transaction
    await sequelize.transaction(async (t) => {
        await Promise.all(
            [
                job.update(
                    {
                        paid: true,
                        paymentDate: new Date(),
                    },
                    {
                        transaction: t
                    }
                ),
                contractor.update(
                    {
                        balance: contractor.balance + price
                    },
                    {
                        transaction: t
                    }
                ),
                client.update(
                    {
                        balance: client.balance - price
                    },
                    {
                        transaction: t
                    }
                )
            ]
        )
    });

    res.sendStatus(200)
}))

app.post('/balances/deposit/:userId', getProfile, asyncHandler(async (req, res) => {
    const { Profile } = req.app.get('models')
    const userId = req.profile.id
    const amount = req.body.amount

    if (userId != req.params.userId) {
        throw new ForbiddenError('User can only deposit in his own balance')
    }

    if (!amount || typeof amount !== 'number') {
        throw new UserError('Missing amount')
    }

    const sumPaymentsDue = await Job.findOne(
        {
            attributes: [
                [sequelize.fn('sum', sequelize.col('price')), 'sum'],
            ],
            where: {
                paid: null,
            },
            include: {
                model: Contract,
                attributes: [],
                where: {
                    ClientId: userId
                },
            },
            raw: true
        }
    )

    if (amount > 0.25 * sumPaymentsDue.sum) {
        throw new UserError('User can\'t deposit more than 25% his total of jobs to pay')
    }

    await Profile.update(
        {
            balance: req.profile.balance + amount
        },
        {
            where: {
                id: userId
            }
        }
    );

    res.sendStatus(200)
}))

app.use((err, req, res, next) => {
    // If it's an expected error, just send the message and end
    if (err instanceof UserError || err instanceof ForbiddenError) {
        res.status(err.status).json({ error: err.message })
        next()
        return
    }

    //  If internal server error, log it to console and send message
    console.error("ERROR: ", err.message, err.stack)
    res.status(500).json({ error: err.message })
})

module.exports = app;
