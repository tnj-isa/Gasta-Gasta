# Leitor de texto de imagens (Tesseract.js), guardado dentro do app

Estes arquivos fazem o app ler o texto de uma foto de nota **no próprio celular, sem internet e sem
enviar a foto para lugar nenhum**. Eles vêm prontos de pacotes públicos do npm e não foram alterados.

| Arquivo | Pacote (versão) | Licença |
|---|---|---|
| `tesseract.esm.min.js`, `worker.min.js`, `LICENSE.md`, `worker.min.js.LICENSE.txt` | `tesseract.js` 7.0.0 | Apache-2.0 |
| `core/tesseract-core-lstm.wasm.js`, `core/tesseract-core-simd-lstm.wasm.js`, `core/tesseract-core-relaxedsimd-lstm.wasm.js` | `tesseract.js-core` 7.0.0 | Apache-2.0 |
| `lang/por.traineddata.gz` (português, versão `4.0.0_best_int`) | `@tesseract.js-data/por` 1.0.0 (dados do projeto tessdata_best, Apache-2.0) | MIT / Apache-2.0 |

O motor existe em três versões (do mais moderno ao mais antigo): o app escolhe sozinho a que o celular
suporta. Todas ficam guardadas para o app funcionar em qualquer celular, no total cerca de 13 MB.

## Como foram obtidos (para atualizar no futuro)

```
npm install tesseract.js@7.0.0 @tesseract.js-data/por
cp node_modules/tesseract.js/dist/{tesseract.esm.min.js,worker.min.js,worker.min.js.LICENSE.txt} vendor/tesseract/
cp node_modules/tesseract.js/LICENSE.md vendor/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-{lstm,simd-lstm,relaxedsimd-lstm}.wasm.js vendor/tesseract/core/
cp node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz vendor/tesseract/lang/
```

Depois de mudar qualquer arquivo daqui, rode `npm test`: ele confere se todos estão na lista do
`sw.js` e atualiza o número da versão do cache.
