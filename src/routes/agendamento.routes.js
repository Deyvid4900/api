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


router.post('/', async (req, res) => {
  try {
    const {
      clienteId,
      salaoId,
      servicoId,
      colaboradorId,
      data
    } = req.body;

    // Exibe a data recebida para depuração
    console.log("Data recebida:", data);

    // Parse da data de agendamento e conversão para o fuso horário local (America/Sao_Paulo)
    let parsedDate = moment.tz(data, 'America/Sao_Paulo');

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
      const inicioHorario = moment(horario.inicio).tz('America/Sao_Paulo');
      const fimHorario = moment(horario.fim).tz('America/Sao_Paulo');
      const agendamentoHorario = moment(parsedDate).tz('America/Sao_Paulo');

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
      colaboradorId,
      data: {
        $gte: moment(parsedDate).startOf('minute').utc().toISOString(),
        $lt: moment(parsedDate).add(1, 'hour').startOf('minute').utc().toISOString()
      }
    });

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
    const colaborador = await Colaborador.findById(colaboradorId).select('_id');

    // CRIAR O AGENDAMENTO E AS TRANSAÇÕES
    let agendamento = {
      ...req.body,
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
      colaboradorId, // Recebe colaboradorId no request
      salaoId,
      servicoId,
      data = moment().utcOffset()
    } = req.body;

    const startOfToday = moment.utc().startOf('week').toDate();
    const endOfNext7Days = moment.utc().add(7, 'days').endOf('week').toDate();

    const horarios = await Horario.find({
      salaoId,
      inicio: {
        $gte: startOfToday
      },
      fim: {
        $lte: endOfNext7Days
      }
    });

    const servico = await Servico.findById(servicoId).select('duracao');

    // Buscando os agendamentos já existentes para o salão e serviço
    const agendamentos = await Agendamento.find({
      salaoId,
      servicoId,
      data: {
        $gte: moment().startOf('day').toDate(),
        $lte: moment().add(7, 'days').endOf('day').toDate()
      }
    });

    let agenda = [];
    let colaboradores = [];
    let lastDay = moment(data).toDate();

    const servicoDuracao = util.hourToMinutes(moment(servico.duracao).format('HH:mm'));
    const servicoDuracaoSlots = util.sliceMinutes(
      moment(servico.duracao),
      moment(servico.duracao).add(servicoDuracao, 'minutes'),
      util.SLOT_DURATION,
      false
    ).length;

    for (let i = 0; i <= 365 && agenda.length <= 7; i++) {
      const espacosValidos = horarios.filter((h) => {
        const diaSemanaDisponivel = h.dias.includes(moment(lastDay).day());
        const servicosDisponiveis = h.especialidades.includes(servicoId);
        return diaSemanaDisponivel && servicosDisponiveis;
      });

      if (espacosValidos.length > 0) {
        let todosHorariosDia = {};

        // Filtra horários especificamente para o colaborador enviado no request
        for (let espaco of espacosValidos) {
          for (let colaborador of espaco.colaboradores) {
            if (colaborador._id.toString() !== colaboradorId) continue; // Filtra colaborador

            if (!todosHorariosDia[colaborador._id]) {
              todosHorariosDia[colaborador._id] = [];
            }

            // Gerar os blocos de horários com base no início e fim
            const slots = util.sliceMinutes(
              util.mergeDateTime(lastDay, espaco.inicio),
              util.mergeDateTime(lastDay, espaco.fim),
              util.SLOT_DURATION
            );

            const agendamentosDia = agendamentos.filter(agendamento => {
              const agendamentoData = moment(agendamento.data).utc();
              return agendamentoData.isSame(lastDay, 'day');
            });

            // Verificar se os slots se sobrepõem com os agendamentos já existentes
            const slotsDisponiveis = slots.filter((slot) => {
              const slotInicio = moment(slot, "HH:mm");
              const slotFim = moment(slot, "HH:mm").add(servicoDuracao, 'minutes');

              return !agendamentosDia.some(agendamento => {
                const agendamentoInicio = moment(agendamento.data);
                const agendamentoFim = moment(agendamento.data).add(servicoDuracao, 'minutes');

                return (
                  (slotInicio.isBefore(agendamentoFim) && slotFim.isAfter(agendamentoInicio))
                );
              });
            });

            todosHorariosDia[colaborador._id] = [
              ...todosHorariosDia[colaborador._id],
              ...slotsDisponiveis.map((slot, index) => ({
                id: `${index}`,
                available: true,
                time: moment(slot, "HH:mm").format("HH:mm"), // Adiciona 3 horas ao slot
              }))
            ];
          }
        }

        if (Object.keys(todosHorariosDia).length > 0) {
          agenda.push({
            [moment(lastDay).format('YYYY-MM-DD')]: todosHorariosDia
          });
        }
      }

      lastDay = moment(lastDay).add(1, 'day');
    }

    colaboradores = await Colaborador.find({
      _id: colaboradorId, // Busca colaborador específico
    }).select('nome foto');

    colaboradores = colaboradores.map((c) => ({
      ...c._doc,
      nome: c.nome.split(' ')[0],
    }));

    res.json({
      error: false,
      colaboradores,
      agenda,
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message,
    });
  }
});




router.get('/agendamentos/:clienteId', async (req, res) => {
  try {
    const {
      clienteId
    } = req.params;

    // Verifique se o cliente existe
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({
        error: true,
        message: 'Cliente não encontrado.'
      });
    }

    // Obter a data e hora atuais
    const now = new Date();

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

    res.json({
      error: false,
      agendamentos
    });

  } catch (err) {
    res.status(500).json({
      error: true,
      message: err.message
    });
  }
});



module.exports = router;