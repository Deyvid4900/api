const moment = require('moment');


module.exports = {
  SLOT_DURATION: 30, // MINUTOS
  isOpened: async (horarios) => {
    // VERIFICANDO SE EXISTE REGISTRO NAQUELE DIA DA SEMANA
    const today = moment();
    console.log(today);
  
    const horariosDia = horarios.filter((h) => h.dias.includes(today.day()));
  
    if (horariosDia.length > 0) {
      // VERIFICANDO HORÁRIOS
      for (let h of horariosDia) {
        // Transformando `inicio` e `fim` para o formato 'HH:mm' (somente horas)
        const inicio = moment(h.inicio, 'HH:mm').utcOffset(0).format('HH:mm');
        const fim = moment(h.fim, 'HH:mm').utcOffset(0).format('HH:mm');
  
        // Obtendo o horário atual no formato 'HH:mm'
        const agora = today.format('HH:mm');
  
        console.log('Horário de Início:', inicio, 'Horário de Fim:', fim, 'Agora:', agora);
  
        // Comparando o horário atual com `inicio` e `fim`
        if (agora >= inicio && agora <= fim) {
          return true;
        }
      }
      return false;
    }
    return false;
  },
  

  
  
  toCents: (price) => {
    return parseInt(price.toString().replace('.', '').replace(',', ''));
  },
  mergeDateTime: (date, time) => {
    const merged = `${moment(date).format('YYYY-MM-DD')}T${moment(time).add('3','h').format(
      'HH:mm'
    )}`;
    console.log(merged)
    //console.log(merged);
    return merged;
  },
  sliceMinutes: (start, end, duration, validation = true) => {
    let slices = [];
    count = 0;

    const now = moment();
    start = moment(start);
    end = moment(end);

    while (end > start) {
      if (
        start.format('YYYY-MM-DD') === now.format('YYYY-MM-DD') &&
        validation
      ) {
        if (start.isAfter(now)) {
          slices.push(start.format('HH:mm'));
        }
      } else {
        slices.push(start.format('HH:mm'));
      }

      start = start.add(duration, 'minutes');
      count++;
    }
    return slices;
  },
  sliceMinutesAndVerication: (start, end, duration, validation = true) => {
    let slices = [];
    count = 0;

    const now = moment();
    start = moment(start);
    end = moment(end);

    while (end > start) {
      if (
        start.format('YYYY-MM-DD') === now.format('YYYY-MM-DD') &&
        validation
      ) {
        if (start.isAfter(now)) {
          slices.push(start.format('HH:mm'));
        }
      } else {
        slices.push(start.format('HH:mm'));
      }

      start = start.add(duration, 'minutes');
      count++;
    }
    return slices;
  },
  hourToMinutes: (hourMinute) => {
    const [hour, minutes] = hourMinute.split(':');
    return parseInt(parseInt(hour) * 60 + parseInt(minutes));
  },
  splitByValue: (array, value) => {
    let newArray = [
      []
    ];
    array.forEach((item) => {
      if (item !== value) {
        newArray[newArray.length - 1].push(item);
      } else {
        newArray.push([]);
      }
    });
    return newArray;
  },
};