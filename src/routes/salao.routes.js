const express = require('express');
const router = express.Router();
const Salao = require('../models/salao');
const Servico = require('../models/servico');
const Horario = require('../models/horario');
const turf = require('turf');
const util = require('../util');
const { select } = require('underscore');

// Criar um novo salão
router.post('/', async (req, res) => {
  const higienizarNome = (nome) => {
    return nome
      .trim() // Remove espaços em branco do início e do fim
      .replace(/\s+/g, '-') // Substitui múltiplos espaços por um único hífen
      .toLowerCase(); // Converte tudo para minúsculas
  };

  // Higieniza o nome antes de salvar
  req.body.nome = higienizarNome(req.body.nome);

  try {
    const salao = await new Salao(req.body).save();
    res.json({
      salao
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});


// Listar todos os salões
router.get('/saloes', async (res) => {
  try {
    const saloes = await Salao.find();
    res.json({
      error: false,
      saloes
    });
  } catch (error) {
    res.json({
      error: true,
      message: error.message
    });
  }
});

// Listar serviços de um salão
router.get('/servicos/:salaoId', async (req, res) => {
  try {
    const {
      salaoId
    } = req.params;
    const servicos = await Servico.find({
      salaoId,
      status: 'A',
    }).select('_id titulo');

    res.json({
      error: false,
      servicos: servicos.map((s) => ({
        label: s.titulo,
        value: s._id
      })),
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

// Filtrar salão por ID e calcular distância
router.post('/filter/:id', async (req, res) => {
  try {
    const salao = await Salao.findById(req.params.id).select(req.body.fields);

    if (!salao || !salao.geo || !salao.geo.coordinates) {
      return res.json({
        error: true,
        message: 'Salão não encontrado ou dados de geolocalização não disponíveis.'
      });
    }

    const distance = turf
      .distance(
        turf.point(salao.geo.coordinates),
        turf.point([-30.043858, -51.103487])
      )
      .toFixed(2);

    const horarios = await Horario.find({
      salaoId: req.params.id,
    }).select('dias inicio fim');

    const isOpened = await util.isOpened(horarios);

    res.json({
      error: false,
      salao: {
        ...salao._doc,
        distance,
        isOpened
      }
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.post('/filter/nome/:nome', async (req, res) => {
  try {
    const salao = await Salao.findOne({
      nome: req.params.nome
    });
    if (!req.body.coordinates || !Array.isArray(req.body.coordinates) || req.body.coordinates.length < 2) {
      return res.json({
        error: true,
        message: 'Coordenadas inválidas. Certifique-se de enviar um array com latitude e longitude.'
      });
    }

    let lat = req.body.coordinates[0];
    let long = req.body.coordinates[1];


    if (!salao || !salao.geo || !salao.geo.coordinates) {
      return res.json({
        error: true,
        message: 'Salão não encontrado ou dados de geolocalização não disponíveis.'
      });
    }

    const distance = turf.distance(
      turf.point(salao.geo.coordinates),
      turf.point([lat, long])
    ).toFixed(2);

    const horarios = await Horario.find({
      salaoId: salao._id, // Mudei para buscar pelo ID do salão
    }).select("inicio fim dias");
    
    const isOpened = await util.isOpened(horarios);
    

    res.json({
      error: false,
      salao: {
        ...salao._doc,
        distance,
        isOpened
      }
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});


module.exports = router;