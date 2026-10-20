# MockAíZé

![GitHub repo size](https://img.shields.io/github/repo-size/devphpaulo/MockAiZe?style=for-the-badge)
![GitHub language count](https://img.shields.io/github/languages/count/devphpaulo/MockAiZe?style=for-the-badge)
![GitHub last commit](https://img.shields.io/github/last-commit/devphpaulo/MockAiZe?style=for-the-badge)
![GitHub license](https://img.shields.io/github/license/devphpaulo/MockAiZe?style=for-the-badge)

<p align="center">
  <img src="app/mockaize-favicon.png" alt="Logo MockAíZé" width="128">
</p>

MockAíZé é um gerador local de mocks XML para Windows. Ele permite importar uma estrutura XML, configurar regras de geração, mapear campos, criar fórmulas e exportar arquivos de teste sem enviar dados para a nuvem.

## Por que usar

- **100% local** — XMLs, configurações, SQLite, snapshots e exports ficam em `Documentos\\MockAíZé`.
- **Estúdio visual** — XML de entrada e saída lado a lado, vínculos por arrasto, linhas de conexão e inspetor de campos.
- **Operações completas** — Novos Registros, Retorno, Filtragem e preenchimento Manual, com paginação de registros.
- **Fórmulas reutilizáveis** — datas, valores aleatórios, sequenciais, concatenação, soma por grupos e cópia de regras entre campos.
- **Executável portátil** — um único `.exe` para Windows, gerado pelo GitHub Actions.
- **Privacidade total** — não usa `%AppData%`, `%LocalAppData%` nem serviços remotos para armazenar o produto.

## Requisitos

- **Executável:** Windows 10/11.
- **Código-fonte:** Python 3.11 ou mais recente.

## Instalação

Baixe o executável versionado na aba [Actions](https://github.com/devphpaulo/MockAiZe/actions), abra a execução **Build** e baixe o artefato `mockaize-windows-portable`.

Ou rode a partir do código-fonte:

```powershell
git clone https://github.com/devphpaulo/MockAiZe.git
cd MockAiZe/app
py run.py
```

O aplicativo abre a interface no navegador padrão e permanece disponível na bandeja do Windows.

## Uso

1. Crie ou selecione um workspace.
2. Cole ou importe o XML de entrada.
3. Escolha **Novos Registros**, **Retorno**, **Filtragem** ou **Manual**.
4. Mapeie os campos e configure fórmulas no painel lateral ou no modal.
5. Gere, revise e exporte o XML.

O modo Manual começa com um registro, permite adicionar outros por páginas e exporta somente os registros confirmados. O botão **ƒ Nome do arquivo** alterna o painel esquerdo entre preenchimento e fórmula do nome. A fórmula pode usar os valores preenchidos e a quantidade de registros, permanece salva e define o nome do XML exportado.

Em **Filtragem**, selecione o grupo do XML de entrada e combine condições de presença, ausência ou valor de campos. A partir da segunda condição, escolha **E** ou **OU** entre cada par e mantenha ou exclua os grupos correspondentes. **E** tem prioridade sobre **OU**: `Condição 1 E Condição 2 OU Condição 3` equivale a `(Condição 1 E Condição 2) OU Condição 3`. A tela mostra a combinação com parênteses; presets antigos mantêm a combinação original. Os filtros ficam no painel esquerdo e atualizam o XML completo à direita em tempo real, preservando os cabeçalhos marcados e a estrutura externa ao grupo. **Versão anterior** mostra o XML original com as linhas dos grupos excluídos em vermelho claro; os botões **−/+** recolhem ou expandem as tags apenas na tela Filtragem. Use **Salvar configuração** para guardar as condições. O botão **ƒ Nome do arquivo** alterna o painel esquerdo entre os filtros e o editor de fórmula do nome, compartilhando os geradores dos modos Retorno e Novos registros. A fórmula pode combinar campos da entrada, valores do XML filtrado, datas, sequenciais e a quantidade mantida; ela também é guardada nos presets. **Exportar XML** baixa o documento filtrado completo, inclusive quando nenhum grupo permanece. As condições e o XML de entrada ficam salvos separadamente das demais operações. Em **Preset do filtro**, salve combinações com nomes próprios e selecione-as pelo combobox com pesquisa. Cada arquivo mantém seus presets; você pode atualizar, renomear ou excluir com confirmação. A exportação PS1 + BAT continua disponível para Retorno e Novos registros.

Em **Retorno**, use **+ Adicionar retorno** para criar outros modelos XML, cada um com seus vínculos, fórmulas, cabeçalhos e nome de arquivo. O seletor abaixo do XML de saída permite alternar o modelo em edição, renomear e excluir com confirmação. Em **Retornos**, no topo, marque os modelos desejados antes de gerar: um modelo é exportado como XML; vários são baixados juntos em um ZIP. A quantidade e o botão **Gerar** ficam na barra inferior, depois do nome do arquivo; no retorno, a quantidade corresponde aos registros da entrada. O indicador circular fica vermelho sem arquivo gerado, laranja após alterações e verde quando o resultado está pronto para exportar.

## Build no Windows

O workflow [Build](.github/workflows/build.yml) executa no `windows-latest`, empacota o aplicativo com PyInstaller e publica somente o executável portátil como artefato. Também pode ser iniciado manualmente pelo botão **Run workflow**.

Para gerar localmente:

```powershell
cd app
.\\tools\\build.ps1
```

O resultado fica sempre em `app\\dist\\MockAiZe-<versão>.exe`. A pasta `dist` não recebe `.pkg` ou DLLs ao lado do executável.

## Verificações locais

```powershell
cd app
py -m unittest discover -s tests -v
node --check mockaize/web/app.js
node --check mockaize/web/engine.js
```

## Estrutura

- `app/mockaize/` — aplicação Python e interface web.
- `app/packaging/` — especificação PyInstaller e metadados do executável.
- `app/tests/` — testes automatizados.
- `app/tools/` — scripts de execução, build e preview.
- `app/assets/` — recursos do projeto.

## Contribuição

Contribuições são bem-vindas. Abra uma issue com o objetivo da mudança ou envie um pull request com escopo claro e testes relevantes.

## Autor

**Paulo Henrique** — [@devphpaulo](https://github.com/devphpaulo)

## Licença

MIT — veja [LICENSE](LICENSE). Avisos de dependências estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
