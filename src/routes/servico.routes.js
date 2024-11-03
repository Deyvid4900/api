const express = require('express');
const router = express.Router();
const Busboy = require('busboy');
const Arquivos = require('../models/arquivos');
const aws = require('../services/aws');
const Servico = require('../models/servico');
const Salao = require('../models/salao');
const moment = require('moment');
const ColaboradorServico = require('../models/relationship/colaboradorServico');
const SalaoColaborador = require('../models/relationship/salaoColaborador')

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

      
      let jsonServico = JSON.parse(req.body.servico);
      jsonServico.salaoId = req.body.salaoId;
      const servico = await new Servico(jsonServico).save();

      
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

      
      if (req.files && Object.keys(req.files).length > 0) {
        for (let key of Object.keys(req.files)) {
          const file = req.files[key];

          const nameParts = file.name.split('.');
          const fileName = `${new Date().getTime()}.${nameParts[nameParts.length - 1]}`;
          const path = `servicos/${req.body.salaoId}/${fileName}`;

          
          

          
          
          
          
          
          
        }
      }

      
      if (errors.length > 0) {
        return res.status(400).json(errors[0]);
      }

      
      if (!req.body.servico) {
        return res.status(400).json({
          error: true,
          message: 'Campo "servico" é necessário.'
        });
      }

      
      let jsonServico;
      try {
        jsonServico = JSON.parse(req.body.servico);
      } catch (parseError) {
        return res.status(400).json({
          error: true,
          message: 'Erro ao analisar o JSON do campo "servico".'
        });
      }

      
      const updatedServico = await Servico.findByIdAndUpdate(req.body.servicoId, jsonServico, {
        new: true
      });

      if (!updatedServico) {
        return res.status(404).json({
          error: true,
          message: 'Serviço não encontrado.'
        });
      }

      
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
      console.error(err); 
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
      error: false,
      message: 'Serivço deletado com sucesso!'
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

    
    const colaboradorServico = await ColaboradorServico.find({
      colaboradorId,
    });

    if (!colaboradorServico || colaboradorServico.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Colaborador não encontrado ou sem especialidades.'
      });
    }

    
    const especialidadesIds = colaboradorServico.map(e => e.servicoId);

    
    const servicosColaborador = await Servico.find({
      _id: {
        $in: especialidadesIds
      },
      status: {
        $ne: 'E'
      },
    });

    
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
    const {
      salaoId
    } = req.body;
    
    // console.log(req.body)

    
    const colaboradores = await ColaboradorServico.find({ 
      servicoId
    });

    if (!colaboradores || colaboradores.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Nenhum colaborador encontrado para este serviço.'
      });
    }

    
    const colaboradorIds = colaboradores.map(c => c.colaboradorId);

    
    const colaboradoresInfo = await Colaborador.find({ 
      _id: {
        $in: colaboradorIds
      }
    });
    // console.log(colaboradoresInfo)
    
    const salaoColaboradores = await SalaoColaborador.find({status:'A'});
    // console.log(salaoColaboradores)
    
    const colaboradoresAtivos = colaboradoresInfo.filter(colab =>
      salaoColaboradores.some(salaoColab =>
        salaoColab.colaboradorId.toString() === colab._id.toString()
      )
    );

    if (colaboradoresAtivos.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'Nenhum colaborador ativo encontrado para este serviço.'
      });
    }

    res.json({
      error: false,
      colaboradores: colaboradoresAtivos,
    });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message
    });
  }
});








module.exports = router;