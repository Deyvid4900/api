const express = require('express');
const router = express.Router();
const Salao = require('../models/salao');
const Servico = require('../models/servico');
const Horario = require('../models/horario');
const turf = require('turf');
const util = require('../util');
const {
  select
} = require('underscore');

// Criar um novo salão
router.post('/', async (req, res) => {
  const higienizarNome = (nome) => {
    return nome
      .trim() // Remove espaços em branco do início e do fim
      .replace(/\s+/g, '-') // Substitui múltiplos espaços por um único hífen
      .toLowerCase(); // Converte tudo para minúsculas
  };

  var busboy = new Busboy({
    headers: req.headers
  });

  // Higieniza o nome antes de salvar
  req.body.nome = higienizarNome(req.body.nome);

  busboy.on('finish', async () => {
    try {
      let errors = [];
      let arquivos = {};

      // Upload da capa
      if (req.files && req.files.capa) {
        const file = req.files.capa;
        const nameParts = file.name.split('.');
        const fileName = `${new Date().getTime()}-capa.${nameParts[nameParts.length - 1]}`;
        const path = `saloes/${req.body.nome}/${fileName}`;

        const response = await aws.uploadToS3(file, path);

        if (response.error) {
          errors.push({
            error: true,
            message: response.message
          });
        } else {
          arquivos.capa = path; // Salvando o caminho da capa
        }
      }

      // Upload da foto
      if (req.files && req.files.foto) {
        const file = req.files.foto;
        const nameParts = file.name.split('.');
        const fileName = `${new Date().getTime()}-foto.${nameParts[nameParts.length - 1]}`;
        const path = `saloes/${req.body.nome}/${fileName}`;

        const response = await aws.uploadToS3(file, path);

        if (response.error) {
          errors.push({
            error: true,
            message: response.message
          });
        } else {
          arquivos.foto = path; // Salvando o caminho da foto
        }
      }

      if (errors.length > 0) {
        return res.json(errors[0]);
      }

      // Criar salão com os caminhos da capa e foto
      const salao = await new Salao({
        ...req.body,
        capa: arquivos.capa,
        foto: arquivos.foto,
      }).save();

      res.json({
        salao,
        message: 'Salão cadastrado com sucesso!',
      });
    } catch (err) {
      res.json({
        error: true,
        message: err.message,
      });
    }
  });

  req.pipe(busboy);
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