# Diagnóstico técnico inicial — Minha Compra Inteligente v2.4

**Data:** 2026-11-08  
**Repositório:** `ojeankarlo-oss/Minha-compra-inteligente`  
**Branch de referência:** `main`  
**Commit de referência antes das alterações:** `5c8dbc5048359d7c10e055870331dd6b5a876d91` (`Atualização v2.3 - Leitura inteligente de etiquetas.`)  
**Versão identificada:** v2.3.0 (`?v=2.3.0` em `index.html`; cache `minha-compra-v2-3-0` em `sw.js`).

## Estado observado antes da implementação

- O aplicativo é uma PWA estática, sem pipeline de build, gerenciador de dependências, diretório de testes ou testes automatizados no commit-base.
- `index.html` contém a interface, estado local em `localStorage`, renderização, reconhecimento por fotografia e revisão antes de salvar. A confirmação é local e explícita, mas a tela atual não oferece recorte, ajustes da imagem, campo de quantidade, campo de marca ou escolha explícita entre preços concorrentes.
- A captura atual usa um único `<input type="file" accept="image/*" capture="environment">`, que sugere câmera em dispositivos compatíveis, mas não separa claramente câmera e galeria. A fotografia original é lida diretamente pelo OCR; uma URL temporária é usada para pré-visualização.
- O OCR carrega Tesseract.js 5 do jsDelivr sob demanda, inicializa o idioma `por` e OEM 1, reconhece o arquivo original e encerra o worker a cada leitura. O parser atual usa expressões regulares em texto linear para preços decimais, prefere o primeiro valor com `R$` (ou o primeiro número) e só sinaliza que há múltiplos valores. Não usa as caixas/posições das palavras, portanto não recompõe com confiabilidade reais e centavos impressos separados ou em tamanhos diferentes.
- O nome é escolhido por pontuação simples de linhas OCR; embalagem é extraída por uma expressão regular; produtos semelhantes usam sobreposição de palavras com limiar fixo de 0,35. A semelhança não protege contra atributos contraditórios, como versões com/sem lactose. Uma correspondência sugere atualização, mas não substitui a confirmação do usuário.
- `firebase-sync.js` usa autenticação anônima e Firestore (`onSnapshot`, `setDoc`, `updateDoc`), sem necessidade de alterar coleção, autenticação ou regras para os ajustes planejados. `save()` grava localmente e emite `shopping-local-change`; alterações de preço e quantidade chamam `save()` no evento `change`. `queueWrite()` compara os produtos e os encaminha a `setDoc` mesmo sem mudança no estado `done`/carrinho.
- Não foi feito teste nem escrita no Firebase de produção. Por inspeção, uma falha de escrita pode deixar valor em `pending` sem nova tentativa até outro evento de mudança. A fila serial também pode aguardar uma confirmação de rede antes de processar operações posteriores. A hipótese explica uma sincronização percebida como tardia, mas o relato em dois aparelhos não foi reproduzido e não é possível atribuir causa operacional sem validação no ambiente de homologação.
- `sw.js` usa cache versionado, `skipWaiting()`, `clients.claim()` e remove caches antigos com prefixo `minha-compra-`. Navegação usa rede primeiro e cache como fallback. `manifest.webmanifest` usa caminhos relativos (`./`) e escopo `./`, compatíveis com GitHub Pages em subcaminho. Não limpar `localStorage`, IndexedDB ou credenciais é compatível com a atualização proposta.

## Riscos e abordagem incremental

1. Separar funções puras de normalização, extração de preço/nome/embalagem e correspondência em um módulo local, com testes automatizados sem serviço pago.
2. Preparar a imagem a partir do arquivo original em canvas temporário; permitir câmera/galeria, recorte manual por toque, prévia, escala, contraste/brilho e correção manual de inclinação. Não persistir nem modificar o arquivo original.
3. Usar texto e caixas do OCR para identificar números decimais e pares reais/centavos em posições diferentes; mostrar candidatos concorrentes e deixar o preço vazio quando a leitura for ambígua ou inconclusiva.
4. Exibir revisão editável (nome, marca, embalagem/unidade, departamento, preço e quantidade), sugestões sem substituição automática e ações explícitas de atualizar, cadastrar ou cancelar. O cancelamento não deve chamar `save()`.
5. Manter autenticação, coleções e formato atual de produto; tentar novamente alterações locais pendentes quando a conexão voltar, sem depender de marcar item no carrinho. A validação com Firebase de produção não faz parte deste trabalho.
6. Atualizar parâmetros e cache do PWA por versão, mantendo paths relativos e dados locais.

## Limitações da evidência inicial

A análise acima é estática. A captura em câmera/galeria, recorte por toque, OCR de uma fotografia real da etiqueta Knorr, sincronização em dois dispositivos Android e atualização de uma instalação existente precisam de homologação manual em aparelho Motorola. Sem a fotografia de teste, os testes automatizados do parser devem usar amostras textuais/geométricas sintéticas e não comprovam a leitura daquela imagem real.

## Atualização após os testes locais da implementação

A hipótese de falha no reenvio não era a única causa. O teste de integração com Firestore simulado reproduziu o problema principal: `applyRemote()` entregava a `displayedItems` referências aos mesmos objetos mutáveis usados pela interface (`bridge.apply`). Ao editar preço ou quantidade, o objeto de comparação já continha o valor alterado, e `queueWrite()` concluía que nada havia mudado. A correção mantém snapshots independentes (`plain(item)`) para a comparação local/remote. O teste mock passou a observar `setDoc` no evento de alteração de preço, com `done=false`, sem marcar produto no carrinho.

Também foi testada uma falha temporária simulada: o valor ficou pendente, e o evento `online` reenviou a gravação pendente. O listener não foi alterado para reescrever dados em cada snapshot, evitando repetição de gravações. A autenticação, os caminhos/coleções e o formato existente dos documentos foram preservados; marca e unidade são incorporadas aos campos textuais já existentes no produto, sem novo campo no Firestore.

**Limite da evidência:** esses testes usaram mock local e não abriram sessão nem gravaram dados no Firebase de produção. A sincronização entre dois aparelhos reais ainda precisa de homologação manual.
