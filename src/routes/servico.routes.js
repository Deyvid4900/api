const express = require('express');
const router = express.Router();
const Busboy = require('busboy');
const Arquivos = require('../models/arquivos');
const aws = require('../services/aws');
const Servico = require('../models/servico');
const Salao = require('../models/salao');
const moment = require('moment');
const ColaboradorServico = require('../models/relationship/colaboradorServico');

const Colaborador = require('../models/colaborador');
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

      if (req.files && Object.keys(req.files).length > 0) {
        for (let key of Object.keys(req.files)) {
          const file = req.files[key];

          const nameParts = file.name.split('.');
          const fileName = `${new Date().getTime()}.${
            nameParts[nameParts.length - 1]
          }`;
          const path = `servicos/${req.body.salaoId}/${fileName}`;

          const response = await aws.uploadToS3(
            file,
            path
          );

          if (response.error) {
            errors.push({
              error: true,
              message: response.message.message
            });
          } else {
            arquivos.push(path);
          }
        }
      }

      if (errors.length > 0) {
        res.json(errors[0]);
        return false;
      }

      // Verificar o tipo de plano e a quantidade de serviços
      const salao = await Salao.findById(req.body.salaoId);
      const servicosCount = await Servico.countDocuments({
        salaoId: req.body.salaoId
      });

      const planoLimites = {
        'básico': 4,
        'gold': 7,
        'teste': 10,
        'premium': 10,
        'master': 999,
      };

      if (servicosCount >= planoLimites[salao.plano]) {
        return res.json({
          error: true,
          message: `O plano ${salao.plano} permite no máximo ${planoLimites[salao.plano]} serviços.`
        });
      }

      // CRIAR SERVIÇO
      let jsonServico = JSON.parse(req.body.servico);
      jsonServico.salaoId = req.body.salaoId;
      const servico = await new Servico(jsonServico).save();

      // CRIAR ARQUIVO
      arquivos = arquivos.map((arquivo) => ({
        referenciaId: servico._id,
        model: 'Servico',
        arquivo,
      }));
      await Arquivos.insertMany(arquivos);

      res.json({
        error: false,
        arquivos,
        message: 'Serviço criado com sucesso!'
      });
    } catch (err) {
      res.json({
        error: true,
        message: err.message
      });
    }
  });
  req.pipe(busboy);
});

/*
  FAZER NA #01
*/
router.put('/:id', async (req, res) => {
  const busboy = new Busboy({
    headers: req.headers
  });

  busboy.on('finish', async () => {
    try {
      let errors = [];
      let arquivos = [];

      // Verifica se existem arquivos na requisição
      if (req.files && Object.keys(req.files).length > 0) {
        for (let key of Object.keys(req.files)) {
          const file = req.files[key];

          const nameParts = file.name.split('.');
          const fileName = `${new Date().getTime()}.${nameParts[nameParts.length - 1]}`;
          const path = `servicos/${req.body.salaoId}/${fileName}`;

          // Implementar upload para S3 aqui
          // const response = await aws.uploadToS3(file, path);

          // Exemplo: se o upload falhar
          // if (response.error) {
          //   errors.push({ error: true, message: response.message });
          // } else {
          //   arquivos.push(path);
          // }
        }
      }

      // Se houver erros com os arquivos, retornar o primeiro erro
      if (errors.length > 0) {
        return res.status(400).json(errors[0]);
      }

      // Verificar se o campo 'servico' foi enviado
      if (!req.body.servico) {
        return res.status(400).json({
          error: true,
          message: 'Campo "servico" é necessário.'
        });
      }

      // Tentar fazer o parsing do JSON
      let jsonServico;
      try {
        jsonServico = JSON.parse(req.body.servico);
      } catch (parseError) {
        return res.status(400).json({
          error: true,
          message: 'Erro ao analisar o JSON do campo "servico".'
        });
      }

      // Atualizar o serviço
      const updatedServico = await Servico.findByIdAndUpdate(req.body.servicoId, jsonServico, {
        new: true
      });

      if (!updatedServico) {
        return res.status(404).json({
          error: true,
          message: 'Serviço não encontrado.'
        });
      }

      // Se houver arquivos, inserir registros de arquivos no banco de dados
      if (arquivos.length > 0) {
        const arquivosDocs = arquivos.map(arquivo => ({
          referenciaId: req.params.id,
          model: 'Servico',
          arquivo,
        }));
        await Arquivos.insertMany(arquivosDocs);
      }

      return res.json({
        error: false,
        message: 'Serviço atualizado com sucesso!'
      });
    } catch (err) {
      console.error(err); // Logar o erro no servidor
      return res.status(500).json({
        error: true,
        message: err.message
      });
    }
  });

  req.pipe(busboy);
});

/*
  FAZER NA #01
*/
router.get('/salao/:salaoId', async (req, res) => {
  try {
    let servicosSalao = [];
    const servicos = await Servico.find({
      salaoId: req.params.salaoId,
      status: {
        $ne: 'E'
      },
    });

    for (let servico of servicos) {
      const arquivos = await Arquivos.find({
        model: 'Servico',
        referenciaId: servico._id,
      });
      servicosSalao.push({
        ...servico._doc,
        arquivos
      });
    }

    res.json({
      error: false,
      servicos: servicosSalao,
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
router.post('/remove-arquivo', async (req, res) => {
  try {
    const {
      arquivo
    } = req.body;

    // EXCLUIR DA AWS
    // await aws.deleteFileS3(arquivo);

    // EXCLUIR DO BANCO DE DADOS
    await Arquivos.findOneAndDelete({
      arquivo,
    });

    res.json({
      error: false,
      message: 'Erro ao excluir o arquivo!'
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
router.delete('/:id', async (req, res) => {
  try {
    await Servico.findByIdAndUpdate(req.params.id, {
      status: 'E'
    });
    res.json({
      error: false,message: 'Serivço deletado com sucesso!'
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});


router.get('/colaborador/:colaboradorId', async (req, res) => {
  try {
    const {
      colaboradorId
    } = req.params;

    // Encontrar o colaborador e suas especialidades
    const colaboradorServico = await ColaboradorServico.find({
      colaboradorId,
    });

    if (!colaboradorServico || colaboradorServico.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Colaborador não encontrado ou sem especialidades.'
      });
    }

    // Obter os IDs dos serviços
    const especialidadesIds = colaboradorServico.map(e => e.servicoId);

    // Buscar os serviços correspondentes às especialidades
    const servicosColaborador = await Servico.find({
      _id: {
        $in: especialidadesIds
      },
      status: {
        $ne: 'E'
      },
    });

    // Buscar arquivos relacionados a cada serviço
    const servicosComArquivos = await Promise.all(
      servicosColaborador.map(async (servico) => {
        const arquivos = await Arquivos.find({
          model: 'Servico',
          referenciaId: servico._id,
        });
        return {
          ...servico._doc,
          arquivos
        };
      })
    );

    res.json({
      error: false,
      servicos: servicosComArquivos,
      especialidades: especialidadesIds,
    });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message
    });
  }
});
router.get('/:servicoId/colaboradores', async (req, res) => {
  try {
    const {
      servicoId
    } = req.params;

    // Encontrar colaboradores que possuem o serviço
    const colaboradores = await ColaboradorServico.find({
      servicoId
    });

    if (!colaboradores || colaboradores.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Nenhum colaborador encontrado para este serviço.'
      });
    }

    // Obter os IDs dos colaboradores
    const colaboradorIds = colaboradores.map(c => c.colaboradorId);

    // Buscar informações dos colaboradores
    const colaboradoresInfo = await Colaborador.find({
      _id: {
        $in: colaboradorIds
      }
    });

    res.json({
      error: false,
      colaboradores: colaboradoresInfo,
    });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message
    });
  }
});







module.exports = router;