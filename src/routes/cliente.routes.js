const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Cliente = require('../models/cliente');
const SalaoCliente = require('../models/relationship/salaoCliente');
const moment = require('moment');
// const pagarme = require('../services/pagarme');

router.post('/', async (req, res) => {
  const db = mongoose.connection;
  const session = await db.startSession();
  session.startTransaction();

  try {
    const {
      cliente,
      salaoId
    } = req.body;
    let newClient = null;

    const existentClient = await Cliente.findOne({
      $or: [{
          email: cliente.email
        },
        {
          telefone: cliente.telefone
        },
        //{ cpf: cliente.cpf },
      ],
    });

    if (!existentClient) {
      const _id = mongoose.Types.ObjectId();
      const cliente = req.body.cliente;

      newClient = await new Cliente({
        _id,
        ...cliente,
      }).save({
        session
      });
    }

    const clienteId = existentClient ? existentClient._id : newClient._id;

    const existentRelationship = await SalaoCliente.findOne({
      salaoId,
      clienteId,
    });

    if (!existentRelationship) {
      await new SalaoCliente({
        salaoId,
        clienteId,
      }).save({
        session
      });
    }

    if (existentRelationship && existentRelationship.status === 'I') {
      await SalaoCliente.findOneAndUpdate({
        salaoId,
        clienteId,
      }, {
        status: 'A'
      }, {
        session
      });
    }

    await session.commitTransaction();
    session.endSession();

    if (
      existentRelationship &&
      existentRelationship.status === 'A' &&
      existentClient
    ) {
      res.json({
        error: true,
        message: 'Cliente já cadastrado!'
      });
    } else {
      res.json({
        error: false,
        message: 'Cliente cadastrado com sucesso!',
        clienteId
      });
    }
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.post('/filter', async (req, res) => {
  try {
    const clientes = await Cliente.find(req.body.filters);
    res.json({
      error: false,
      clientes
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.get('/salao/:salaoId', async (req, res) => {
  try {
    const clientes = await SalaoCliente.find({
        salaoId: req.params.salaoId,
        status: 'A',
      })
      .populate('clienteId')
      .select('clienteId');

    res.json({
      error: false,
      clientes: clientes.map((c) => ({
        ...c.clienteId._doc,
        vinculoId: c._id,
        dataCadastro: moment(c.dataCadastro).format('DD/MM/YYYY'),
      })),
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.delete('/vinculo/:id', async (req, res) => {
  try {
    await SalaoCliente.findByIdAndUpdate(req.params.id, {
      status: 'I'
    });
    res.json({
      error: false,
      message: 'Cliente deletado com sucesso!'
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

// Rota para atualizar um cliente
router.put('/:id', async (req, res) => {
  const db = mongoose.connection;
  const session = await db.startSession();
  session.startTransaction();

  try {
    const {
      id
    } = req.params; // Obtém o ID do cliente a ser atualizado
    const {
      cliente
    } = req.body; // Obtém os dados do cliente do corpo da requisição

    // Verifica se o cliente existe
    const existentClient = await Cliente.findById(id);
    if (!existentClient) {
      return res.status(404).json({
        error: true,
        message: 'Cliente não encontrado!'
      });
    }

    // Atualiza os dados do cliente
    await Cliente.findByIdAndUpdate(id, cliente, {
      session,
      new: true
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      error: false,
      message: 'Cliente atualizado com sucesso!'
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.json({
      error: true,
      message: err.message
    });
  }
});


module.exports = router;