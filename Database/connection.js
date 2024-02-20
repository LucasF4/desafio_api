
// Arquivo de Configuração do banco de dados

const knex = require('knex')({
    client: 'mysql2',
    connection: {
        database: 'teste',
        user: process.env.USER,
        password: process.env.PASS,
    },
    pool: {
        min: 2,
        max: 10
    }
    /* migrations: {
        directory: __dirname + "/db/migrations"
    },
    seeds: {
        directory: __dirname + "/db/seeds"
    } */
})

module.exports = knex