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
  try {
    const {
      clienteId,
      salaoId,
      servicoId,
      colaboradorId,
      data
    } = req.body;

    // Log da data recebida
    console.log("corpo da requisição: " + data);

    // Parse da data de agendamento e conversão para o fuso horário local (America/Sao_Paulo)
    let parsedDate = moment.utc(data);
    console.log("dataParseada (Local): " + parsedDate.format());

    if (!parsedDate.isValid()) {
      return res.json({
        error: true,
        message: "Data de agendamento inválida."
      });
    }

    // Converta a data para o formato ISO
    const dataAgendamento = parsedDate.toISOString();
    console.log("dataAgendamento (UTC): " + dataAgendamento);

    // Obtenha o dia da semana (0-6), onde 0 = domingo e 6 = sábado
    const diaDaSemana = parsedDate.day();
    console.log("dia da semana: " + diaDaSemana);

    // Recupere os horários do salão
    const horarios = await Horario.find({
      salaoId
    });
    console.log("horarios do Salao: ", horarios);

    if (!horarios.length) {
      return res.json({
        error: true,
        message: "Nenhum horário disponível para o salão."
      });
    }

    // Verifique se há horário disponível no dia e no horário selecionado
    console.log(horarios)
    const horarioDisponivel = horarios.some(horario => {
      const inicioHorario = moment(horario.inicio).utc();
      const fimHorario = moment(horario.fim).utc();
      const agendamentoHorario = moment(parsedDate).utc(); // Certifique-se de que parsedDate está em UTC
    
      // Verifique se o horário de fim é posterior ao horário de início
      if (fimHorario.isBefore(inicioHorario)) {
        console.warn(`Horário de fim inválido para o horário ID ${horario._id}: fim é antes do início.`);
        return false; // Retorna false se o horário é inválido
      }
    
      console.log("Início do horário (UTC): ", inicioHorario.format());
      console.log("Fim do horário (UTC): ", fimHorario.format());
      console.log("Horário do agendamento (UTC): ", agendamentoHorario.format());
    
      // Extrair apenas as horas e minutos para comparação
      const horaInicio = inicioHorario.hour() * 60 + inicioHorario.minute();
      const horaFim = fimHorario.hour() * 60 + fimHorario.minute();
      const horaAgendamento = agendamentoHorario.hour() * 60 + agendamentoHorario.minute();
    
      const horaDentroIntervalo = horaAgendamento >= horaInicio && horaAgendamento < horaFim;
    
      const diaDisponivel = horario.dias.includes(diaDaSemana);
    
      console.log("Horário dentro do intervalo: ", horaDentroIntervalo);
      console.log("Dia disponível: ", diaDisponivel);
    
      return horaDentroIntervalo && diaDisponivel;
    });
    

    // Resultado final
    console.log("Disponibilidade do horário: ", horarioDisponivel);





    // Se não houver horário disponível
    if (!horarioDisponivel) {
      return res.json({
        error: true,
        message: "Este horário não está disponível para agendamentos."
      });
    }

    // Prosseguir com a criação do agendamento
    const cliente = await Cliente.findById(clienteId).select('nome endereco');
    const salao = await Salao.findById(salaoId).select('_id');
    const servico = await Servico.findById(servicoId).select('preco titulo');
    const colaborador = await Colaborador.findById(colaboradorId).select('_id');
    console.log(dataAgendamento)
    // CRIAR O AGENDAMENTO E AS TRANSAÇÕES
    let agendamento = {
      ...req.body,
      data: dataAgendamento, // Mantendo o formato ISO (UTC)
      valor: servico.preco,
    };

    await new Agendamento(agendamento).save();

    res.json({
      error: false,
      message: "Agendamento criado com sucesso."
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