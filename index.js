require('dotenv').config()

const PORT = process.env.PORT

const express = require('express')
const app = express()

const bodyParser = require('body-parser')
const cors = require('cors')
const flash = require('express-flash')
const session = require('express-session')
const path = require('path')
const moment = require('moment')
const bcrypt = require('bcrypt')
const swaggerUi = require('swagger-ui-express')
const swaggerDoc = require('./swaggerdoc.json')

const Sequelize = require('./Database/sequelize_connection')

const jwt = require('jsonwebtoken')
const jwtverify = require('./middleware/jwt')

const knex = require('./Database/connection')

app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }
}))

app.use(flash())

app.use(bodyParser.urlencoded())
app.use(bodyParser.json())

app.use(cors())

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc))

// Rota onde será realizado o login do usuário
app.post('/login', async (req, res) => {
    var { email, senha } = req.body

    var users = await knex('tb_users').select().where({ email: email}).andWhere({password: senha})

    // Verificação se o usuário existe
    if (users[0] == undefined){
        return res.status(404).json({msg: "User Not Found"})
    }

    // Criação do Token de Acesso
    const token = jwt.sign(
        {
            email: users[0].email,
            username: users[0].username,
        },
        process.env.SECRET,
        {
            expiresIn: '300s'
        }
    )
    
    // Será devolvido ao usuário uma mensagem de sucesso e o token na qual será necessário para o acesso às rotas de gerenciamento
    res.status(201).json({result: "Sucess", access_token: token})
})

// Rota que lista todos os produtos
app.get('/list-produtos', async(req, res) => {
    await Sequelize.query(`
        SELECT * FROM tb_produtos
    `).then(result => {
        res.json({
            produtos: result[0]
        })
    })
    .catch(e => {
        res.json({msg: 'Erro no servidor', error: e})
    })
})

// Rota de Adicionar Produto
app.post('/adiciona-produto', jwtverify, async (req, res) => {
    var {nomeProduto, preco, qntEstoque} = req.body

    // Verifica se já existe algum produto com o nome fornecido
    var nomeProdutoExist = await Sequelize.query(`SELECT * FROM tb_produtos WHERE nome_produto = '${nomeProduto}'`)

    // Caso o produto já exista, ele realiza a atualização da quantidade do produto por questão de segurança.
    if(nomeProdutoExist[0][0] != undefined){
        return res.status(201).json({msg: "Impossível adicionar um produto já existente!"})
    }else{
        await Sequelize.query(`INSERT INTO tb_produtos VALUES ('${nomeProduto}', ${preco}, ${qntEstoque}, default)`)
        .then(() => {
            res.status(201).json({msg: "Produto Inserido com Sucesso!"})
        })
        .catch(e => {
            res.status(400).json({msg: "Erro em inserir o Produto. Tente Novamente!", error: e})
        })
    }
})

// Rota de Remover Produto
app.delete('/remove-produto', jwtverify, async (req, res) => {
    var { nomeProduto } = req.body
    
    console.log(nomeProduto)

    // Verificação se o produto existe
    var exist = await knex("tb_produtos").select().where({nome_produto: nomeProduto})

    console.log(exist)

    if(exist[0] == undefined){
        return res.status(404).json({msg: "Produto não Encontrado!"})
    }

    await Sequelize.query(`DELETE FROM tb_produtos WHERE nome_produto = '${nomeProduto}'`).then(() => res.json({msg: "Produto Deletado."})).catch(e => res.json({msg: "Erro ao Deletar Produto", error: e}))
})

// Rota que atualiza o produto
app.put('/atualiza-produto', jwtverify, async (req, res) => {
    var nomeProduto = req.query
    var { new_nomeProduto, new_preco, new_qntEstoq } = req.body

    var exist = await Sequelize.query(`
        SELECT * FROM tb_produtos WHERE nome_produto = '${nomeProduto.nomeProduto}'
    `)

    if(exist[0][0] == undefined){
        res.json({msg: "Produto não encontrado."})
    }

    await Sequelize.query(`
        UPDATE tb_produtos SET nome_produto = '${new_nomeProduto}', preco = ${new_preco}, qnt_estoq = ${new_qntEstoq}
        WHERE nome_produto = '${nomeProduto.nomeProduto}'
    `)
    .then(() => {
        res.json({msg: "Produto atualizado com sucesso!"})
    })
    .catch(e => {
        res.json({msg: "Erro na atualização do Produto!", error: e})
    })
    
})

// Rota que realizar o pedido de um produto
app.post('/pedido', async (req, res) => {
        var { product }  = req.body

        console.log(product)

        if(product == undefined){
            return res.json({msg: "Campos Inválidos ou Vazios"})
        }

        if(product[0] == undefined || product.length == 0){
            return res.json({msg: "Campos Inválidos ou Vazios"})
        }

        // Gerador do código do pedido
        var stringAleatoria = ''
        var caracteres = '0123456789';
        for (var i = 0; i < 20; i++) {
            stringAleatoria += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }

        var today = moment().format()

        for(var i = 0; product.length > i; i++){

            console.log(i)
            console.log(product[i].nomeProduto)

            var exist = await knex('tb_produtos').select().where({ nome_produto: product[i].nomeProduto })
            console.log(exist[0])

            if(exist[0] == undefined){
                return res.status(404).json({msg: 'Produto não encontrado para realização do pedido'})
            }
            // Verificação se a quantidade informada pelo cliente é inferior ou igual a quantidade disponível em estoque
            if(exist[0].qnt_estoq < parseInt(product[i].qnt)){
                return res.json({msg: "Produtos insuficientes para a venda.", qnt_disponivel: exist[0].qnt_estoq})
            }else{
                try{
                    await Sequelize.query(`
                        INSERT INTO tb_pedidos VALUES ('#${stringAleatoria}', ${exist[0].id_produto}, ${product[i].qnt}, 'Em Andamento', '${today}')
                    `) 
                }
                catch(e){
                    res.status(400).json({msg: 'Error', error: e})
                }            
            }
        }

        res.status(200).json({msg: 'Pedido realizado com sucesso', num_pedido: '#'+stringAleatoria})
    }
)

// Rota de Listagem dos Pedidos
app.get('/list-pedidos', jwtverify, async (req, res) => {
    
    await Sequelize.query(`
        SELECT n_pedido, status_produto, json_arrayagg(json_object("qnt", qnt, "nome_produto", nome_produto )) as produtos FROM tb_pedidos tpd
        INNER JOIN tb_produtos tp
        ON tpd.id_produto = tp.id_produto
        GROUP BY n_pedido, status_produto;
    `)
    .then(result => {
        res.status(200).json({msg: "Success", product: result[0]})
    })
    .catch(e => {
        res.status(400).json({error: e})
    })
})

// Rota que autoriza ou cancela determinado pedido
app.post('/auth-pedidos', jwtverify, async (req, res) => {
    var { n_pedido, authorized } = req.body
    console.log(req.session.user)
    if(req.session.user != "admin"){
        res.status(400).json({msg: "Não Authorizado"})
    }

    switch (authorized){
        case 0:
            var verify = await Sequelize.query(`
                SELECT status_produto FROM tb_pedidos WHERE n_pedido = '${n_pedido}'
            `)
            if(verify[0][0].status_produto == 'Concluído'){
                return res.json({msg: "Esse produto não pode ser mais alterado"})
            }
            await Sequelize.query(`
                UPDATE tb_pedidos SET status_produto = 'Cancelado' WHERE n_pedido = '${n_pedido}'
            `).then(() => {
                res.status(200).json({msg: "Produto Atualizado"})
            }).catch( e => {
                res.status(400).json({msg: "Erro", error: e})
            })
        break;
        case 1:
            var verify = await Sequelize.query(`
                SELECT * FROM tb_pedidos INNER JOIN tb_produtos
                ON tb_pedidos.id_produto = tb_produtos.id_produto
                WHERE n_pedido = "${n_pedido}";
            `)
            console.log(verify[0][0].qnt)
            console.log(verify[0][0].qnt_estoq)
            if(verify[0][0].status_produto == 'Concluído'){
                return res.json({msg: "Esse produto não pode ser mais alterado"})
            }
            await Sequelize.query(`
                UPDATE tb_pedidos SET status_produto = 'Concluído' WHERE n_pedido = '${n_pedido}'
            `).then(async () => {
                var total = verify[0][0].qnt_estoq - verify[0][0].qnt
                console.log(total)
                await Sequelize.query(`
                    UPDATE tb_produtos SET qnt_estoq = ${total} WHERE id_produto = ${verify[0][0].id_produto}
                `)
                res.status(200).json({msg: "Produto Atualizado"})
            }).catch( e => {
                res.status(400).json({msg: "Erro", error: e})
            })
        break;
        default:
            res.status(400).json({msg: "Authorized Inválido!"}) 
        break
    }
})

// Rota que Gera Relatório dos Produtos com Status Concluído
app.get("/relatorio", async (req, res) => {

    var { init_data, end_data } = req.query

    if( init_data && end_data && init_data < end_data){
        const relatorio = await Sequelize.query(`
            SELECT nome_produto, qnt, preco * qnt as valor_pedido FROM tb_pedidos ped
            INNER JOIN tb_produtos prod
            ON ped.id_produto = prod.id_produto
            WHERE status_produto = 'Concluído' AND datatime >= '${init_data}' AND datatime <= '${end_data}';
        `)
        console.log(relatorio)

        return res.json({data_inicial: init_data, end_data: end_data, relatorio: relatorio[0]})
    }

    const mais_vendidos = await Sequelize.query(`
        SELECT nome_produto, qnt, preco * qnt as valor_pedido FROM tb_pedidos ped
        INNER JOIN tb_produtos prod
        ON ped.id_produto = prod.id_produto
        WHERE status_produto = 'Concluído'
        ORDER BY qnt DESC;
    `)
    console.log(mais_vendidos)

    var total_vendido = await Sequelize.query(`
        SELECT SUM(qnt * preco) as total FROM tb_pedidos ped
        INNER JOIN tb_produtos prod
        ON ped.id_produto = prod.id_produto
        WHERE status_produto = 'Concluído'
        ORDER BY qnt DESC;    
    `)
    
    if(total_vendido[0][0].total == null){
        total_vendido = "0,00"
    }else{
        total_vendido = total_vendido[0][0].total.toString()
        total_vendido = total_vendido.includes('.') ? total_vendido.replace('.', ',') : total_vendido + ',00'
    }

    res.status(200).json({mais_vendidos: mais_vendidos[0], receitaTotal: total_vendido})
})

app.use(function (req, res, next) {
    res.status(404).send("Acesse a rota /api-docs para ter acesso à documentação dessa API.")
})

// Linha de código que faz o servidor rodar em determinada porta
app.listen(PORT, () => {
    console.log('Servidor rodando na porta: ' + PORT)
})