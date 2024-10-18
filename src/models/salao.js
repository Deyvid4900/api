const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const salaoSchema = new Schema({
  nome: String,
  foto: String,
  capa: String,
  email: String,
  senha: String,
  telefone: String,
  endereco: {
    cidade: String,
    uf: String,
    cep: String,
    logradouro: String,
    numero: String,
    pais: String,
  },
  geo: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' },
  },
  dataCadastro: {
    type: Date,
    default: Date.now,
  },
  plano: {
    type: String,
    enum: ['básico', 'gold', 'premium', 'teste',"master"], // Define os valores permitidos
    required: true // Campo obrigatório
  }
});

salaoSchema.index({ coordenadas: '2dsphere' });


module.exports = mongoose.model('Salao', salaoSchema);
