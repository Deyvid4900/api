const express = require('express');
const router = express.Router();
const Horario = require('../models/horario');
const ColaboradorServico = require('../models/relationship/colaboradorServico');
const axios = require('axios');
const moment = require('moment-timezone');
var _ = require('lodash');

async function buscarColaboradoresDoSalao(salaoId) {
  try {
    const response = await axios.get(`https://api-production-70cb.up.railway.app/colaborador/salao/${salaoId}`);
    if (response.data && !response.data.error) {
      return response.data.colaboradores.map(colab => colab._id); // Retorna apenas os IDs dos colaboradores
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar colaboradores:', error.message);
    return [];
  }
}

async function buscarServicosDoSalao(salaoId) {
  try {
    const response = await axios.get(`https://api-production-70cb.up.railway.app/servico/salao/${salaoId}`);
    if (response.data && !response.data.error) {
      return response.data.servicos.map(servico => servico._id); // Retorna apenas os IDs dos serviços
    }
    return [];
  } catch (error) {
    console.error('Erro ao buscar serviços:', error.message);
    return [];
  }
}
async function criarHorariosPadrao(salaoId) {
  const horariosPadrao = [];

  // Buscar colaboradores e serviços do salão
  const colaboradores = await buscarColaboradoresDoSalao(salaoId);
  const servicos = await buscarServicosDoSalao(salaoId);

  // Função auxiliar para ajustar a data de início e fim para a semana atual
  function ajustarInicioFim() {
    const hoje = moment.utc().startOf('day');

    // Início no primeiro dia da semana
    const inicio = hoje.clone().startOf('week').set({ hour: 8, minute: 0 });
    // Fim no último dia da semana
    const fim = hoje.clone().endOf('week').set({ hour: 18, minute: 0 });

    return { inicio: inicio.toDate(), fim: fim.toDate() };
  }

  // Ajusta o horário para cobrir a semana atual
  const { inicio, fim } = ajustarInicioFim();
  
  horariosPadrao.push({
    salaoId,
    dias: [ 1, 2, 3, 4, 5], // Domingo a Sábado
    inicio, // Data e hora de início ajustada para o primeiro dia da semana
    fim,    // Data e hora de fim ajustada para o último dia da semana
    especialidades: servicos, // Ajuste conforme necessário
    colaboradores, // Adiciona todos os IDs dos colaboradores
    dataCadastro: new Date(),
  });

  // Salva todos os horários no banco de dados
  await Horario.insertMany(horariosPadrao);

  // Retorna os horários recém-criados
  return horariosPadrao;
}



router.post('/', async (req, res) => {
  try {
    await new Horario(req.body).save();

    res.json({
      error: false,
      message: 'Horário criado com sucesso!'
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
    const {
      salaoId
    } = req.params;

    // Pega o início do dia atual e o fim do dia daqui a 7 dias no formato UTC
    const startOfToday = moment.utc().startOf('week').toDate(); // Início do dia atual
    const endOfNext7Days = moment.utc().add(7, 'days').endOf('week').toDate(); // Fim do 7º dia

    // console.log('Início de hoje UTC:', startOfToday);
    // console.log('Fim dos próximos 7 dias UTC:', endOfNext7Days);

    // Filtra horários entre o início de hoje e o fim dos próximos 7 dias no formato UTC
    const horarios = await Horario.find({
      salaoId,
      inicio: {
        $gte: startOfToday
      }, // Verifica horários com início >= início de hoje
      fim: {
        $lte: endOfNext7Days
      } // Verifica horários com fim <= fim dos próximos 7 dias
    });

    // console.log('Horários encontrados:', horarios);

    if (horarios.length === 0) {
      horarios = await criarHorariosPadrao(salaoId);
      console.log('Nenhum horário encontrado para os próximos 7 dias.');
    }

    res.json({
      error: false,
      horarios
    });
  } catch (err) {
    console.error('Erro ao buscar horários:', err);
    res.json({
      error: true,
      message: err.message
    });
  }
});




router.put('/:horarioId', async (req, res) => {
  try {
    const {
      horarioId
    } = req.params;
    const horario = req.body;

    // SE NÃO HOVER, ATUALIZA
    await Horario.findByIdAndUpdate(horarioId, horario);

    res.json({
      error: false,
      message: 'Horário atualizado com sucesso!'
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.post('/colaboradores', async (req, res) => {
  try {
    const colaboradores = await ColaboradorServico.find({
        servicoId: {
          $in: req.body.servicos
        },
        status: 'A',
      })
      .populate('colaboradorId', 'nome')
      .select('colaboradorId -_id');

    const listaColaboradores = _.uniqBy(colaboradores, (c) =>
      c.colaboradorId._id.toString()
    ).map((c) => ({
      label: c.colaboradorId.nome,
      value: c.colaboradorId._id
    }));

    res.json({
      error: false,
      colaboradores: listaColaboradores
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.delete('/:horarioId', async (req, res) => {
  try {
    const {
      horarioId
    } = req.params;
    await Horario.findByIdAndDelete(horarioId);
    res.json({
      error: false,
      message: 'Horário deletado com sucesso!'
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

module.exports = router;