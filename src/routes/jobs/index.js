const express = require('express');
const asyncHandler = require('express-async-handler')
const { Op } = require('sequelize')
const { param, body } = require('express-validator');
const { sequelize, Job, Contract, Profile } = require('../../model')
const { UserError, ForbiddenError, validationErrorHandler } = require('../../errors')

const router = express.Router()

router.get(
    '/unpaid',
    asyncHandler(async (req, res) => {
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
                        status: 'in_progress',
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

router.post(
    '/:id/pay',
    param('id').isInt({ min: 0 }).toInt(),
    validationErrorHandler,
    asyncHandler(async (req, res) => {
        const userId = req.profile.id
        const { id: jobId } = req.params

        const job = await Job.findOne(
            {
                attributes: [
                    'paid',
                    'price',
                    'id',
                    'version',
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

        if (client.id != userId) {
            throw new ForbiddenError('User forbidden to access job with id ' + jobId)
        }

        if (job.paid == true) {
            throw new UserError('Job already paid for')
        }

        if (price > client.balance) {
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

module.exports = router