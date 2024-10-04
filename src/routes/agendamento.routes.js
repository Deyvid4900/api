const express = require('express');
const router = express.Router();
const Horario = require('../models/horario');
const Agendamento = require('../models/agendamento');
const Cliente = require('../models/cliente');
const Salao = require('../models/salao');
const Servico = require('../models/servico');
const Colaborador = require('../models/colaborador');

const moment = require('moment');
const mongoose = require('mongoose');
const _ = require('lodash');

// const pagarme = require('../services/pagarme');
const keys = require('../data/keys.json');
const util = require('../util');

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
  const db = mongoose.connection;

  try {
    const {
      clienteId,
      salaoId,
      servicoId,
      colaboradorId,
      data // A data do agendamento que você deseja verificar
    } = req.body;
    // Log para ver a data recebida

    // Tente analisar a data com Moment.js
    let parsedDate = moment(data); // Alterado de const para let

    // Se a data ainda for inválida, tente usar um formato explícito
    if (!parsedDate.isValid()) {
      console.log("Tentando analisar com formato específico");
      const formatoEsperado = "YYYY-MM-DDTHH:mm:ssZ"; // Ajuste conforme necessário
      parsedDate = moment(data, formatoEsperado); // Aqui, use parsedDate
    }

    // Verifique se a data é válida
    if (!parsedDate.isValid()) {
      return res.json({
        error: true,
        message: "Data de agendamento inválida."
      });
    }

    // Converta para um objeto Date
    const dataAgendamento = parsedDate.toDate(); // Converta para Date

    // Obtenha o dia da semana (0-6), onde 0 = domingo e 6 = sábado
    const diaDaSemana = parsedDate.day();

    // Recupere os horários do salão
    const horarios = await Horario.find({
      salaoId
    }); // Ajuste conforme seu modelo de horários

    console.log(horarios)
    const horarioDisponivel = horarios.map(horario => {
      // Extrai as horas dos horários no formato 'HH:mm'
      const dataAgendamentoo = moment(dataAgendamento).format('HH:mm');
      const inicioHorario = moment(horario.inicio).format('HH:mm');
      const fimHorario = moment(horario.fim).format('HH:mm');
    
      console.log("Horário do agendamento:", dataAgendamentoo);
      console.log("Início do horário:", inicioHorario);
      console.log("Fim do horário:", fimHorario);
    
      // Comparação correta: verifica se a dataAgendamento está entre inicio e fim
      let horaDisponivel = false;
      if (dataAgendamentoo >= inicioHorario && dataAgendamentoo <= fimHorario) {
        horaDisponivel = true;
      }
    
      console.log("Horário disponível:", horaDisponivel);
    
      return horaDisponivel;
    });
    


    if (!horarioDisponivel) {
      return res.json({
        error: true,
        message: "Este horário não esta disponível para agendamentos."
      });
    }



    const diaDisponivel = horarios.some(horario => {
      return horario.dias.includes(diaDaSemana);
    });

    if (!diaDisponivel) {
      return res.json({
        error: true,
        message: "O dia selecionado não está disponível para agendamentos."
      });
    }

    const cliente = await Cliente.findById(clienteId).select('nome endereco');
    const salao = await Salao.findById(salaoId).select('_id');
    const servico = await Servico.findById(servicoId).select('preco titulo');
    const colaborador = await Colaborador.findById(colaboradorId).select('_id');

    // CRIAR O AGENDAMENTOS E AS TRANSAÇÕES
    let agendamento = req.body;
    agendamento = {
      ...agendamento,
      data: dataAgendamento, // Adicione a data convertida aqui
      valor: servico.preco,
    };
    await new Agendamento(agendamento).save();

    res.json({
      error: false
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

    const horarios = await Horario.find({
      salaoId
    });

    const servico = await Servico.findById(servicoId).select('duracao');
    let colaboradores = [];

    let agenda = [];
    let lastDay = moment(data);

    // DURAÇÃO DO SERVIÇO
    const servicoDuracao = util.hourToMinutes(
      moment(servico.duracao).format('HH:mm')
    );
    const servicoDuracaoSlots = util.sliceMinutes(
      moment(servico.duracao),
      moment(servico.duracao).add(servicoDuracao, 'minutes'),
      util.SLOT_DURATION,
      false
    ).length;

    for (let i = 0; i <= 365 && agenda.length <= 7; i++) {
      const espacosValidos = horarios.filter((h) => {
        // VERIFICAR DIA DA SEMANA
        const diaSemanaDisponivel = h.dias.includes(moment(lastDay).day());

        // VERIFICAR ESPECIALIDADE DISPONÍVEL
        const servicosDisponiveis = h.especialidades.includes(servicoId);

        return diaSemanaDisponivel && servicosDisponiveis;
      });

      if (espacosValidos.length > 0) {
        // TODOS OS HORÁRIOS DISPONÍVEIS DAQUELE DIA
        let todosHorariosDia = {};
        for (let espaco of espacosValidos) {
          for (let colaborador of espaco.colaboradores) {
            if (!todosHorariosDia[colaborador._id]) {
              todosHorariosDia[colaborador._id] = [];
            }
            todosHorariosDia[colaborador._id] = [
              ...todosHorariosDia[colaborador._id],
              ...util.sliceMinutes(
                util.mergeDateTime(lastDay, espaco.inicio),
                util.mergeDateTime(lastDay, espaco.fim),
                util.SLOT_DURATION
              ),
            ];
          }
        }

        // SE TODOS OS ESPECIALISTAS DISPONÍVEIS ESTIVEREM OCUPADOS NO HORÁRIO, REMOVER
        for (let colaboradorKey of Object.keys(todosHorariosDia)) {
          // LER AGENDAMENTOS DAQUELE ESPECIALISTA NAQUELE DIA
          const agendamentos = await Agendamento.find({
            colaboradorId: colaboradorKey,
            data: {
              $gte: moment(lastDay).startOf('day'),
              $lte: moment(lastDay).endOf('day'),
            },
          }).select('data -_id');

          // RECUPERANDO HORÁRIOS OCUPADOS
          let horariosOcupado = agendamentos.map((a) => ({
            inicio: moment(a.data),
            fim: moment(a.data).add(servicoDuracao, 'minutes'),
          }));

          horariosOcupado = horariosOcupado
            .map((h) =>
              util.sliceMinutes(h.inicio, h.fim, util.SLOT_DURATION, false)
            )
            .flat();

          // REMOVENDO TODOS OS HORÁRIOS QUE ESTÃO OCUPADOS
          let horariosLivres = util.splitByValue(
            _.uniq(
              todosHorariosDia[colaboradorKey].map((h) => {
                return horariosOcupado.includes(h) ? '-' : h;
              })
            ),
            '-'
          );

          // VERIFICANDO SE NOS HORÁRIOS CONTINUOS EXISTE SPAÇO SUFICIENTE NO SLOT
          horariosLivres = horariosLivres
            .filter((h) => h.length >= servicoDuracaoSlots)
            .flat();

          /* VERIFICANDO OS HORÁRIOS DENTRO DO SLOT 
            QUE TENHAM A CONTINUIDADE NECESSÁRIA DO SERVIÇO
          */
          console.log(horariosLivres); // Verificar o que está vindo em horariosLivres

          // Garantir que só tentamos mapear e filtrar se `slot` for um array
          horariosLivres = horariosLivres.map((slot) => {
            if (Array.isArray(slot)) {
              return slot.filter(
                (horario, index) => slot.length - index >= servicoDuracaoSlots
              );
            } else {
              console.error('Slot não é um array:', slot);
              return []; // Retorna uma array vazio para slots inválidos
            }
          });


          // SEPARANDO 2 EM 2
          horariosLivres = _.chunk(horariosLivres, 2);

          // REMOVENDO O COLABORADOR DO DIA, CASO NÃO TENHA ESPAÇOS NA AGENDA
          if (horariosLivres.length === 0) {
            todosHorariosDia = _.omit(todosHorariosDia, colaboradorKey);
          } else {
            todosHorariosDia[colaboradorKey] = horariosLivres;
          }
        }

        // VERIFICANDO SE TEM ESPECIALISTA COMA AGENDA NAQUELE DIA
        const totalColaboradores = Object.keys(todosHorariosDia).length;

        if (totalColaboradores > 0) {
          colaboradores.push(Object.keys(todosHorariosDia));
          console.log(todosHorariosDia);
          agenda.push({
            [moment(lastDay).format('YYYY-MM-DD')]: todosHorariosDia,
          });
        }
      }

      lastDay = moment(lastDay).add(1, 'day');
    }

    colaboradores = await Colaborador.find({
      _id: {
        $in: _.uniq(colaboradores.flat())
      },
    }).select('nome foto');

    colaboradores = colaboradores.map((c) => ({
      ...c._doc,
      nome: c.nome.split(' ')[0],
    }));

    res.json({
      error: false,
      colaboradores,
      agenda
    });
  } catch (err) {
    res.json({
      error: true,
      message: err.message
    });
  }
});

module.exports = router;