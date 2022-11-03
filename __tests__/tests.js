const request = require('supertest');
const app = require('../src/app')

it('Gets contracts per id', async () => {
    const res = await request(app)
        .get('/contracts/1')
        .expect(200)

    console.log(res.body)
});