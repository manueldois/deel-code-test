const request = require('supertest');
const app = require('./src/app')
const { seed } = require('./scripts/seedDb')

beforeAll(async () => {
    await seed()
})

// afterAll(async () => {
//     await seed()
// })

describe('Get contracts per id', () => {
    it('Fails when contract not found', async () => {
        return request(app)
            .get('/contracts/100')
            .set('profile_id', 1)
            .expect(500)
    });

    it('Fails when user does not own contract', async () => {
        return request(app)
            .get('/contracts/1')
            .set('profile_id', 3)
            .expect(403)
    });

    it('Works', async () => {
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
})

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

    expect(res.body).toMatchObject([{ id: 2 }])
});

describe('Gets best profession', () => {
    it('Works with just start date', async () => {
        return request(app)
            .get('/admin/best-profession?start=2020-08-15')
            .expect(200)
            .expect({
                sum: 2562,
                profession: "Programmer",
            })
    });

    it('Works with just end date', async () => {
        return request(app)
            .get('/admin/best-profession?end=2020-08-12')
            .expect(200)
            .expect({
                sum: 21,
                profession: "Musician",
            })
    });

    it('Works with both start and end date', async () => {
        return request(app)
            .get('/admin/best-profession?start=2020-08-14&end=2020-08-16')
            .expect(200)
            .expect({
                sum: 2483,
                profession: "Programmer",
            })
    });

    it('Works with no dates', async () => {
        return request(app)
            .get('/admin/best-profession')
            .expect(200)
            .expect({
                sum: 2683,
                profession: "Programmer",
            })
    });

    it('Fails with invalid date', async () => {
        await request(app)
            .get('/admin/best-profession?start=2021-20-01')
            .expect(400)

        await request(app)
            .get('/admin/best-profession?start=2021-05-1')
            .expect(400)
    });
})

describe('Gets best clients', () => {
    it('Works with just start date', async () => {
        const res = await request(app)
            .get('/admin/best-clients?start=2020-08-15')
            .expect(200)

        expect(res.body).toContainEqual(
            {
                paid: 2020,
                ClientId: 4,
                fullName: "Ash Kethcum",
            }
        )
        expect(res.body).toContainEqual(
            {
                paid: 421,
                ClientId: 1,
                fullName: "Harry Potter",
            }
        )
    })

    it('Works with just end date', async () => {
        const res = await request(app)
            .get('/admin/best-clients?end=2020-08-15')
            .expect(200)

        expect(res.body).toContainEqual(
            {
                paid: 21,
                ClientId: 1,
                fullName: "Harry Potter",
            }
        )
        expect(res.body).toContainEqual(
            {
                paid: 121,
                ClientId: 2,
                fullName: "Mr Robot",
            }
        )
    })

    it('Works with both start and end dates', async () => {
        const res = await request(app)
            .get('/admin/best-clients?start=2020-08-11&end=2020-08-15')
            .expect(200)

        expect(res.body).toContainEqual(
            {
                paid: 121,
                ClientId: 2,
                fullName: "Mr Robot",
            },
        )
    })

    it('Works with neither start or end dates', async () => {
        const res = await request(app)
            .get('/admin/best-clients')
            .expect(200)

        expect(res.body).toContainEqual(
            {
                paid: 2020,
                ClientId: 4,
                fullName: "Ash Kethcum",
            }
        )
        expect(res.body).toContainEqual(
            {
                paid: 442,
                ClientId: 2,
                fullName: "Mr Robot",
            }
        )
    })

    it('Works with no results found', async () => {
        return request(app)
            .get('/admin/best-clients?start=2020-08-10&end=2020-08-10')
            .expect(200)
            .expect([])
    })

    it('Respects the limit', async () => {
        const res = await request(app)
            .get('/admin/best-clients?limit=3')
            .expect(200)

        expect(res.body).toContainEqual(
            {
                paid: 2020,
                ClientId: 4,
                fullName: "Ash Kethcum",
            }
        )
        expect(res.body).toContainEqual(
            {
                paid: 442,
                ClientId: 2,
                fullName: "Mr Robot",
            }
        )
        expect(res.body).toContainEqual(
            {
                paid: 442,
                ClientId: 1,
                fullName: "Harry Potter",
            }
        )
    })
});

describe('Pay for a job', () => {
    beforeEach(async () => await seed())

    it('Fails if job not found', async () => {
        await request(app)
            .post('/jobs/60/pay')
            .set('profile_id', 7)
            .expect(404)
    })

    it('Fails if user is forbidden', async () => {
        await request(app)
            .post('/jobs/6/pay')
            .set('profile_id', 6)
            .expect(403)
    })

    it('Fails if job already paid', async () => {
        await request(app)
            .post('/jobs/6/pay')
            .set('profile_id', 4)
            .expect(400)
    })

    it('Fails if clients\' balance < the amount to pay', async () => {
        return request(app)
            .post('/jobs/7/pay')
            .set('profile_id', 4)
            .expect(403)
    })

    it('Sets job to paid and moves money from the clients\'s balance to the contractor\'s balance', async () => {
        const { Job, Contract, Profile } = app.get('models')

        await request(app)
            .post('/jobs/2/pay')
            .set('profile_id', 1)
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

    it('No concurrency issues', async () => {
        const req1 = request(app)
            .post('/jobs/2/pay')
            .set('profile_id', 1)
            .expect(200)

        const req2 = request(app)
            .post('/jobs/2/pay')
            .set('profile_id', 1)
            .expect(412)

        const [res1, res2] = await Promise.all([req1, req2])
    })
})

describe('Deposit to balance', () => {
    beforeEach(async () => await seed())

    it('Fails if user is forbidden', async () => {
        await request(app)
            .post('/balances/deposit/6')
            .set('profile_id', 4)
            .send({ amount: 100000 })
            .expect(403)
    })

    it('Fails if missing amount', async () => {
        await request(app)
            .post('/balances/deposit/2')
            .set('profile_id', 2)
            .send({ amount: 'invalid' })
            .expect(400)
    })

    it('Fails if amount is negative', async () => {
        await request(app)
            .post('/balances/deposit/2')
            .set('profile_id', 2)
            .send({ amount: -1 })
            .expect(400)
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