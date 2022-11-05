const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler')
const { Op } = require('sequelize')
const { sequelize } = require('./model')
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

    if (start && !isValidDate(start)) {
        throw new UserError('Start is not a valid date')
    }
    if (end && !isValidDate(end)) {
        throw new UserError('End is not a valid date')
    }

    // Using sequelize would be safer, but I am not familiar with it
    // enough to do this complex query,
    // so I'll stick to raw sql

    const bestPayingProfession = await sequelize.query(`
        SELECT SUM(price) as sum, profession 
        FROM Jobs
        INNER JOIN Contracts ON Contracts.id = Jobs.ContractId
        INNER JOIN Profiles ON Profiles.id = Contracts.ContractorId
        WHERE paid = 1 
        ${start ? `AND paymentDate >= '${start}'` : ''} 
        ${end ? `AND paymentDate < '${end}'` : ''}
        GROUP BY profession
        ORDER BY SUM(price) DESC, ContractorId DESC
        LIMIT 1
    `,
        {
            raw: true,
            plain: true
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

    const [bestPayingClients] = await sequelize.query(`
        SELECT SUM(price) as paid, ClientId, firstName || ' ' || lastName as fullName
        FROM Jobs
        INNER JOIN Contracts ON Contracts.id = Jobs.ContractId
        INNER JOIN Profiles ON Profiles.id = Contracts.ClientId
        WHERE paid = 1 
        ${start ? `AND paymentDate >= '${start}'` : ''} 
        ${end ? `AND paymentDate < '${end}'` : ''}
        GROUP BY ClientId
        ORDER BY SUM(price) DESC, ClientId DESC
        LIMIT ?
    `,
        {
            replacements: [limit],
            raw: true,
        }
    )

    res.json(bestPayingClients)
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
        await Job.update(
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
        );

        await Profile.update(
            {
                balance: contractor.balance + price
            },
            {
                where: {
                    id: contractor.id
                },
                transaction: t
            }
        );

        await Profile.update(
            {
                balance: client.balance - price
            },
            {
                where: {
                    id: client.id
                },
                transaction: t
            }
        );
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
