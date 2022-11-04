const request = require('supertest');
const app = require('./src/app')
const { seed } = require('./scripts/seedDb')

beforeAll(async () => {
    await seed()
})

afterAll(async () => {
    await seed()
})

it('Gets contracts per id when user owns it', async () => {
    const res = await request(app)
        .get('/contracts/1')
        .set('profile_id', 1)
        .expect(200)

    expect(res.body).toMatchObject(
        {
            id: 1,
            terms: 'bla bla bla',
            status: 'terminated',
            ContractorId: 5,
            ClientId: 1
        }
    )
});

it('Throws 403 in Get contracts per id when user does not own it', async () => {
    return request(app)
        .get('/contracts/1')
        .set('profile_id', 3)
        .expect(403)
});

it('Gets contracts', async () => {
    const res = await request(app)
        .get('/contracts')
        .set('profile_id', 1)
        .expect(200)

    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
        id: 2,
        terms: 'bla bla bla',
        status: 'in_progress',
        ContractorId: 6,
        ClientId: 1
    })
});

it('Gets unpaid jobs', async () => {
    const res = await request(app)
        .get('/jobs/unpaid')
        .set('profile_id', 1)
        .expect(200)

    expect(res.body[0].id).toEqual(1)
    expect(res.body[1].id).toEqual(2)
});

it('Gets best profession', async () => {
    return request(app)
        .get('/admin/best-profession?start=2020-08-15&end=2020-08-16')
        .expect(200)
        .expect({
            sum: 2362,
            profession: "Programmer",
        })
});

it('Gets best clients', async () => {
    return request(app)
        .get('/admin/best-clients?start=2020-08-15&end=2020-08-16&limit=5')
        .expect(200)
        .expect([
            {
                sum: 2020,
                ClientId: 4,
                firstName: "Ash",
                lastName: "Kethcum",
            },
            {
                sum: 221,
                ClientId: 1,
                firstName: "Harry",
                lastName: "Potter",
            },
            {
                sum: 121,
                ClientId: 2,
                firstName: "Mr",
                lastName: "Robot",
            },
        ])
});

describe('Pay for a job', () => {
    beforeEach(async () => await seed())

    it('Fails if job not found', async () => {
        await request(app)
            .post('/jobs/60/pay')
            .set('profile_id', 7)
            .expect(400)
    })

    it('Fails if job already paid', async () => {
        await request(app)
            .post('/jobs/6/pay')
            .set('profile_id', 7)
            .expect(400)
    })

    it('Fails if clients\' balance < the amount to pay', async () => {
        return request(app)
            .post('/jobs/6/pay')
            .set('profile_id', 6)
            .expect(403)
    })

    it('Sets job to paid and moves money from the clients\'s balance to the contractor\'s balance', async () => {
        const { Job, Contract, Profile } = app.get('models')

        await request(app)
            .post('/jobs/2/pay')
            .set('profile_id', 6)
            .expect(200)

        const jobId = 2
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

        expect(jobContractorAndClient.paid).toEqual(true)
        expect(jobContractorAndClient.paymentDate).toBeDefined()
        expect(jobContractorAndClient.Contract.Client.balance).toEqual(1150 - 201)
        expect(jobContractorAndClient.Contract.Contractor.balance).toEqual(1214 + 201)
    })
})

describe('Deposit to balance', () => {
    beforeEach(async () => await seed())

    it('Fails if user is not self', async () => {
        await request(app)
            .post('/balances/deposit/6')
            .set('profile_id', 10)
            .expect(401)
    })

    it('Fails if deposit > 25% payments due', async () => {
        await request(app)
            .post('/balances/deposit/2')
            .set('profile_id', 2)
            .send({ amount: 100000 })
            .expect(400)
    })

    it('Deposits and adds to balance', async () => {
        const { Profile } = app.get('models')

        await request(app)
            .post('/balances/deposit/2')
            .set('profile_id', 2)
            .send({ amount: 50 })
            .expect(200)

        const user = await Profile.findOne(
            {
                where: {
                    id: 2
                }
            }
        )

        expect(Math.floor(user.balance)).toBe(231 + 50)
    })
})