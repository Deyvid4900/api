const express = require('express');
const router = express.Router();
const Busboy = require('busboy');
// const aws = require('../services/aws');
const Servico = require('../models/servico');
const Arquivos = require('../models/arquivos');
const moment = require('moment');

/*
  FAZER NA #01
*/
router.post('/', async (req, res) => {
  var busboy = new Busboy({ headers: req.headers });
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

          // const response = await aws.uploadToS3(
          //   file,
          //   path
          //   //, acl = https://docs.aws.amazon.com/pt_br/AmazonS3/latest/dev/acl-overview.html
          // );

          if (response.error) {
            errors.push({ error: true, message: response.message.message });
          } else {
            arquivos.push(path);
          }
        }
      }

      if (errors.length > 0) {
        res.json(errors[0]);
        return false;
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

      res.json({ error: false, arquivos });
    } catch (err) {
      res.json({ error: true, message: err.message });
    }
  });
  req.pipe(busboy);
});

/*
  FAZER NA #01
*/
router.put('/:id', async (req, res) => {
  const busboy = new Busboy({ headers: req.headers });

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
        return res.status(400).json({ error: true, message: 'Campo "servico" é necessário.' });
      }

      // Tentar fazer o parsing do JSON
      let jsonServico;
      try {
        jsonServico = JSON.parse(req.body.servico);
      } catch (parseError) {
        return res.status(400).json({ error: true, message: 'Erro ao analisar o JSON do campo "servico".' });
      }

      // Atualizar o serviço
      console.log(req.body.servicoId)
      const updatedServico = await Servico.findByIdAndUpdate(req.body.servicoId, jsonServico, { new: true });

      if (!updatedServico) {
        return res.status(404).json({ error: true, message: 'Serviço não encontrado.' });
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

      return res.json({ error: false, message: 'Serviço atualizado com sucesso!' });
    } catch (err) {
      console.error(err); // Logar o erro no servidor
      return res.status(500).json({ error: true, message: err.message });
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
      status: { $ne: 'E' },
    });

    for (let servico of servicos) {
      const arquivos = await Arquivos.find({
        model: 'Servico',
        referenciaId: servico._id,
      });
      servicosSalao.push({ ...servico._doc, arquivos });
    }

    res.json({
      error: false,
      servicos: servicosSalao,
    });
  } catch (err) {
    res.json({ error: true, message: err.message });
  }
});

/*
  FAZER NA #01
*/
router.post('/remove-arquivo', async (req, res) => {
  try {
    const { arquivo } = req.body;

    // EXCLUIR DA AWS
    // await aws.deleteFileS3(arquivo);

    // EXCLUIR DO BANCO DE DADOS
    await Arquivos.findOneAndDelete({
      arquivo,
    });

    res.json({ error: false, message: 'Erro ao excluir o arquivo!' });
  } catch (err) {
    res.json({ error: true, message: err.message });
  }
});

/*
  FAZER NA #01
*/
router.delete('/:id', async (req, res) => {
  try {
    await Servico.findByIdAndUpdate(req.params.id, { status: 'E' });
    res.json({ error: false });
  } catch (err) {
    res.json({ error: true, message: err.message });
  }
});

module.exports = router;
