# Gerador de Comunicados PNG

## Como trocar ou adicionar artes
### Trocar uma imagem existente
1. Vá para a pasta `assets/imagens/`
2. Substitua o arquivo existente pelo novo (mantendo o mesmo nome), por exemplo:
   - `atencao.svg`
   - `manutencao.svg`
   - `normalizado.svg`

### Adicionar uma nova imagem ao dropdown
1. Coloque o novo arquivo dentro de `assets/imagens/`
   - exemplo: `queda_rede.png`
2. Abra o arquivo `config-imagens.js`
3. Adicione uma nova entrada no array `window.COMUNICADO_IMAGES`

Exemplo:
```js
,{
  id: 'queda_rede',
  label: 'Queda de rede',
  src: 'assets/imagens/queda_rede.png'
}
```

## Upload manual
Se você não quiser cadastrar a imagem no projeto, selecione no dropdown:
- **Outro (upload de imagem)**

## Observação
- Se um campo estiver vazio, ele **não aparece** no comunicado.
- Se a imagem configurada não for encontrada, a prévia mostra um aviso dentro da área da imagem.
