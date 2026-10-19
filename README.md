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
- **Operações completas** — Retorno, Novos registros e preenchimento Manual com paginação de registros.
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
3. Escolha **Retorno**, **Novos registros** ou **Manual**.
4. Mapeie os campos e configure fórmulas no painel lateral ou no modal.
5. Gere, revise e exporte o XML.

O modo Manual começa com um registro, permite adicionar outros por páginas e exporta somente os registros confirmados.

Em **Retorno**, use **+ Adicionar retorno** para criar outros modelos XML, cada um com seus vínculos, fórmulas, cabeçalhos e nome de arquivo. O seletor abaixo do XML de saída permite alternar o modelo em edição, renomear e excluir com confirmação. Em **Retornos**, no topo, marque os modelos desejados antes de gerar: um modelo é exportado como XML; vários são baixados juntos em um ZIP. A quantidade fica ao lado de **Gerar** e, no retorno, corresponde aos registros da entrada.

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
