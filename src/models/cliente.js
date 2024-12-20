const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cliente = new Schema({
  nome: {
    type: String,
    required: true,
  },
  telefone: {
    type: String,
    required: false,
    unique: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
  },
  senha: {
    type: String,
    default: null,
  },
  dataNascimento: {
    type: String,
    required: false,
  },
  sexo: {
    type: String,
    enum: ['M', 'F'],
    required: false,
  },
  status: {
    type: String,
    enum: ['A', 'I'],
    required: true,
    default: 'A',
  },
  documento: {
    tipo: {
      type: String,
      enum: ['cpf', 'cnpj'],
      required: false,
    },
    numero: {
      type: String,
      required: false,
    },
    required: false,
  },
  endereco: {
    cidade: String,
    uf: String,
    cep: String,
    logradouro: String,
    numero: String,
    pais: String,
    required: false,
  },
  dataCadastro: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Cliente', cliente);
