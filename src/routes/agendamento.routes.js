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
})

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
      colaboradorId,
      salaoId,
      servicoId,
      data = moment().utcOffset()
    } = req.body;

    const startOfToday = moment.utc().startOf('week').toDate();
    const endOfNextDays = moment.utc().add(28, 'days').endOf('day').toDate();


    const horarios = await Horario.find({
      salaoId,
      inicio: {
        $gte: startOfToday
      },
      fim: {
        $lte: endOfNextDays
      }
    });

    const servico = await Servico.findById(servicoId).select('duracao');
    const servicoDuracao = util.hourToMinutes(moment(servico.duracao).format('HH:mm'));

    const agendamentos = await Agendamento.find({
      salaoId,
      servicoId,
      data: {
        $gte: moment().startOf('day').toDate(),
        $lte: moment().add(7, 'days').endOf('day').toDate()
      }
    }).populate('servico', 'duracao');

    let agenda = [];
    let colaboradores = [];
    let lastDay = moment(data).toDate();

    // Loop para encontrar 7 dias com horários disponíveis
    for (let i = 0; i <= 365 && agenda.length < 7; i++) {
      const espacosValidos = horarios.filter((h) => {
        const diaSemanaDisponivel = h.dias.includes(moment(lastDay).day());
        const servicosDisponiveis = h.especialidades.includes(servicoId);
        const diaDentroDoIntervalo = moment(lastDay).isBetween(
          moment(h.inicio),
          moment(h.fim),
          'day',
          '[]'
        );

        return diaSemanaDisponivel && servicosDisponiveis && diaDentroDoIntervalo;
      });

      if (espacosValidos.length > 0) {
        let todosHorariosDia = {};
        let horarioDisponivel = false;

        for (let espaco of espacosValidos) {
          for (let colaborador of espaco.colaboradores) {
            if (colaborador.toString() !== colaboradorId) continue;

            if (!todosHorariosDia[colaborador]) {
              todosHorariosDia[colaborador] = [];
            }

            const slots = util.sliceMinutes(
              util.mergeDateTime(lastDay, espaco.inicio),
              util.mergeDateTime(lastDay, espaco.fim),
              util.SLOT_DURATION
            );

            const agendamentosDia = agendamentos.filter(agendamento =>
              moment.utc(agendamento.data).isSame(lastDay, 'day')
            );

            const slotsDisponiveis = slots.map((slot, index) => {
              const slotInicio = moment(slot, "HH:mm");
              const slotFim = slotInicio.clone().add(servicoDuracao, 'minutes');

              const isOcupado = agendamentosDia.some(agendamento => {
                const agendamentoInicio = moment(agendamento.data);
                const agendamentoFim = agendamentoInicio.clone().add(servicoDuracao, 'minutes');

                return slotInicio.isBefore(agendamentoFim) && slotFim.isAfter(agendamentoInicio);
              });

              if (!isOcupado) horarioDisponivel = true;

              return {
                id: `${index}`,
                available: !isOcupado,
                time: slotInicio.format("HH:mm"),
              };
            });

            todosHorariosDia[colaborador] = [
              ...todosHorariosDia[colaborador],
              ...slotsDisponiveis
            ];
          }
        }

        // Adiciona o dia na agenda se houver pelo menos um horário disponível
        if (horarioDisponivel) {
          agenda.push({
            [moment(lastDay).format('YYYY-MM-DD')]: todosHorariosDia
          });
        }
      }

      lastDay = moment(lastDay).add(1, 'day');
    }

    colaboradores = await Colaborador.find({
      _id: colaboradorId
    }).select('nome foto');
    colaboradores = colaboradores.map(c => ({
      ...c._doc,
      nome: c.nome.split(' ')[0]
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

router.post('/horas-disponiveis', async (req, res) => {
  try {
    const {
      colaboradorId,
      salaoId,
      servicoId,
      data
    } = req.body;

    // Validação dos campos obrigatórios
    if (!colaboradorId || !salaoId || !servicoId || !data) {
      return res.status(400).json({
        error: true,
        message: 'Campos obrigatórios não informados'
      });
    }

    // Normaliza a data para início do dia
    const diaSolicitado = moment.utc(data);
    const numeroDiaSemana = diaSolicitado.day();

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

    // Busca a duração do serviço
    const servico = await Servico.findById(servicoId).select('duracao');
    if (!servico) {
      return res.status(404).json({
        error: true,
        message: 'Serviço não encontrado'
      });
    }

    const servicoDuracao = servico.duracao;
    console.log(`Duração do serviço: ${servicoDuracao} minutos`);

    // Busca agendamentos existentes
    const agendamentos = await Agendamento.find({
      salaoId,
      colaboradorId,
      status: 'A',
      data: {
        $gte: diaSolicitado.toDate(),
        $lt: moment(diaSolicitado).endOf('day').toDate()
      }
    }).select('data servicoId');

    console.log("Agendamentos existentes:", agendamentos);

    // Monta a agenda do dia
    let agenda = {};
    let todosHorariosDia = {};

    function sliceMinutesAndVerification(start, end, duration, agendamentos, servicoDuracao, validation = true) {
      let slices = [];
      start = moment(start);
      end = moment(end);

      while (end > start) {
        if (validation && start.isSame(moment(), 'day') && start.isBefore(moment())) {
          // Não adiciona slots passados se for o dia atual
          start = start.add(duration, 'minutes');
          continue;
        }

        // Verifica se o horário está ocupado
        const slotFim = moment(start).add(servicoDuracao, 'minutes');
        const conflito = agendamentos.some(agendamento => {
          const agendamentoInicio = moment(agendamento.data).utc();
          const agendamentoFim = agendamentoInicio.clone().add(servicoDuracao, 'minutes');

          return start.isBefore(agendamentoFim) && slotFim.isAfter(agendamentoInicio);
        });

        // Se não houver conflito, adiciona o slot
        if (!conflito) {
          slices.push(start.format('HH:mm'));
        }

        start = start.add(duration, 'minutes');
      }
      return slices;
    }

    for (let horario of horarios) {
      // Gera os slots de horário
      const slots = sliceMinutesAndVerification(
        util.mergeDateTime(diaSolicitado, horario.inicio),
        util.mergeDateTime(diaSolicitado, horario.fim),
        util.SLOT_DURATION,
        agendamentos, // Passa os agendamentos existentes
        servicoDuracao, // Passa a duração do serviço
        diaSolicitado.isSame(moment(), 'day') // Validação apenas para o dia atual
      );

      console.log("Slots gerados:", slots);

      const slotsDisponiveis = slots.filter(slot => {
        const slotInicio = moment.utc(`${diaSolicitado.format('YYYY-MM-DD')}T${slot}`);
        const slotFim = slotInicio.clone().add(servicoDuracao, 'minutes');


        // Verifica se o horário está ocupado
        const conflito = agendamentos.some(agendamento => {
          console.log(moment(agendamento.data).utc())
          const agendamentoInicio = moment(agendamento.data).utc();
          const agendamentoFim = agendamentoInicio.clone().add(servicoDuracao, 'minutes');

          return slotInicio.isBefore(agendamentoFim) && slotFim.isAfter(agendamentoInicio);

        });
        console.log()
        // Verifica se o slot termina antes do fim do expediente
        const fimExpediente = moment(util.mergeDateTime(diaSolicitado, horario.fim));
        return !conflito && slotFim.isSameOrBefore(fimExpediente);
      });

      console.log("Slots disponíveis:", slotsDisponiveis);

      // Formata os slots disponíveis
      const slotsFormatados = slotsDisponiveis.map((slot, index) => ({
        id: index.toString(),
        available: true,
        time: slot
      }));

      if (slotsFormatados.length) {
        if (!todosHorariosDia[colaboradorId]) {
          todosHorariosDia[colaboradorId] = [];
        }
        todosHorariosDia[colaboradorId].push(...slotsFormatados);
      }
    }

    // Remove duplicatas mantendo a ordem
    for (let id in todosHorariosDia) {
      todosHorariosDia[id] = Array.from(
        new Map(todosHorariosDia[id].map(slot => [slot.time, slot])).values()
      ).sort((a, b) => moment(a.time, 'HH:mm').diff(moment(b.time, 'HH:mm')));
    }

    // Adiciona à agenda
    if (Object.keys(todosHorariosDia).length) {
      agenda[diaSolicitado.format('YYYY-MM-DD')] = todosHorariosDia;
    }

    // Busca informações dos colaboradores
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