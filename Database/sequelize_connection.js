const Sequelize = require('sequelize')

const sequelize = new Sequelize('teste', process.env.USER, process.env.PASS, {
    dialect: 'mysql',
    host: 'localhost'
})

module.exports = sequelize