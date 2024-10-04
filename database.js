// Carregar variáveis de ambiente do arquivo .env
require('dotenv').config();

const mongoose = require('mongoose');

// Acessar variáveis de ambiente
const mongoUri = process.env.MONGO_URL;
const port = process.env.PORT || 8000;

if (!mongoUri) {
  throw new Error('A variável de ambiente MONGO_URL não está definida');
}

// Conectar ao MongoDB
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex:true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

mongoose.connection.on('connected', () => {
  console.log('Conectado ao MongoDB!');
});

mongoose.connection.on('error', (err) => {
  console.error('Erro ao conectar ao MongoDB:', err);
});

