const request = require('supertest');
const app = require('./src/app')

it('Gets contracts per id when user owns it', async () => {
    return request(app)
        .get('/contracts/1')
        .set('profile_id', 1)
        .expect(200)
        .expect({
            id: 1,
            terms: 'bla bla bla',
            status: 'terminated',
            createdAt: '2022-11-03T12:15:55.730Z',
            updatedAt: '2022-11-03T12:15:55.730Z',
            ContractorId: 5,
            ClientId: 1
        })
});

it('Throws 401 in Get contracts per id when user does not own it', async () => {
    return request(app)
        .get('/contracts/1')
        .set('profile_id', 3)
        .expect(401)
});

it('Gets contracts', async () => {
    return request(app)
        .get('/contracts')
        .set('profile_id', 1)
        .expect(200)
        .expect([{
            id: 2,
            terms: 'bla bla bla',
            status: 'in_progress',
            createdAt: '2022-11-03T12:15:55.730Z',
            updatedAt: '2022-11-03T12:15:55.730Z',
            ContractorId: 6,
            ClientId: 1
        }])
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