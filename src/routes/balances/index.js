const express = require('express');
const asyncHandler = require('express-async-handler')
const { sequelize, Job, Contract, Profile } = require('../../model')
const { ForbiddenError, UserError } = require('../../errors')

const router = express.Router()

router.post('/deposit/:userId', asyncHandler(async (req, res) => {
    const userId = req.profile.id
    const amount = req.body.amount

    if (userId != req.params.userId) {
        throw new ForbiddenError('User can only deposit in his own balance')
    }

    if (!amount || typeof amount !== 'number') {
        throw new UserError('Missing amount')
    }

    if (amount <= 0) {
        throw new UserError('Amount must be positive')
    }

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