const app = require('./app');
const { sequelize } = require('./model')
const config = require('../config/config.js');

const PORT = config.get('port')

init();

async function init() {
  await sequelize.authenticate().catch(error => {
    console.error('Unable to connect to the database:', error)
    process.exit(1)
  });

  console.log(`Connected to DB at ${sequelize.options.host}:${sequelize.options.port ?? ''}`);

  try {
    app.listen(
      PORT,
      () => {
        console.log(`Express App Listening on Port ${PORT}`);
      }
    );
  } catch (error) {
    console.error(`An error occurred: ${JSON.stringify(error)}`);
    process.exit(1);
  }
}
