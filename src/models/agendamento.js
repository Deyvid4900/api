const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const agendamento = new Schema({
  clienteId: {
    type: mongoose.Types.ObjectId,
    ref: 'Cliente',
    required: true,
  },
  salaoId: {
    type: mongoose.Types.ObjectId,
    ref: 'Salao',
    required: true,
  },
  servicoId: {
    type: mongoose.Types.ObjectId,
    ref: 'Servico',
    required: true,
  },
  colaboradorId: {
    type: mongoose.Types.ObjectId,
    ref: 'Colaborador',
    required: true,
  },
  data: {
    type: Date,
    required: true,
  },
  valor: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['A', 'I'],
    required: true,
    default: 'A',
  },
  dataCadastro: {
    type: Date,
    default: Date.now,
  },
  pago: {
    type: String,
    enum:['S','N'],
    default:'N'
  },
});

module.exports = mongoose.model('Agendamento', agendamento);
