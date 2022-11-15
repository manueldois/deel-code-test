const express = require('express');
const asyncHandler = require('express-async-handler')
const { param, body } = require('express-validator');
const { sequelize, Job, Contract, Profile } = require('../../model')
const { ForbiddenError, UserError, validationErrorHandler } = require('../../errors')

const router = express.Router()

router.post(
    '/deposit/:userId',
    param('userId')
        .custom((userId, { req }) => userId == req.profile.id)
        .withMessage({
            message: 'User can only deposit in his own balance',
            errorCode: 403,
        }),
    body('amount').isFloat({ min: 0 }),
    validationErrorHandler,
    asyncHandler(async (req, res) => {
        const userId = req.profile.id
        const amount = req.body.amount

        const sumPaymentsDue = await Job.findOne(
            {
                attributes: [
                    [sequelize.cast(sequelize.fn('sum', sequelize.col('price')), 'float'), 'sum'],
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

module.exports = router