const Sequelize = require('sequelize');

const sequelize = new Sequelize(
  'postgres://postgres:mysecretpassword@localhost:5432/deel',
  {
    logging: false // This quickly gets annoying
  }
);

class Profile extends Sequelize.Model { }
Profile.init(
  {
    firstName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    lastName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    profession: {
      type: Sequelize.STRING,
      allowNull: false
    },
    balance: {
      type: Sequelize.DECIMAL(12, 2),
      get(f) {
        const v = this.getDataValue(f)
        return v && Number(v)
      }
    },
    type: {
      type: Sequelize.ENUM('client', 'contractor')
    }
  },
  {
    sequelize,
    modelName: 'Profile'
  }
);

class Contract extends Sequelize.Model { }
Contract.init(
  {
    terms: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM('new', 'in_progress', 'terminated')
    }
  },
  {
    sequelize,
    modelName: 'Contract'
  }
);

class Job extends Sequelize.Model { }
Job.init(
  {
    description: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    price: {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      get(f) {
        const v = this.getDataValue(f)
        return v && Number(v)
      }
    },
    paid: {
      type: Sequelize.BOOLEAN,
      default: false
    },
    paymentDate: {
      type: Sequelize.DATE
    }
  },
  {
    sequelize,
    modelName: 'Job',
    version: true
  }
);

Profile.hasMany(Contract, { as: 'Contractor', foreignKey: 'ContractorId', })
Contract.belongsTo(Profile, { as: 'Contractor' })
Profile.hasMany(Contract, { as: 'Client', foreignKey: 'ClientId' })
Contract.belongsTo(Profile, { as: 'Client' })
Contract.hasMany(Job,)
Job.belongsTo(Contract,)

module.exports = {
  sequelize,
  Profile,
  Contract,
  Job
};
