// Тук е примерна проверка на код, ако е запазен в база данни
const inputCode = process.argv[2];
const savedCode = '123456'; // Това трябва да е кода от изпратения SMS

if (inputCode === savedCode) {
  console.log('✅ Кодът е верен. Регистрацията е успешна.');
} else {
  console.log('❌ Грешен код.');
}