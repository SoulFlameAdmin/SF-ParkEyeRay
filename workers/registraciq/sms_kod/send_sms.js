const twilio = require('twilio');
const config = require('./config');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const client = twilio(config.accountSid, config.authToken);

const phoneNumber = process.argv[2]; // номер от команден ред
if (!phoneNumber) {
  console.error('Моля, въведете телефонен номер');
  process.exit(1);
}

const code = generateCode();

client.messages
  .create({
     body: `${config.brandName}: Вашият код за регистрация е ${code}`,
     from: config.fromNumber,
     to: phoneNumber
   })
  .then(message => {
    console.log('SMS изпратен успешно:', message.sid);
    // Тук можеш да запазиш кода в база данни за по-късна проверка
  })
  .catch(err => console.error('Грешка при изпращане на SMS:', err));
