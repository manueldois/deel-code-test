const app = require('./app');
const { sequelize } = require('./model')

const PORT = process.env.PORT || 3001

init();

async function init() {
  await sequelize.authenticate().catch(error => {
    console.error('Unable to connect to the database:', error)
    process.exit(1)
  });

  console.log('Connection to DB has been established successfully.');

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
