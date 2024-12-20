const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const Busboy = require('busboy');
const Arquivos = require('../models/arquivos');
const Salao = require('../models/salao');
const Colaborador = require('../models/colaborador')
const Servico = require('../models/servico');
const Horario = require('../models/horario');
const turf = require('turf');
const util = require('../util');
const {
  select
} = require('underscore');


router.post('/login', async (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const {
    email,
    senha
  } = req.body;

  try {
    // 1. Verificar se o email existe em Salão ou Colaborador
    const salao = await Salao.findOne({
      email
    });
    const colaborador = await Colaborador.findOne({
      email
    });

    console.log(salao)
    console.log(colaborador)

    // 2. Determinar qual usuário foi encontrado
    const usuario = salao || colaborador;

    if (!usuario) {
      return res.status(401).json({
        message: 'Email ou senha incorretos'
      });
    }

    // 3. Comparar a senha fornecida com a senha armazenada
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({
        message: 'Email ou senha incorretos'
      });
    }

    // 4. Gerar um token JWT com o id e o email do usuário
    const token = jwt.sign({
      id: usuario._id,
      email: usuario.email
    }, JWT_SECRET, {
      expiresIn: '7d', // Token expira em 7 dias
    });

    // 5. Retornar o token, email e id do usuário
    return res.json({
      token,
      email: usuario.email,
      id: usuario._id,
      tipo: colaborador == null ? "Salao" : "Colaborador"
    });

  } catch (error) {
    console.error(error); // Log para depuração
    return res.status(500).json({
      message: 'Erro no servidor'
    });
  }
});

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres não alfanuméricos por '-'
    .replace(/^-+|-+$/g, '');    // Remove hifens extras do início/fim
};

// Listar todos os salões com nome, foto, email e telefone
router.get('/saloes', async (req, res) => {
  try {
    // Buscando todos os salões
    const saloes = await Salao.find({}, 'nome foto email telefone capa'); // Selecionando apenas os campos necessários
    
    if (saloes.length === 0) {
      return res.json({
        error: false,
        message: 'Nenhum salão encontrado.',
        saloes: []
      });
    }

    // Adicionando o slug a cada salão
    const saloesComSlug = saloes.map((salao) => ({
      ...salao.toObject(), // Garante que é um objeto puro
      slug: `Salao/${generateSlug(salao.nome)}`
    }));

    res.json({
      error: false,
      saloes: saloesComSlug
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});



const SALT_ROUNDS = 10; // Definindo rounds para o bcrypt

router.post('/', async (req, res) => {
  const higienizarNome = (nome) => {
    return nome
      .trim() // Remove espaços em branco do início e do fim
      .replace(/\s+/g, '-') // Substitui múltiplos espaços por um único hífen
      .toLowerCase(); // Converte tudo para minúsculas
  };

  // Detectar se a requisição é multipart/form-data
  if (req.is('multipart/form-data')) {
    const busboy = new Busboy({
      headers: req.headers
    });
    let files = {};
    let body = {};

    // Processar campos de texto e arquivos
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      if (fieldname === 'capa' || fieldname === 'foto') {
        files[fieldname] = {
          file,
          filename,
          mimetype
        }; // Armazenar informações do arquivo
      }
    });

    busboy.on('field', (fieldname, val) => {
      body[fieldname] = val; // Armazenar campos de texto
    });

    busboy.on('finish', async () => {
      try {
        let errors = {};
        let arquivos = {};

        // Higieniza o nome antes de salvar
        body.nome = higienizarNome(body.nome);

        // Hash da senha utilizando bcrypt
        if (body.senha) {
          body.senha = await bcrypt.hash(body.senha, SALT_ROUNDS);
        }

        // Upload da capa, se presente
        if (files.capa) {
          const {
            file,
            filename
          } = files.capa;
          const nameParts = filename.split('.');
          const fileName = `${Date.now()}-capa.${nameParts[nameParts.length - 1]}`;
          const path = `saloes/${body.nome}/${fileName}`;

          const response = await aws.uploadToS3(file, path);

          if (response.error) {
            errors.capa = response.message;
          } else {
            arquivos.capa = path; // Salvando o caminho da capa
          }
        }

        // Upload da foto, se presente
        if (files.foto) {
          const {
            file,
            filename
          } = files.foto;
          const nameParts = filename.split('.');
          const fileName = `${Date.now()}-foto.${nameParts[nameParts.length - 1]}`;
          const path = `saloes/${body.nome}/${fileName}`;

          const response = await aws.uploadToS3(file, path);

          if (response.error) {
            errors.foto = response.message;
          } else {
            arquivos.foto = path; // Salvando o caminho da foto
          }
        }

        // Se houver erros, retorne a resposta com os detalhes dos erros
        if (Object.keys(errors).length > 0) {
          return res.json({
            error: true,
            details: errors
          });
        }

        // Criar salão com os caminhos da capa e foto, se disponíveis
        const salaoData = {
          ...body,
          ...(arquivos.capa && {
            capa: arquivos.capa
          }), // Inclui capa se estiver disponível
          ...(arquivos.foto && {
            foto: arquivos.foto
          }), // Inclui foto se estiver disponível
        };

        const salao = await new Salao(salaoData).save();

        res.json({
          salao,
          message: 'Salão cadastrado com sucesso!',
        });
      } catch (err) {
        res.status(500).json({
          error: true,
          message: err.message,
        });
      }
    });

    req.pipe(busboy);
  } else {
    // Se não for multipart/form-data, supomos que é um JSON
    try {
      let body = req.body;

      // Higieniza o nome antes de salvar
      body.nome = higienizarNome(body.nome);

      // Hash da senha utilizando bcrypt
      if (body.senha) {
        body.senha = await bcrypt.hash(body.senha, SALT_ROUNDS);
      }

      // Criar salão sem arquivos
      const salao = await new Salao(body).save();

      res.json({
        salao,
        message: 'Salão cadastrado com sucesso!',
      });
    } catch (err) {
      res.status(500).json({
        error: true,
        message: err.message,
      });
    }
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