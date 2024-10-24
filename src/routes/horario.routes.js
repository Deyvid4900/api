const express = require('express');
const router = express.Router();
const Horario = require('../models/horario');
const ColaboradorServico = require('../models/relationship/colaboradorServico');
const moment = require('moment-timezone');
var _ = require('lodash');

router.post('/', async (req, res) => {
  try {
    // VERIFICAR SE EXISTE ALGUM HORARIO, NAQUELE DIA, PRAQUELE SALÃO

    // SE NÃO HOVER, CADASTRA
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
    const { salaoId } = req.params;

    // Pega o início do dia atual e o fim do dia daqui a 7 dias no formato UTC
    const startOfToday = moment.utc().startOf('week').toDate(); // Início do dia atual
    const endOfNext7Days = moment.utc().add(7, 'days').endOf('week').toDate(); // Fim do 7º dia

    console.log('Início de hoje UTC:', startOfToday);
    console.log('Fim dos próximos 7 dias UTC:', endOfNext7Days);

    // Filtra horários entre o início de hoje e o fim dos próximos 7 dias no formato UTC
    const horarios = await Horario.find({
      salaoId,
      inicio: { $gte: startOfToday }, // Verifica horários com início >= início de hoje
      fim: { $lte: endOfNext7Days }   // Verifica horários com fim <= fim dos próximos 7 dias
    });

    console.log('Horários encontrados:', horarios);

    if (horarios.length === 0) {
      console.log('Nenhum horário encontrado para os próximos 7 dias.');
    }

    res.json({ error: false, horarios });
  } catch (err) {
    console.error('Erro ao buscar horários:', err);
    res.json({ error: true, message: err.message });
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