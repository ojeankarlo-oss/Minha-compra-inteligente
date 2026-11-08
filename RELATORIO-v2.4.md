# Relatório de implementação e homologação — v2.4

**Data:** 2026-11-08
**Branch de trabalho:** `feature/ocr-v2.4`
**Branch-base:** `main`
**Commit-base diagnosticado:** `5c8dbc5048359d7c10e055870331dd6b5a876d91`
**Commit de registro do diagnóstico inicial:** `d4c436da486774c5078a1d2c35a6515b37d749e7`

## Resultado

A v2.4 adiciona captura separada por câmera e galeria, seleção por toque da área da etiqueta, prévia do recorte e controles de contraste, brilho, ampliação e rotação manual. O OCR continua local e sem serviço pago: Tesseract.js 5 com idioma português, reutilizado entre leituras. O arquivo original não é alterado.

O parser passou a usar texto e caixas geométricas do OCR para recompor reais e centavos que aparecem separados e em tamanhos/alturas diferentes. Preços concorrentes ficam sem seleção automática e são apresentados como alternativas. Preço inconclusivo permanece vazio. A tela de revisão permite editar nome, marca, embalagem, unidade, departamento, preço e quantidade; as ações de atualizar, cadastrar e cancelar são explícitas. Sugestões não substituem produtos automaticamente. Correspondências com variantes de lactose desconhecidas/diferentes são bloqueadas e divergências relevantes de embalagem reduzem a correspondência.

A causa da falha de sincronização foi reproduzida em Firestore simulado: os objetos da lista e os snapshots usados na comparação compartilhavam referências mutáveis, de modo que a edição já aparecia no “valor anterior” e não era enviada. A comparação agora usa cópias independentes. Pendências também são reenviadas ao voltar a conexão ou reabrir/retornar ao app. Não foram alterados autenticação, regras, coleções ou formato dos documentos Firestore; marca e unidade são incorporadas aos campos textuais existentes.

O Service Worker foi versionado para v2.4.0, inclui `label-recognition.mjs` e o Firebase JS com a URL versionada utilizada pela página, remove caches antigos do aplicativo e preserva os dados locais.

## Arquivos alterados/adicionados

- `index.html` — captura, recorte e preparação da imagem, revisão editável e confirmação explícita; referências v2.4.0.
- `label-recognition.mjs` — extração local de nome/marca/embalagem/preços, tratamento geométrico de centavos e similaridade conservadora.
- `firebase-sync.js` — cópias independentes para comparação e reenvio de operações pendentes.
- `sw.js` — cache v2.4.0, precache correto do módulo Firebase e inclusão do módulo OCR.
- `tests/label-recognition.test.mjs` — testes automatizados locais.
- `DIAGNOSTICO-v2.4.md` — diagnóstico prévio e atualização com a causa reproduzida no mock.
- `RELATORIO-v2.4.md` — este relatório e instruções de homologação.

## Evidências dos testes executados

1. **Parser e similaridade:** `node --test tests/label-recognition.test.mjs` — 13 testes aprovados, 0 falhas. Inclui `R$ 5,99`, `R$ 19,90`, `129,99`, pares geométricos de reais/centavos, múltiplos preços, ausência de preço, códigos/descontos, embalagem, marca e variantes com/sem lactose.
2. **Interface móvel em Chromium (390 × 844):** passou em cópia isolada sem o módulo Firebase. Usou imagem PNG sintética e Tesseract simulado. Verificou seleção de imagem, recorte por arraste/toque, ampliação, alternativas de preço sem escolha automática, cancelamento sem salvar, cadastro somente após clique explícito e atualização somente após selecionar produto e confirmar. Nenhum erro JavaScript de página.
3. **Sincronização com Firestore mockado:** passou. Uma edição de preço gerou `setDoc` sem marcar `done`/“no carrinho”; uma falha de rede simulada manteve o valor pendente e o evento `online` o reenviou. Nenhuma autenticação ou gravação no Firebase de produção.
4. **PWA/Service Worker em Chromium local:** passou. O cache v2.4 foi ativado, o cache v2.3 foi removido, `index.html`, `firebase-sync.js?v=2.4.0` e `label-recognition.mjs` foram encontrados no precache e a página recarregou offline em modo local sem Firebase.
5. **Verificações estáticas:** `node --check` no script inline, `label-recognition.mjs`, `firebase-sync.js` e `sw.js`; manifesto JSON válido; IDs do HTML sem duplicatas e controles OCR presentes; `git diff --check` sem erros.

## Limitações e testes ainda pendentes

- Não foi fornecida uma fotografia real da etiqueta Knorr; o texto esperado foi testado com amostras sintéticas e posições geométricas, não com OCR real daquela foto. A primeira leitura real depende ainda do carregamento do Tesseract.js e do modelo de português via CDN.
- O smoke test da interface não acessou câmera física. A seleção da galeria e o recorte foram testados com arquivo sintético em Chromium móvel; captura real, foco e qualidade da imagem precisam ser avaliados no Motorola.
- A sincronização foi testada por mock, não no Firebase de produção ou entre dois aparelhos. A conexão, autenticação anônima, convites e sincronização em dois dispositivos permanecem sem homologação operacional.
- O Service Worker foi testado localmente em Chromium; a instalação Android existente e a atualização via GitHub Pages não foram testadas em um aparelho instalado.
- Marca é identificada por um vocabulário local limitado; valores fora dele permanecem para conferência/edição.

## Instruções de homologação manual no Motorola

Após o PR ser revisado e depois que a publicação de homologação for autorizada, use uma URL HTTPS de teste compatível com o caminho relativo do GitHub Pages. Não é necessário desinstalar o PWA nem limpar dados.

1. Abra a versão de homologação no Chrome do Motorola e selecione **Fotografar etiqueta**; repita com **Escolher da galeria**. Refaça uma captura e teste **Usar imagem inteira**.
2. Arraste com o dedo para recortar a etiqueta. Confira a prévia e ajuste ampliação, contraste, brilho e inclinação até o texto ficar legível.
3. Fotografe a etiqueta da Sopa Knorr Letrinhas (73 g; R$ 5,99). Compare nome, marca, embalagem, unidade, departamento e preço com o rótulo. Corrija manualmente qualquer divergência antes de confirmar.
4. Teste uma etiqueta com atacado/varejo ou dois preços: nenhuma alternativa deve ser salva sem seleção/conferência. Teste também leitura inconclusiva: o preço deve permanecer vazio.
5. Faça uma leitura e toque **Cancelar**; confirme que a lista, preço, quantidade e orçamento não mudaram. Depois teste **Confirmar cadastro novo** e **Confirmar atualização** em execuções separadas.
6. Em uma lista compartilhada de homologação, altere preço e quantidade no Motorola sem marcar “No carrinho”; verifique a atualização no segundo aparelho. Repita uma alteração durante perda temporária de conexão e confira após reconectar.
7. Em um PWA já instalado, abra a versão autorizada online para receber o Service Worker novo. Reabra o app e confira a versão v2.4, a lista local e a autenticação preservadas. Não desinstale o app e não apague armazenamento.

## Atualização após reautorização

Após a reautorização do GitHub, o push de `feature/ocr-v2.4` foi concluído e o Pull Request [#1](https://github.com/ojeankarlo-oss/Minha-compra-inteligente/pull/1) foi aberto para `main`. O commit `359b531` foi preservado na história da branch. Na verificação inicial, o GitHub ainda não reportava checks de CI para a branch; os testes locais descritos acima passaram.

## Governança

O Pull Request permanece aberto para revisão. Nenhum merge em `main`, deploy, publicação ou gravação no Firebase de produção foi realizado. Não fazer merge ou publicar sem autorização explícita.
