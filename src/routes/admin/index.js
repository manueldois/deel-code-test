const express = require('express');
const asyncHandler = require('express-async-handler')
const { Op } = require('sequelize')
const { query } = require('express-validator');
const { sequelize, Job, Contract, Profile } = require('../../model')
const { validationErrorHandler } = require('../../errors')

const router = express.Router()

const validateStartEndDates = [
    query('start').isDate().optional().toDate(),
    query('end').isDate().optional().toDate().custom((end, { req }) => {
        const start = req.query.start

        if (end < start) {
            throw new Error('End must be after start');
        }

        return true;
    }),
]

router.get(
    '/best-profession',
    validateStartEndDates,
    validationErrorHandler,
    asyncHandler(async (req, res) => {
        const { start, end } = req.query

        // When passed '2020-08-15', sequelize was converting it to '2020-08-14 23:00:00.000 +00:00'
        // No idea why. Let's set time to 00:00:00Z
        const where = {
            paid: true
        }

        if (start || end) {
            where.paymentDate = {}

            if (start) {
                where.paymentDate[Op.gte] = start.toISOString()
            }

            if (end) {
                where.paymentDate[Op.lt] = end.toISOString()
            }
        }

        const bestPayingProfession = await Job.findAll(
            {
                attributes: [
                    [sequelize.cast(sequelize.fn('sum', sequelize.col('price')), 'float'), 'sum'],
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

router.get(
    '/best-clients',
    validateStartEndDates,
    query('limit').default(2).isInt({ min: 1 }).toInt(),
    validationErrorHandler,
    asyncHandler(async (req, res) => {
        const { start, end, limit } = req.query

        const where = {
            paid: true
        }

        if (start || end) {
            where.paymentDate = {}

            if (start) {
                where.paymentDate[Op.gte] = start.toISOString()
            }

            if (end) {
                where.paymentDate[Op.lt] = end.toISOString()
            }
        }

        const bestPayingClients = await Job.findAll(
            {
                attributes: [
                    [sequelize.cast(sequelize.fn('sum', sequelize.col('price')), 'float'), 'paid'],
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

module.exports = router