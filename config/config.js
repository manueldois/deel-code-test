const convict = require('convict');
const fs = require('fs');
const path = require('path');

const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT',
    arg: 'port'
  },
  db: {
    host: {
      doc: 'Database host name/IP',
      format: String,
      default: null,
      env: 'DB_HOST',
      nullable: false,
    },
    port: {
      doc: 'Database port',
      format: 'port',
      default: null,
      env: 'DB_PORT',
    },
    name: {
      doc: 'Database name',
      format: String,
      default: 'deel',
      env: 'DB_NAME',
    },
    username: {
      doc: 'Database username',
      format: String,
      default: null,
      env: 'DB_USERNAME',
      nullable: false,
    },
    password: {
      doc: 'Database password',
      format: String,
      default: null,
      env: 'DB_PASSWORD',
      nullable: false,
    },
    dialect: {
      doc: 'Database dialect',
      format: String,
      default: 'postgres',
      env: 'DB_DIALECT',
    },
    logging: {
      doc: 'Database logging',
      format: Boolean,
      default: true,
      env: 'DB_LOGGING',
    }
  },
});

const env = config.get('env');

function loadConfigAndSecret(envName) {
  const fileName = envName + '.json'

  config.loadFile(path.join('./config', fileName));

  const secretFileName = path.join('./config/secrets', fileName)

  try {
    fs.accessSync(secretFileName, fs.F_OK)
  } catch (error) {
    console.error(`Missing secret config at ${secretFileName}. Loading from env/args`)
    return
  }
  
  config.loadFile(secretFileName);
}

loadConfigAndSecret(env)

// Perform validation
config.validate({ allowed: 'strict' });

module.exports = config;