import { mount } from './app.js';
import './atualizacao.js'; // começa a escutar a chegada de versão nova (antes de registrar o service worker)
import './instalacao.js'; // começa a escutar o aviso de instalação do Chrome

mount(document.getElementById('app'));

// Guarda o app no celular para abrir sem internet. Se falhar, o app continua funcionando online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
