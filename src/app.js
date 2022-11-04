const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler')
const { sequelize, Profile } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const app = express();

app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

const { Op } = require('sequelize')

class UserError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.status = status
    }
}

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, asyncHandler(async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params

    const contract = await Contract.findOne({ where: { id } })

    if (!contract) return res.status(404).end()

    if (!(req.profile.id == contract.ClientId || req.profile.id == contract.ContractorId)) {
        return res.status(401).end()
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

    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (start && !dateRegex.test(start)) {
        throw new UserError('Start is not a valid date')
    }
    if (end && !dateRegex.test(end)) {
        throw new UserError('End is not a valid date')
    }

    // Using sequelize would be safer, but I am not familiar with it
    // enough to do this complex query,
    // so I'll stick to raw sql

    const bestPayingProfession = await sequelize.query(`
        SELECT SUM(price) as sum, profession from Jobs
        INNER JOIN Contracts ON Contracts.id = Jobs.ContractId
        INNER JOIN Profiles ON Profiles.id = Contracts.ContractorId
        WHERE paid = 1 
        ${start && `AND paymentDate >= '${start}'`} 
        ${end && `AND paymentDate < '${end}'`}
        GROUP BY profession
        ORDER BY SUM(price) DESC
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
    const limit = parseInt(req.query.limit) ?? 2

    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (start && !dateRegex.test(start)) {
        throw new UserError('Start is not a valid date')
    }
    if (end && !dateRegex.test(end)) {
        throw new UserError('End is not a valid date')
    }

    const [bestPayingClients] = await sequelize.query(`
        SELECT SUM(price) as sum, ClientId, firstName, lastName from Jobs
        INNER JOIN Contracts ON Contracts.id = Jobs.ContractId
        INNER JOIN Profiles ON Profiles.id = Contracts.ClientId
        WHERE paid = 1 
        ${start && `AND paymentDate >= '${start}'`} 
        ${end && `AND paymentDate < '${end}'`}
        GROUP BY ClientId
        ORDER BY SUM(price) DESC
        LIMIT ${limit}
    `,
        {
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
        throw new UserError('Job with id ' + jobId + ' not found')
    }

    const contractor = jobContractorAndClient.Contract.Contractor
    const client = jobContractorAndClient.Contract.Client
    const price = jobContractorAndClient.price

    if (contractor.id != userId) {
        throw new UserError('Unauthorized to access job with id', 403)
    }

    if (jobContractorAndClient.paid == true) {
        throw new UserError('Job already paid for')
    }

    if (price > contractor.balance) {
        throw new UserError('Insufficient funds to pay for job')
    }

    await Job.update(
        {
            paid: 1,
            paymentDate: new Date()
        },
        {
            where: {
                id: jobId
            }
        });

    await Profile.update({ balance: contractor.balance + price }, {
        where: {
            id: contractor.id
        }
    });

    await Profile.update({ balance: client.balance - price }, {
        where: {
            id: client.id
        }
    });

    res.sendStatus(200)
}))


app.post('/balances/deposit/:userId', getProfile, asyncHandler(async (req, res) => {
    const { Job, Contract, Profile } = req.app.get('models')
    const userId = req.profile.id
    const amount = req.body.amount

    if (userId != req.params.userId) {
        throw new UserError('Unauthorized', 403)
    }

    if (!amount || typeof amount !== 'number') {
        throw new UserError('Missing amount')
    }

    const sumPaymentsDue = await sequelize.query(`
        SELECT SUM(price) as sum FROM Profiles 
        INNER JOIN Contracts ON Contracts.ClientId = Profiles.id
        INNER JOIN Jobs ON Contracts.id = Jobs.ContractId
        WHERE Profiles.id = ${userId}
        AND paid is null
    `,
        {
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

app.use((err, req, res, next) => {
    console.error(err.message)
    res.status(err.status).json({ error: err.message }).end()
})

module.exports = app;
