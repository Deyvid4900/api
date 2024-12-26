const express = require('express');
const router = express.Router();
const Horario = require('../models/horario');
const Agendamento = require('../models/agendamento');
const Cliente = require('../models/cliente');
const Salao = require('../models/salao');
const Servico = require('../models/servico');
const Colaborador = require('../models/colaborador');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const _ = require('lodash');
const keys = require('../data/keys.json');
const util = require('../util');
// const pagarme = require('../services/pagarme');

const CLIENT_TIMEZONE = 'America/Sao_Paulo';
router.post('/filter', async (req, res) => {
  try {
    const {
      range,
      salaoId
    } = req.body;


    const agendamentos = await Agendamento.find({
      status: 'A',
      salaoId,
      data: {
        $gte: moment(range.start).startOf('day'),
        $lte: moment(range.end).endOf('day'),
      },
    }).populate([{
        path: 'servicoId',
        select: 'titulo duracao'
      },
      {
        path: 'colaboradorId',
        select: 'nome'
      },
      {
        path: 'clienteId',
        select: 'nome'
      },
    ]);

    res.json({
      error: false,
      agendamentos
    });





  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

router.delete('/', async (req, res) => {
  const {
    agendamentoId
  } = req.body;
  console.log(req.body)
  try {

    // Verifica se o ID foi fornecido
    if (!agendamentoId) {
      return res.status(400).json({
        error: true,
        message: 'O ID do agendamento é obrigatório.'
      });
    }

    // Busca o agendamento para verificar sua existência
    const agendamento = await Agendamento.findById(agendamentoId);

    if (!agendamento) {
      return res.status(404).json({
        error: true,
        message: 'Agendamento não encontrado.'
      });
    }

    // Remove o agendamento do banco de dados
    await Agendamento.deleteOne({
      _id: agendamentoId
    });

    res.json({
      error: false,
      message: 'Agendamento deletado com sucesso.'
    });
  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message
    });
  }
});


router.post('/', async (req, res) => {
  try {

    const payload = req.body.payload || req.body;
    console.log(payload);

    const {
      clienteId,
      salaoId,
      servicoId,
      data,
      colaboradorId
    } = payload;

    console.log(colaboradorId);
    let parsedDate = moment.tz(data, 'America/Sao_Paulo');

    // Extrair o ID do colaborador corretamente do payload
    const colaborador = colaboradorId.payload ? colaboradorId.payload[0] : colaboradorId; // Pegando o primeiro colaborador da lista
    const colaboradorIdExtracted = colaborador._id ? colaborador._id : colaborador;

    // Valida se a data é válida
    if (!parsedDate.isValid()) {
      console.log("Data inválida:", data);
      return res.json({
        error: true,
        message: "Data de agendamento inválida."
      });
    }

    // Converta a data para UTC antes de salvar no banco de dados
    const dataAgendamento = parsedDate.utc().toISOString();
    // Obtenha o dia da semana (0-6), onde 0 = domingo e 6 = sábado
    const diaDaSemana = parsedDate.day();

    // Recupere os horários do salão
    const horarios = await Horario.find({
      salaoId
    });

    if (!horarios.length) {
      return res.json({
        error: true,
        message: "Nenhum horário disponível para o salão."
      });
    }

    // Verifique se há horário disponível no dia e no horário selecionado
    const horarioDisponivel = horarios.some(horario => {
      const inicioHorario = moment.utc(horario.inicio);
      const fimHorario = moment.utc(horario.fim);
      const agendamentoHorario = moment.utc(parsedDate);

      // Verificar se o horário de fim é antes do início (caso inválido)
      if (fimHorario.isBefore(inicioHorario)) {
        console.warn(`Horário de fim inválido para o horário ID ${horario._id}: fim é antes do início.`);
        return false;
      }

      // Verificar se o horário de agendamento está dentro do intervalo (início <= agendamento < fim)
      const horaDentroIntervalo = agendamentoHorario.isBetween(inicioHorario, fimHorario, null, '[)');
      const diaDisponivel = horario.dias.includes(diaDaSemana);

      // Retornar verdadeiro se o horário está dentro do intervalo e o dia é permitido
      return horaDentroIntervalo && diaDisponivel;
    });

    // Se não houver horário disponível
    if (!horarioDisponivel) {
      return res.json({
        error: true,
        message: `Este horário não está disponível para agendamentos.`
      });
    }

    // Verifique se já existe um agendamento para o colaborador e data
    const agendamentoExistente = await Agendamento.findOne({
      colaboradorId: colaboradorIdExtracted,
      data: {
        $gte: moment(parsedDate).startOf('minute').utc().toISOString(),
        $lt: moment(parsedDate).add(30, 'minutes').startOf('minute').utc().toISOString()
      }
    });


    console.log("Consulta para agendamento existente:");
    console.log({
      colaboradorId: colaboradorIdExtracted,
      intervalo: {
        $gte: moment(parsedDate).startOf('minute').utc().toISOString(),
        $lt: moment(parsedDate).add(1, 'hour').startOf('minute').utc().toISOString()
      }
    });
    console.log("Resultado da consulta:", agendamentoExistente);


    if (agendamentoExistente) {
      return res.json({
        error: true,
        message: `Este horário já está reservado para outro cliente.`
      });
    }

    // Prosseguir com a criação do agendamento
    const cliente = await Cliente.findById(clienteId).select('nome endereco');
    const salao = await Salao.findById(salaoId).select('_id');
    const servico = await Servico.findById(servicoId).select('preco titulo');
    const colaboradorDb = await Colaborador.findById(colaboradorIdExtracted).select('_id');

    // CRIAR O AGENDAMENTO E AS TRANSAÇÕES
    let agendamento = {
      clienteId,
      salaoId,
      servicoId,
      colaboradorId: colaboradorIdExtracted, // Apenas o ID do colaborador
      data: dataAgendamento, // Mantendo a data em UTC no banco de dados
      valor: servico.preco,
    };

    await new Agendamento(agendamento).save();

    res.json({
      error: false,
      message: `Agendamento criado com sucesso`
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});



router.post('/dias-disponiveis', async (req, res) => {
  try {
    const {
      salaoId,
      servicoId,
      data
    } = req.body;

    // Normaliza a data para UTC
    const startOfToday = moment.tz(data || new Date(), CLIENT_TIMEZONE).startOf('day').utc();
    const endOfNextDays = moment.tz(data || new Date(), CLIENT_TIMEZONE).add(28, 'days').endOf('day').utc();

    const horarios = await Horario.find({
      salaoId,
      inicio: {
        $gte: startOfToday.toDate()
      },
      fim: {
        $lte: endOfNextDays.toDate()
      },
    });

    // Converte horários do servidor para o timezone do cliente
    const horariosNormalizados = horarios.map(horario => ({
      ...horario.toObject(),
      inicio: moment.utc(horario.inicio).tz(CLIENT_TIMEZONE).format('HH:mm'),
      fim: moment.utc(horario.fim).tz(CLIENT_TIMEZONE).format('HH:mm'),
    }));

    res.json({
      error: false,
      horarios: horariosNormalizados
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: true,
      message: 'Erro ao buscar dias disponíveis'
    });
  }
});


router.post('/horas-disponiveis', async (req, res) => {
  try {
    const {
      colaboradorId,
      salaoId,
      servicoId,
      data
    } = req.body;

    if (!colaboradorId || !salaoId || !servicoId || !data) {
      return res.status(400).json({
        error: true,
        message: 'Campos obrigatórios não informados'
      });
    }

    // Normaliza a data recebida para UTC
    const diaSolicitado = moment.tz(data, CLIENT_TIMEZONE).startOf('day').utc();
    const numeroDiaSemana = diaSolicitado.isoWeekday();

    // Busca horários de atendimento configurados
    const horarios = await Horario.find({
      salaoId,
      dias: numeroDiaSemana,
      colaboradores: colaboradorId,
      especialidades: servicoId
    }).populate('colaboradores', 'nome foto');

    if (!horarios.length) {
      return res.json({
        error: false,
        message: 'Não há horários disponíveis para este dia',
        colaboradores: [],
        agenda: {}
      });
    }

    const servico = await Servico.findById(servicoId).select('duracao');
    if (!servico) {
      return res.status(404).json({
        error: true,
        message: 'Serviço não encontrado'
      });
    }

    const servicoDuracao = servico.duracao;

    // Busca agendamentos existentes
    const agendamentos = await Agendamento.find({
      salaoId,
      colaboradorId,
      status: 'A',
      data: {
        $gte: diaSolicitado.toDate(),
        $lt: moment(diaSolicitado).endOf('day').toDate()
      }
    }).select('data');

    const agenda = {};

    for (let horario of horarios) {
      const inicioUTC = util.mergeDateTime(diaSolicitado, horario.inicio).utc();
      const fimUTC = util.mergeDateTime(diaSolicitado, horario.fim).utc();

      const slots = [];
      let currentSlot = inicioUTC;

      while (currentSlot.isBefore(fimUTC)) {
        const slotFim = moment(currentSlot).add(servicoDuracao, 'minutes');

        // Verifica conflito com agendamentos
        const conflito = agendamentos.some(agendamento => {
          const agendamentoInicio = moment.utc(agendamento.data);
          const agendamentoFim = agendamentoInicio.clone().add(servicoDuracao, 'minutes');
          return currentSlot.isBefore(agendamentoFim) && slotFim.isAfter(agendamentoInicio);
        });

        if (!conflito && (!diaSolicitado.isSame(moment(), 'day') || currentSlot.isAfter(moment()))) {
          slots.push(currentSlot.tz(CLIENT_TIMEZONE).format('HH:mm'));
        }

        currentSlot.add(util.SLOT_DURATION, 'minutes');
      }

      if (slots.length) {
        if (!agenda[horario.colaboradores]) {
          agenda[horario.colaboradores] = [];
        }
        agenda[horario.colaboradores].push(...slots.map((time, index) => ({
          id: index.toString(),
          available: true,
          time
        })));
      }
    }

    // Remove duplicatas
    for (let key in agenda) {
      agenda[key] = Array.from(new Set(agenda[key].map(slot => slot.time)))
        .map(time => ({
          time,
          available: true
        }));
    }

    const colaboradores = await Colaborador.find({
      _id: colaboradorId,
      status: 'A'
    }).select('nome foto');

    const colaboradoresFormatados = colaboradores.map(c => ({
      ...c._doc,
      nome: c.nome.split(' ')[0]
    }));

    res.json({
      error: false,
      colaboradores: colaboradoresFormatados,
      agenda
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: true,
      message: 'Erro ao buscar horários disponíveis'
    });
  }
});




const {
  isValidObjectId
} = mongoose;

router.get('/agendamentos/:clienteId', async (req, res) => {
  try {
    const {
      clienteId
    } = req.params;

    console.log(`Buscando agendamentos para o cliente: ${clienteId}`);

    // Verifique se o ID é válido
    if (!isValidObjectId(clienteId)) {
      return res.status(400).json({
        error: true,
        message: 'ID do cliente inválido.'
      });
    }

    // Verifique se o cliente existe
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({
        error: true,
        message: 'Cliente não encontrado.'
      });
    }

    // Obter a data e hora atuais
    const now = moment().utc().subtract(3, "hour");
    console.log(now)
    // Buscar os agendamentos futuros para o cliente
    const agendamentos = await Agendamento.find({
        clienteId,
        data: {
          $gte: now
        } // Filtra agendamentos cuja data é maior ou igual à data atual
      })
      .populate([{
          path: 'servicoId',
          select: 'titulo duracao'
        },
        {
          path: 'colaboradorId',
          select: 'nome'
        },
        {
          path: 'salaoId',
          select: 'nome telefone'
        }
      ]);

    // Resposta da API
    return res.status(200).json({
      error: false,
      agendamentos
    });

  } catch (err) {
    console.error('Erro ao buscar agendamentos:', err);

    return res.status(500).json({
      error: true,
      message: 'Erro ao buscar agendamentos. Por favor, tente novamente mais tarde.'
    });
  }
});


router.put('/:id', async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      agendamentoInfo,
      data
    } = req.body;
    const clienteId = req.body.clienteId
    const salaoId = req.body.salaoId
    const servicoId = req.body.servicoId
    const colaboradorId = req.body.colaboradorId


    let parsedDate = moment.utc(data).add("3", "h");
    console.log(parsedDate)

    // Valida se a data é válida
    if (!parsedDate.isValid()) {
      console.log("Data inválida:", data);
      return res.json({
        error: true,
        message: "Data de agendamento inválida."
      });
    }


    // Converta a data para UTC antes de salvar no banco de dados
    const dataAgendamento = parsedDate.utc().toISOString();
    const diaDaSemana = parsedDate.day();

    // Verifique se o agendamento existe
    const agendamentoExistente = await Agendamento.findById(id);
    if (!agendamentoExistente) {
      return res.json({
        error: true,
        message: "Agendamento não encontrado."
      });
    }

    // Recupere os horários do salão
    const horarios = await Horario.find({
      salaoId
    });
    if (!horarios.length) {
      return res.json({
        error: true,
        message: "Nenhum horário disponível para o salão."
      });
    }

    // Verifique se há horário disponível no dia e no horário selecionado
    const horarioDisponivel = horarios.some(horario => {
      const inicioHorario = moment.utc(horario.inicio);
      const fimHorario = moment.utc(horario.fim);
      const agendamentoHorario = moment.utc(parsedDate);

      if (fimHorario.isBefore(inicioHorario)) {
        console.warn(`Horário de fim inválido para o horário ID ${horario._id}: fim é antes do início.`);
        return false;
      }

      const horaDentroIntervalo = agendamentoHorario.isBetween(inicioHorario, fimHorario, null, '[)');
      const diaDisponivel = horario.dias.includes(diaDaSemana);

      return horaDentroIntervalo && diaDisponivel;
    });

    if (!horarioDisponivel) {
      return res.json({
        error: true,
        message: `Este horário não está disponível para agendamentos.`
      });
    }

    // Verifique se já existe um agendamento para o colaborador e data (excluindo o agendamento atual)
    const conflitoAgendamento = await Agendamento.findOne({
      _id: {
        $ne: id
      },
      colaboradorId,
      data: {
        $gte: moment(parsedDate).startOf('minute').utc().toISOString(),
        $lt: moment(parsedDate).add(1, 'hour').startOf('minute').utc().toISOString()
      }
    });

    if (conflitoAgendamento) {
      return res.json({
        error: true,
        message: `Este horário já está reservado para outro cliente.`
      });
    }

    // Atualize o agendamento
    agendamentoExistente.clienteId = clienteId;
    agendamentoExistente.salaoId = salaoId;
    agendamentoExistente.servicoId = servicoId;
    agendamentoExistente.colaboradorId = colaboradorId;
    agendamentoExistente.data = dataAgendamento;
    agendamentoExistente.valor = (await Servico.findById(servicoId)).preco;

    await agendamentoExistente.save();

    res.json({
      error: false,
      message: `Agendamento atualizado com sucesso.`
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});




module.exports = router;