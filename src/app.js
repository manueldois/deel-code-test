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
                }
            },
            include: {
                model: Contract,
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
                attributes: [
                    'ContractorId'
                ],
                include: {
                    model: Profile,
                    as: 'Contractor',
                    attributes: [
                        'profession'
                    ],
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

    const response = {
        sum: bestPayingProfession.sum,
        profession: bestPayingProfession.profession
    }

    res.json(response)
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
                attributes: [
                    'ClientId'
                ],
                include: {
                    model: Profile,
                    as: 'Client',
                    attributes: [
                        'firstName',
                        'lastName'
                    ],
                }
            },
            group: 'Contract.ClientId',
            order: [
                [sequelize.fn('sum', sequelize.col('price')), 'DESC'],
                [sequelize.col('Contract.ClientId'), 'DESC']
            ],
            limit,
            raw: true,
        }
    )

    const response = bestPayingClients.map(
        c => ({
            paid: c.paid,
            ClientId: c['Contract.ClientId'],
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

    const jobContractorAndClient = await Job.findOne(
        {
            where: {
                id: jobId
            },
            include: {
                model: Contract,
                include: [
                    {
                        model: Profile,
                        as: 'Contractor'
                    },
                    {
                        model: Profile,
                        as: 'Client'
                    }
                ]
            }
        }
    )

    if (!jobContractorAndClient) {
        throw new UserError('Job with id ' + jobId + ' not found', 404)
    }

    const contractor = jobContractorAndClient.Contract.Contractor
    const client = jobContractorAndClient.Contract.Client
    const price = jobContractorAndClient.price

    if (contractor.id != userId) {
        throw new ForbiddenError('User forbidden to access job with id ' + jobId)
    }

    if (jobContractorAndClient.paid == true) {
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
                Job.update(
                    {
                        paid: 1,
                        paymentDate: new Date()
                    },
                    {
                        where: {
                            id: jobId
                        },
                        transaction: t
                    }
                ),
                Profile.update(
                    {
                        balance: contractor.balance + price
                    },
                    {
                        where: {
                            id: contractor.id
                        },
                        transaction: t
                    }
                ),
                Profile.update(
                    {
                        balance: client.balance - price
                    },
                    {
                        where: {
                            id: client.id
                        },
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

    const sumPaymentsDue = await sequelize.query(`
        SELECT SUM(price) as sum FROM Profiles 
        INNER JOIN Contracts ON Contracts.ClientId = Profiles.id
        INNER JOIN Jobs ON Contracts.id = Jobs.ContractId
        WHERE Profiles.id = ?
        AND paid IS NULL
    `,
        {
            replacements: [userId],
            raw: true,
            plain: true
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

app.use((err, req, res) => {
    console.error(err.message)
    res.status(err.status).json({ error: err.message }).end()
})

module.exports = app;
