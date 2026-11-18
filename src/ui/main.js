import { mount } from './app.js';

mount(document.getElementById('app'));

// Guarda o app no celular para abrir sem internet. Se falhar, o app continua funcionando online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
