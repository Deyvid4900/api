const express = require('express');
const mongoose = require('mongoose');

const Busboy = require('busboy');
const aws = require('../services/aws');
const Arquivos = require('../models/arquivos');
const router = express.Router();
const Colaborador = require('../models/colaborador');
const Salao = require('../models/salao');
const SalaoColaborador = require('../models/relationship/salaoColaborador');
const ColaboradorServico = require('../models/relationship/colaboradorServico');
const moment = require('moment');
// const pagarme = require('../services/pagarme');

/*
  FAZER NA #01
*/
router.post('/', async (req, res) => {
  var busboy = new Busboy({
    headers: req.headers
  });

  busboy.on('finish', async () => {
    try {
      let errors = [];
      let arquivos = [];
      let colaborador = {
        ...req.body
      };

      // Verificar se há arquivos para upload
      if (req.files && Object.keys(req.files).length > 0) {
        for (let key of Object.keys(req.files)) {
          const file = req.files[key];
          const nameParts = file.name.split('.');
          const fileName = `${new Date().getTime()}.${nameParts[nameParts.length - 1]}`;
          const path = `colaboradores/${req.body.salaoId}/${fileName}`;

          const response = await aws.uploadToS3(file, path);

          if (response.error) {
            errors.push({
              error: true,
              message: response.message.message
            });
          } else {
            arquivos.push(path);
            colaborador.foto = path; // Salvar o caminho da foto no colaborador
          }
        }
      }

      if (errors.length > 0) {
        return res.json(errors[0]);
      }

      // Verificar campos obrigatórios
      const {
        salaoId,
        nome,
        email,
        telefone,
        especialidades
      } = colaborador;
      if (!salaoId || !nome || !email || !telefone || !especialidades || especialidades.length === 0) {
        return res.json({
          error: true,
          message: 'Todos os campos obrigatórios devem ser preenchidos.',
        });
      }

      // Verificar se o salão existe
      const salao = await Salao.findById(salaoId);
      if (!salao) {
        return res.json({
          error: true,
          message: 'Salão não encontrado.',
        });
      }

      // Verificar limites do plano
      const colaboradoresCount = await SalaoColaborador.countDocuments({
        salaoId
      });
      const planoLimites = {
        'básico': 1,
        'gold': 3,
        'premium': 6,
        'teste': 6,
        'master': 999,
      };

      if (colaboradoresCount >= planoLimites[salao.plano]) {
        return res.json({
          error: true,
          message: `O plano ${salao.plano} permite no máximo ${planoLimites[salao.plano]} colaboradores.`,
        });
      }

      // Verificar se o colaborador já está cadastrado
      const existentColaborador = await Colaborador.findOne({
        $or: [{
          email
        }, {
          telefone
        }]
      });

      if (existentColaborador) {
        return res.json({
          error: true,
          message: 'Colaborador já cadastrado!',
        });
      }

      // Criar novo colaborador
      const newColaborador = await new Colaborador(colaborador).save();
      const colaboradorId = newColaborador._id;

      // Relacionamento com o salão
      const existentRelationship = await SalaoColaborador.findOne({
        salaoId,
        colaboradorId
      });
      if (!existentRelationship) {
        await new SalaoColaborador({
          salaoId,
          colaboradorId,
          status: colaborador.vinculo
        }).save();
      }

      if (existentRelationship && existentRelationship.status === 'I') {
        await SalaoColaborador.findOneAndUpdate({
          salaoId,
          colaboradorId
        }, {
          status: 'A'
        });
      }

      // Relação com os serviços / especialidades
      let especialidadesArray;
      try {
        especialidadesArray = JSON.parse(especialidades);
      } catch (error) {
        return res.json({
          error: true,
          message: 'O campo especialidades não está no formato correto.',
        });
      }

      await ColaboradorServico.insertMany(
        especialidadesArray.map((servicoId) => ({
          servicoId,
          colaboradorId,
        }))
      );

      res.json({
        error: false,
        message: 'Colaborador cadastrado com sucesso!',
        foto: colaborador.foto || null, // Retorna a URL da foto se houver
      });
    } catch (err) {
      res.status(500).json({
        error: true,
        message: err.message || 'Erro no servidor.',
      });
    }
  });

  req.pipe(busboy);
});


/*
  FAZER NA #01
*/
router.post('/filter', async (req, res) => {
  try {
    const colaboradores = await Colaborador.find(req.body.filters);
    res.json({
      error: false,
      colaboradores
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

/*
  FAZER NA #01
*/
router.get('/salao/:salaoId', async (req, res) => {
  try {
    const {
      salaoId
    } = req.params;

    // Buscar apenas colaboradores com status "A" (ativos)
    const colaboradores = await SalaoColaborador.find({
        salaoId,
        status: 'A', // Filtrar apenas os colaboradores com status 'A'
      })
      .populate('colaboradorId')
      .select('colaboradorId dataCadastro status');
    // Usar Promise.all para buscar todas as especialidades e foto em paralelo
    const listaColaboradores = await Promise.all(
      colaboradores.map(async (colaborador) => {
        // Buscar especialidades do colaborador
        const especialidades = await ColaboradorServico.find({
          colaboradorId: colaborador.colaboradorId._id,
        }).select('servicoId');

      
        const arquivos = await Arquivos.find({
          model: 'Colaborador',
          referenciaId: colaborador.colaboradorId._id,
        });
        
        return {
          ...colaborador._doc,
          especialidades: especialidades.map((e) => e.servicoId),
          foto: colaborador.colaboradorId.foto ? colaborador.colaboradorId.foto  : null,
           // Retornar a URL da foto, se houver
        };
      })
    );

    // Formatar o resultado final
    res.json({
      error: false,
      colaboradores: listaColaboradores.map((c) => ({
        ...c.colaboradorId._doc,
        vinculoId: c._id,
        vinculo: c.status,
        especialidades: c.especialidades,
        foto: c.foto, // Adicionar a foto no retorno
        dataCadastro: moment(c.dataCadastro).format('DD/MM/YYYY'),
      })),
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message,
    });
  }
});



/*
  FAZER NA #01
*/
router.put('/:colaboradorId', async (req, res) => {



  try {
    const {
      vinculo,
      vinculoId,
      especialidades
    } = req.body;
    const {
      colaboradorId
    } = req.params;

    await Colaborador.findByIdAndUpdate(colaboradorId, req.body);

    // ATUALIZANDO VINCULO
    if (vinculo) {
      await SalaoColaborador.findByIdAndUpdate(vinculoId, {
        status: vinculo
      });
    }

    // ATUALIZANDO ESPECIALIDADES
    if (especialidades) {
      await ColaboradorServico.deleteMany({
        colaboradorId,
      });

      await ColaboradorServico.insertMany(
        especialidades.map((servicoId) => ({
          servicoId,
          colaboradorId,
        }))
      );
    }

    res.json({
      error: false, message: 'Colaborador atualizado com sucesso!'
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

/*
  FAZER NA #01
*/
router.delete('/vinculo/:colaboradorId', async (req, res) => {
  try {
    const {
      colaboradorId
    } = req.params;

    // Verificar se o relacionamento com o colaborador existe
    const vinculo = await SalaoColaborador.findOne({
      colaboradorId
    });

    if (!vinculo) {
      return res.status(404).json({
        error: true,
        message: 'Vínculo não encontrado.',
      });
    }

    // Atualizar o status do vínculo para 'E' (soft delete)
    await SalaoColaborador.findOneAndUpdate({
        colaboradorId
      }, // Encontrar pelo colaboradorId
      {
        status: 'E'
      } // Atualizar o status para 'E'
    );

    res.json({
      error: false,
      message: 'Vínculo desativado com sucesso.'
    });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message || 'Erro ao desativar vínculo.'
    });
  }
});



module.exports = router;