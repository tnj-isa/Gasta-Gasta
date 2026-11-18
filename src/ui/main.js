import { mount } from './app.js';
import './instalacao.js'; // começa a escutar o aviso de instalação do Chrome

mount(document.getElementById('app'));

// Guarda o app no celular para abrir sem internet. Se falhar, o app continua funcionando online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
