const express = require('express');
const asyncHandler = require('express-async-handler')
const { Op } = require('sequelize')
const { Contract } = require('../../model')
const { getProfile } = require('../../middleware/getProfile')
const { ForbiddenError } = require('../../errors')

const router = express.Router()

router.get('/:id', getProfile, asyncHandler(async (req, res) => {
    const { id } = req.params

    const contract = await Contract.findOne({ where: { id } })

    if (!contract) {
        // throw new UserError('Contract not found', 404)
        throw new Error()
    }

    if (!(req.profile.id == contract.ClientId || req.profile.id == contract.ContractorId)) {
        throw new ForbiddenError('User can\'t access this contract')
    }

    res.json(contract)
}))

router.get('', getProfile, asyncHandler(async (req, res) => {
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

module.exports = router