const express = require('express');
const bodyParser = require('body-parser');
const { sequelize, Profile } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

const { Op } = require('sequelize')

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params

    const contract = await Contract.findOne({ where: { id } })

    if (!contract) return res.status(404).end()

    if (!(req.profile.id == contract.ClientId || req.profile.id == contract.ContractorId)) {
        return res.status(401).end()
    }

    res.json(contract)
})

app.get('/contracts', getProfile, async (req, res) => {
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
})

app.get('/jobs/unpaid', getProfile, async (req, res) => {
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
})

app.get('/admin/best-profession', async (req, res) => {
    const { start, end } = req.query

    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (start && !dateRegex.test(start)) {
        res.sendStatus(400).end()
        throw new Error('Start is not a valid date')
    }
    if (end && !dateRegex.test(end)) {
        res.sendStatus(400).end()
        throw new Error('End is not a valid date')
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
})

app.get('/admin/best-clients', async (req, res) => {
    const { start, end } = req.query
    const limit = parseInt(req.query.limit) ?? 2

    const dateRegex = /^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/
    if (start && !dateRegex.test(start)) {
        res.sendStatus(400).end()
        throw new Error('Start is not a valid date')
    }
    if (end && !dateRegex.test(end)) {
        res.sendStatus(400).end()
        throw new Error('End is not a valid date')
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
})

module.exports = app;
